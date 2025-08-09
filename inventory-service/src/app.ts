import { config } from './config';
import logger from './logger';
import { createServer } from './http/server';
import { connectRabbit, closeRabbit, MQ } from './mq/connection';
import { MessageBus } from './mq/bus';
import { randomUUID } from 'crypto';
import { OrdersCreatedV1Schema, OrdersCancelledV1Schema } from './events/schemas/orders';
import { InventoryReserveApprovedV1Schema, InventoryReserveRejectedV1Schema } from './events/schemas/inventory';
import { connectMongo, closeMongo, Mongo } from './db/mongo';
import { EventsRepo } from './repositories/eventsRepo';
import { buildReadiness } from './health/readiness';

let mq: MQ | null = null;
let bus: MessageBus | null = null;
let mongo: Mongo | null = null;
let eventsRepo: EventsRepo | null = null;

async function liveness(): Promise<boolean> { return true; }

// readiness is built from health module
const readiness = buildReadiness(() => ({ mq, mongo }));

async function startConsumers() {
  try {
    mq = await connectRabbit(config.RABBITMQ_URL, config.PREFETCH || 1);
    bus = new MessageBus(mq.ch, config.SERVICE_NAME);

    // Connect Mongo and init repositories
    mongo = await connectMongo(config.MONGO_URL);
    eventsRepo = new EventsRepo(mongo.db);
    try { await eventsRepo.ensureIndexes(); } catch (e) { logger.warn({ e }, '[Inventory] ensureIndexes failed'); }

    await bus.consume('order.created.q', async (msg: any, raw, { ack, retry, dlq }) => {
      try {
        const parsed = OrdersCreatedV1Schema.safeParse(msg);
        if (!parsed.success) {
          logger.warn({ reason: parsed.error.flatten() }, '[Inventory] invalid orders.created schema → DLQ');
          return dlq();
        }
        const evt = parsed.data;

        // Append incoming event (idempotent)
        try { await eventsRepo!.append(evt as any); } catch (e) { logger.warn({ e, eventId: (evt as any)?.eventId }, '[Inventory] append incoming orders.created failed'); }

        const orderId = evt.payload.orderId;
        const totalQty = evt.payload.items.reduce((s, it) => s + it.quantity, 0);

        const approved = totalQty > 0 && totalQty <= 10;
        const route = approved ? 'inventory.reserve.approved.v1' : 'inventory.reserve.rejected.v1';
        const event = approved
          ? {
              eventId: randomUUID(),
              type: 'inventory.reserve.approved',
              version: 1,
              occurredAt: new Date().toISOString(),
              producer: config.SERVICE_NAME,
              correlationId: evt.correlationId || raw.properties?.headers?.['x-correlation-id'] || orderId || randomUUID(),
              payload: {
                orderId,
                reservationId: `res_${randomUUID().slice(0, 8)}`,
              },
            }
          : {
              eventId: randomUUID(),
              type: 'inventory.reserve.rejected',
              version: 1,
              occurredAt: new Date().toISOString(),
              producer: config.SERVICE_NAME,
              correlationId: evt.correlationId || raw.properties?.headers?.['x-correlation-id'] || orderId || randomUUID(),
              payload: {
                orderId,
                reason: 'insufficient_stock',
              },
            };

        // Validate outgoing event against schema before publish
        const outParsed = approved
          ? InventoryReserveApprovedV1Schema.safeParse(event as any)
          : InventoryReserveRejectedV1Schema.safeParse(event as any);
        if (!outParsed.success) {
          logger.error({ details: outParsed.error.flatten(), approved }, '[Inventory] invalid outgoing inventory event envelope; skip publish');
          ack();
          return;
        }
        const validEvent = outParsed.data as any;

        await bus!.publish('inventory', route, validEvent, {
          'x-group-id': orderId,
          'x-correlation-id': validEvent.correlationId,
        });

        // Append outgoing event (idempotent)
        try { await eventsRepo!.append(validEvent as any); } catch (e) { logger.warn({ e, eventId: (validEvent as any)?.eventId }, '[Inventory] append outgoing inventory event failed'); }

        logger.info({ orderId, approved, route }, '[Inventory] processed order');
        ack();
      } catch (err) {
        logger.error({ err }, '[Inventory] handler error');
        retry();
      }
    });

    // orders.cancelled → simulate restock
    await bus.consume('orders.cancelled.q', async (msg: any, raw, { ack, retry, dlq }) => {
      try {
        const parsed = OrdersCancelledV1Schema.safeParse(msg);
        if (!parsed.success) {
          logger.warn({ reason: parsed.error.flatten() }, '[Inventory] invalid orders.cancelled schema → DLQ');
          return dlq();
        }
        const evt = parsed.data;
        // Append incoming event (idempotent)
        try { await eventsRepo!.append(evt as any); } catch (e) { logger.warn({ e, eventId: (evt as any)?.eventId }, '[Inventory] append incoming orders.cancelled failed'); }
        const orderId = evt.payload.orderId;
        const corr = evt.correlationId || raw?.properties?.headers?.['x-correlation-id'] || `corr-${orderId}`;
        // Restock simulation (no-op business logic)
        logger.info({ orderId, corr }, '[Inventory] order cancelled → restock simulated');
        ack();
      } catch (err) {
        logger.error({ err }, '[Inventory] orders.cancelled handler error');
        retry();
      }
    });

    logger.info('Inventory consumers started');
  } catch (err) {
    logger.error({ err }, '[Inventory] failed to start consumers');
  }
}

const app = createServer(liveness, readiness);

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, service: config.SERVICE_NAME }, 'Service started');
  // Start consumers in background
  void startConsumers();
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(async () => {
    logger.info('HTTP server closed');
    try { await closeRabbit(mq); } catch {}
    try { await closeMongo(mongo); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
