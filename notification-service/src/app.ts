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

let mq: MQ | null = null;
let bus: MessageBus | null = null;
let mongo: Mongo | null = null;
let eventsRepo: EventsRepo | null = null;

async function liveness(): Promise<boolean> { return true; }

async function readiness(): Promise<boolean> {
  if (!bus || !mongo) return false;
  const timeout = config.READY_TIMEOUT_MS || 1500;
  const withTimeout = async <T>(p: Promise<T>): Promise<T> => {
    return await Promise.race<T>([
      p,
      new Promise<T>((_r, rej) => setTimeout(() => rej(new Error('ready_timeout')), timeout)) as Promise<T>,
    ]);
  };
  try {
    await withTimeout(mongo.db.command({ ping: 1 }) as any);
    const q = config.READY_RMQ_CHECK_QUEUE || 'orders.created.notification.q';
    await withTimeout((mq as any)?.ch.checkQueue(q));
    return true;
  } catch (e) {
    logger.warn({ e }, '[Notification] readiness check failed');
    return false;
  }
}

async function startConsumers() {
  try {
    mq = await connectRabbit(config.RABBITMQ_URL, config.PREFETCH || 1);
    bus = new MessageBus(mq.ch, config.SERVICE_NAME);

    // Connect Mongo and init repository
    mongo = await connectMongo(config.MONGO_URL);
    eventsRepo = new EventsRepo(mongo.db);
    try { await eventsRepo.ensureIndexes(); } catch (e) { logger.warn({ e }, '[Notification] ensureIndexes failed'); }

    const publishNotification = async (
      kind: 'order_created' | 'order_confirmed' | 'order_rejected' | 'order_cancelled',
      orderId: string,
      correlationId?: string
    ) => {
      const event = {
        eventId: randomUUID(),
        type: 'notification.sent',
        version: 1,
        occurredAt: new Date().toISOString(),
        producer: config.SERVICE_NAME,
        correlationId: correlationId || `corr-${randomUUID()}`,
        payload: {
          orderId,
          kind,
          channel: 'log',
        },
      };
      await bus!.publish('notifications', 'notification.sent.v1', event, {
        'x-correlation-id': event.correlationId,
        'x-group-id': orderId,
      });
      // Append outgoing event (idempotent)
      try { await eventsRepo!.append(event as any); } catch (e) { logger.warn({ e, eventId: (event as any)?.eventId }, '[Notification] append outgoing notification event failed'); }
      logger.info({ orderId, kind }, '[Notification] sent');
    };

    // orders.created → send created notification
    await bus.consume('orders.created.notification.q', async (msg: any, raw: any, { ack, dlq, retry }) => {
      try {
        const parsed = OrdersCreatedV1Schema.safeParse(msg);
        if (!parsed.success) {
          logger.warn({ reason: parsed.error.flatten() }, '[Notification] invalid orders.created schema → DLQ');
          return dlq();
        }
        const evt = parsed.data;
        // Append incoming event (idempotent)
        try { await eventsRepo!.append(evt as any); } catch (e) { logger.warn({ e, eventId: (evt as any)?.eventId }, '[Notification] append incoming orders.created failed'); }
        const orderId = evt.payload.orderId;
        const corr = evt.correlationId || raw?.properties?.headers?.['x-correlation-id'] || `corr-${randomUUID()}`;
        await publishNotification('order_created', orderId, corr);
        ack();
      } catch (err) {
        logger.error({ err }, '[Notification] orders.created handler error');
        retry();
      }
    });

    // inventory.reserve.approved → send confirmed notification
    await bus.consume('inventory.reserve.approved.notification.q', async (msg: any, raw: any, { ack, dlq, retry }) => {
      try {
        const parsed = InventoryReserveApprovedV1Schema.safeParse(msg);
        if (!parsed.success) {
          logger.warn({ reason: parsed.error.flatten() }, '[Notification] invalid inventory.reserve.approved schema → DLQ');
          return dlq();
        }
        const evt = parsed.data;
        // Append incoming event (idempotent)
        try { await eventsRepo!.append(evt as any); } catch (e) { logger.warn({ e, eventId: (evt as any)?.eventId }, '[Notification] append incoming inventory.approved failed'); }
        const orderId = evt.payload.orderId;
        const corr = evt.correlationId || raw?.properties?.headers?.['x-correlation-id'] || `corr-${randomUUID()}`;
        await publishNotification('order_confirmed', orderId, corr);
        ack();
      } catch (err) {
        logger.error({ err }, '[Notification] approved handler error');
        retry();
      }
    });

    // inventory.reserve.rejected → send rejected notification
    await bus.consume('inventory.reserve.rejected.notification.q', async (msg: any, raw: any, { ack, dlq, retry }) => {
      try {
        const parsed = InventoryReserveRejectedV1Schema.safeParse(msg);
        if (!parsed.success) {
          logger.warn({ reason: parsed.error.flatten() }, '[Notification] invalid inventory.reserve.rejected schema → DLQ');
          return dlq();
        }
        const evt = parsed.data;
        // Append incoming event (idempotent)
        try { await eventsRepo!.append(evt as any); } catch (e) { logger.warn({ e, eventId: (evt as any)?.eventId }, '[Notification] append incoming inventory.rejected failed'); }
        const orderId = evt.payload.orderId;
        const corr = evt.correlationId || raw?.properties?.headers?.['x-correlation-id'] || `corr-${randomUUID()}`;
        await publishNotification('order_rejected', orderId, corr);
        ack();
      } catch (err) {
        logger.error({ err }, '[Notification] rejected handler error');
        retry();
      }
    });

    // orders.cancelled → send cancelled notification
    await bus.consume('orders.cancelled.notification.q', async (msg: any, raw: any, { ack, dlq, retry }) => {
      try {
        const parsed = OrdersCancelledV1Schema.safeParse(msg);
        if (!parsed.success) {
          logger.warn({ reason: parsed.error.flatten() }, '[Notification] invalid orders.cancelled schema → DLQ');
          return dlq();
        }
        const evt = parsed.data;
        // Append incoming event (idempotent)
        try { await eventsRepo!.append(evt as any); } catch (e) { logger.warn({ e, eventId: (evt as any)?.eventId }, '[Notification] append incoming orders.cancelled failed'); }
        const orderId = evt.payload.orderId;
        const corr = evt.correlationId || raw?.properties?.headers?.['x-correlation-id'] || `corr-${randomUUID()}`;
        await publishNotification('order_cancelled', orderId, corr);
        ack();
      } catch (err) {
        logger.error({ err }, '[Notification] orders.cancelled handler error');
        retry();
      }
    });

    logger.info('Notification consumers started');
  } catch (err) {
    logger.error({ err }, '[Notification] failed to start consumers');
  }
}

const app = createServer(liveness, readiness);

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, service: config.SERVICE_NAME }, 'Service started');
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
