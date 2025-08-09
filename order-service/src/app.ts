import { config } from './config';
import logger from './logger';
import { createServer } from './http/server';
import { connectRabbit, closeRabbit, MQ } from './mq/connection';
import { MessageBus } from './mq/bus';
import { connectMongo, closeMongo, Mongo } from './db/mongo';
import { EventsRepo } from './repositories/eventsRepo';
import { OrdersRepo } from './repositories/ordersRepo';
import registerOrderRoutes from './http/routes';
import { InventoryReserveApprovedV1Schema, InventoryReserveRejectedV1Schema } from './events/schemas/inventory';
import { buildReadiness } from './health/readiness';

let mq: MQ | null = null;
let bus: MessageBus | null = null;
let mongo: Mongo | null = null;
let eventsRepo: EventsRepo | null = null;
let ordersRepo: OrdersRepo | null = null;

function getDeps() {
  if (bus && eventsRepo && ordersRepo) {
    return { bus, eventsRepo, ordersRepo };
  }
  return null;
}

async function liveness(): Promise<boolean> {
  // Process is up
  return true;
}

const readiness = buildReadiness(() => ({ mq, mongo }));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let consumersBound = false;

async function bindConsumers() {
  if (!bus) return;
  const handleApproved = async (msg: any, _raw: any, { ack, dlq, retry }: any) => {
    try {
      const parsed = InventoryReserveApprovedV1Schema.safeParse(msg);
      if (!parsed.success) {
        logger.warn({ reason: parsed.error.flatten() }, '[Order] invalid approved schema → DLQ');
        return dlq();
      }
      const evt = parsed.data;
      const { orderId, reservationId } = evt.payload;
      // Persist status and append event (idempotent on eventId)
      try { await ordersRepo!.updateStatus(orderId, 'CONFIRMED'); } catch (e) { logger.warn({ e, orderId }, '[Order] updateStatus CONFIRMED failed'); }
      try { await eventsRepo!.append(evt as any); } catch (e) { logger.warn({ e, eventId: (evt as any)?.eventId }, '[Order] append approved event failed'); }
      logger.info({ orderId, reservationId }, '[Order] inventory approved → set status CONFIRMED');
      ack();
    } catch (err) {
      logger.error({ err }, '[Order] approved handler error');
      retry();
    }
  };

  const handleRejected = async (msg: any, _raw: any, { ack, dlq, retry }: any) => {
    try {
      const parsed = InventoryReserveRejectedV1Schema.safeParse(msg);
      if (!parsed.success) {
        logger.warn({ reason: parsed.error.flatten() }, '[Order] invalid rejected schema → DLQ');
        return dlq();
      }
      const evt = parsed.data;
      const { orderId, reason } = evt.payload;
      // Persist status and append event (idempotent on eventId)
      try { await ordersRepo!.updateStatus(orderId, 'REJECTED'); } catch (e) { logger.warn({ e, orderId }, '[Order] updateStatus REJECTED failed'); }
      try { await eventsRepo!.append(evt as any); } catch (e) { logger.warn({ e, eventId: (evt as any)?.eventId }, '[Order] append rejected event failed'); }
      logger.info({ orderId, reason }, '[Order] inventory rejected → set status REJECTED');
      ack();
    } catch (err) {
      logger.error({ err }, '[Order] rejected handler error');
      retry();
    }
  };

  await bus.consume('inventory.reserve.approved.q', handleApproved);
  await bus.consume('inventory.reserve.rejected.q', handleRejected);
  consumersBound = true;
}

async function startInfraAndConsumersWithRetry() {
  let attempt = 0;
  while (!bus || !mongo || !eventsRepo || !ordersRepo || !consumersBound) {
    try {
      if (!bus) {
        // Connect RabbitMQ (has internal retry)
        mq = await connectRabbit(config.RABBITMQ_URL, config.PREFETCH || 1);
        bus = new MessageBus(mq.ch, config.SERVICE_NAME);
      }
      if (!mongo) {
        mongo = await connectMongo(config.MONGO_URL);
        eventsRepo = new EventsRepo(mongo.db);
        ordersRepo = new OrdersRepo(mongo.db);
      }
      if (!consumersBound) {
        await bindConsumers();
      }
      logger.info('Order infra and consumers started');
      break;
    } catch (err) {
      attempt++;
      logger.error({ err, attempt }, '[Order] failed to start infra/consumers; will retry');
      // Cleanup partials
      try { await closeMongo(mongo); } catch {}
      mongo = null; eventsRepo = null; ordersRepo = null; consumersBound = false;
      const backoff = Math.min(30000, 1000 * 2 ** attempt);
      await sleep(backoff);
    }
  }
}

const app = createServer(liveness, readiness);

// Mount routes unconditionally; handlers will return 503 if not ready
registerOrderRoutes(app, getDeps);

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, service: config.SERVICE_NAME }, 'Service started');
  // Initialize infra (MQ + Mongo) and start consumers with retry in background
  void startInfraAndConsumersWithRetry();
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    logger.info('HTTP server closed');
    try { await closeRabbit(mq); } catch {}
    try { await closeMongo(mongo); } catch {}
    process.exit(0);
  });
  // Force exit if not closed in time
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
