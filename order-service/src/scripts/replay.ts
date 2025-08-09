/*
 Order Service Replay Script
 Replays events from MongoDB events collection back to RabbitMQ.

 Usage examples:
   npm run replay -- --type=orders.created --orderId=ord_123
   npm run replay -- --from=2025-08-01T00:00:00Z --to=2025-08-10T23:59:59Z
   npm run replay -- --type=inventory.reserve.approved

 Filters:
   --type      exact event type (e.g., orders.created, inventory.reserve.approved)
   --orderId   payload.orderId equality filter
   --from      occurredAt >= ISO timestamp (e.g., 2025-08-09T00:00:00Z)
   --to        occurredAt <= ISO timestamp

 Notes:
 - occurredAt is stored as ISO8601 string; string comparison works for ranges.
 - Headers set: x-replay=true, x-correlation-id, x-group-id (orderId if present).
 */

import dotenv from 'dotenv';
dotenv.config();

import logger from '../logger';
import { config } from '../config';
import { connectMongo, closeMongo } from '../db/mongo';
import { connectRabbit, closeRabbit } from '../mq/connection';
import { MessageBus } from '../mq/bus';
import type { Db, Collection } from 'mongodb';

interface EventEnvelope {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string; // ISO string
  producer: string;
  correlationId: string;
  payload: Record<string, any>;
}

function parseArgs(argv: string[]) {
  const out: { [k: string]: string | boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) continue;
    a = a.slice(2);
    if (a.includes('=')) {
      const [k, v] = a.split(/=/, 2);
      out[k] = v;
    } else {
      const k = a;
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[k] = v;
    }
  }
  return {
    type: typeof out.type === 'string' ? (out.type as string) : undefined,
    orderId: typeof out.orderId === 'string' ? (out.orderId as string) : undefined,
    from: typeof out.from === 'string' ? (out.from as string) : undefined,
    to: typeof out.to === 'string' ? (out.to as string) : undefined,
    help: !!out.h || !!out.help,
  };
}

function usage() {
  // eslint-disable-next-line no-console
  console.log(`Replay usage:\n  npm run replay -- [--type=<eventType>] [--orderId=<id>] [--from=<ISO>] [--to=<ISO>]\n\nExamples:\n  npm run replay -- --type=orders.created --orderId=ord_abc123\n  npm run replay -- --from=2025-08-01T00:00:00Z --to=2025-08-09T23:59:59Z\n`);
}

function routingFor(evtType: string, version = 1): { exchange: string; routingKey: string } | null {
  // Map known event types to exchange/routing
  switch (evtType) {
    case 'orders.created':
      return { exchange: 'orders', routingKey: `orders.created.v${version}` };
    case 'orders.cancelled':
      return { exchange: 'orders', routingKey: `orders.cancelled.v${version}` };
    case 'inventory.reserve.requested':
      return { exchange: 'inventory', routingKey: `inventory.reserve.requested.v${version}` };
    case 'inventory.reserve.approved':
      return { exchange: 'inventory', routingKey: `inventory.reserve.approved.v${version}` };
    case 'inventory.reserve.rejected':
      return { exchange: 'inventory', routingKey: `inventory.reserve.rejected.v${version}` };
    case 'notification.sent':
      return { exchange: 'notifications', routingKey: `notification.sent.v${version}` };
    default:
      return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const mongo = await connectMongo(config.MONGO_URL);
  const db: Db = mongo.db;
  const col: Collection<EventEnvelope> = db.collection<EventEnvelope>('events');

  const query: any = {};
  if (args.type) query.type = args.type;
  if (args.orderId) query['payload.orderId'] = args.orderId;
  if (args.from || args.to) {
    query.occurredAt = {} as any;
    if (args.from) (query.occurredAt as any).$gte = args.from;
    if (args.to) (query.occurredAt as any).$lte = args.to;
  }

  const sort = { occurredAt: 1, eventId: 1 } as const;

  const mq = await connectRabbit(config.RABBITMQ_URL, 0);
  const bus = new MessageBus(mq.ch, config.SERVICE_NAME);

  let count = 0;
  const cursor = col.find(query).sort(sort);
  // eslint-disable-next-line no-restricted-syntax
  for await (const evt of cursor) {
    const route = routingFor(evt.type, evt.version || 1);
    if (!route) {
      logger.warn({ type: evt.type }, '[Replay] unknown event type, skipping');
      continue;
    }
    try {
      await bus.publish(route.exchange, route.routingKey, evt, {
        'x-replay': true,
        'x-correlation-id': evt.correlationId,
        'x-group-id': evt.payload?.orderId,
      });
      count++;
      if (count % 100 === 0) logger.info({ count }, '[Replay] published events');
    } catch (err) {
      logger.error({ err, evtId: evt.eventId, type: evt.type }, '[Replay] publish failed');
    }
  }

  logger.info({ count, query }, '[Replay] done');
  await closeRabbit({ conn: (bus as any).ch?.connection, ch: (bus as any).ch } as any).catch(() => {});
  await closeMongo(mongo).catch(() => {});
}

main().catch((err) => {
  logger.error({ err }, '[Replay] fatal error');
  process.exit(1);
});
