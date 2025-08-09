import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import logger from '../../logger';
import { EventsRepo, EventEnvelope } from '../../repositories/eventsRepo';
import { OrdersRepo, OrderDoc, OrderItem } from '../../repositories/ordersRepo';
import { MessageBus } from '../../mq/bus';
import { OrdersCreatedV1Schema, OrdersCancelledV1Schema } from '../../events/schemas/orders';

const OrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

const CreateOrderSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(OrderItemSchema).min(1),
});

type CreateOrderBody = z.infer<typeof CreateOrderSchema>;

// Simple in-memory idempotency map (TTL 24h) — replace with Redis in prod
const IDEMP_TTL_MS = 24 * 60 * 60 * 1000;
const idempotencyMap = new Map<string, { orderId: string; expiresAt: number }>();
function setIdemp(key: string, orderId: string) {
  idempotencyMap.set(key, { orderId, expiresAt: Date.now() + IDEMP_TTL_MS });
}
function getIdemp(key: string): string | null {
  const rec = idempotencyMap.get(key);
  if (!rec) return null;
  if (rec.expiresAt < Date.now()) {
    idempotencyMap.delete(key);
    return null;
  }
  return rec.orderId;
}

export interface OrdersControllerDeps {
  bus: MessageBus;
  eventsRepo: EventsRepo;
  ordersRepo: OrdersRepo;
}

export function createOrdersController(getDeps: () => OrdersControllerDeps | null) {
  const createOrder = async (req: Request, res: Response) => {
    try {
      const deps = getDeps();
      if (!deps) {
        return res.status(503).json({ error: 'not_ready' });
      }
      const { bus, eventsRepo, ordersRepo } = deps;

      const bodyParse = CreateOrderSchema.safeParse(req.body);
      if (!bodyParse.success) {
        return res.status(400).json({ error: 'invalid_body', details: bodyParse.error.flatten() });
      }
      const body: CreateOrderBody = bodyParse.data;

      const idemKey = (req.header('Idempotency-Key') || req.header('idempotency-key') || '').trim();
      if (idemKey) {
        const existingOrderId = getIdemp(idemKey);
        if (existingOrderId) {
          // Return same response idempotently
          const existing = await ordersRepo.getById(existingOrderId);
          return res.status(200).json({ orderId: existingOrderId, status: existing?.status ?? 'PENDING', idempotent: true });
        }
      }

      const orderId = `ord_${randomUUID().slice(0, 8)}`;
      const total = body.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
      const now = new Date().toISOString();

      const orderDoc: OrderDoc = {
        orderId,
        customerId: body.customerId,
        items: body.items as OrderItem[],
        total,
        status: 'PENDING',
        createdAt: now,
        updatedAt: now,
      };

      // Persist read-model first
      await ordersRepo.create(orderDoc);

      const correlationId = req.header('x-correlation-id') || `corr-${randomUUID()}`;
      const event: EventEnvelope = {
        eventId: randomUUID(),
        type: 'orders.created',
        version: 1,
        occurredAt: now,
        producer: 'order-service',
        correlationId,
        payload: {
          orderId,
          customerId: body.customerId,
          items: body.items,
          total,
        },
      };

      // Validate event envelope against schema before append/publish
      const eventParse = OrdersCreatedV1Schema.safeParse(event as any);
      if (!eventParse.success) {
        logger.error({ details: eventParse.error.flatten() }, '[Order] invalid orders.created event envelope');
        return res.status(500).json({ error: 'invalid_event_envelope' });
      }
      const validEvent = eventParse.data as any;

      // Append event (idempotent on eventId)
      await eventsRepo.append(validEvent);
      // Publish event
      await bus.publish('orders', 'orders.created.v1', validEvent, {
        'x-group-id': orderId,
        'x-correlation-id': correlationId,
      });

      if (idemKey) setIdemp(idemKey, orderId);
      return res.status(201).json({ orderId, status: 'PENDING' });
    } catch (err) {
      logger.error({ err }, '[Order] createOrder failed');
      return res.status(500).json({ error: 'internal_error' });
    }
  };

  const cancelOrder = async (req: Request, res: Response) => {
    try {
      const deps = getDeps();
      if (!deps) {
        return res.status(503).json({ error: 'not_ready' });
      }
      const { bus, eventsRepo, ordersRepo } = deps;

      const orderId = String(req.params.id || '').trim();
      if (!orderId) return res.status(400).json({ error: 'invalid_order_id' });

      const reason = (req.body && typeof req.body.reason === 'string' && req.body.reason.trim()) || 'user_request';
      const now = new Date().toISOString();
      // Update read-model eagerly
      await ordersRepo.updateStatus(orderId, 'CANCELLED');

      const correlationId = req.header('x-correlation-id') || `corr-${randomUUID()}`;
      const event: EventEnvelope = {
        eventId: randomUUID(),
        type: 'orders.cancelled',
        version: 1,
        occurredAt: now,
        producer: 'order-service',
        correlationId,
        payload: { orderId, reason },
      };

      // Validate event envelope against schema before append/publish
      const eventParse = OrdersCancelledV1Schema.safeParse(event as any);
      if (!eventParse.success) {
        logger.error({ details: eventParse.error.flatten() }, '[Order] invalid orders.cancelled event envelope');
        return res.status(500).json({ error: 'invalid_event_envelope' });
      }
      const validEvent = eventParse.data as any;

      await eventsRepo.append(validEvent);
      await bus.publish('orders', 'orders.cancelled.v1', validEvent, {
        'x-group-id': orderId,
        'x-correlation-id': correlationId,
      });

      return res.status(202).json({ orderId, status: 'CANCELLED' });
    } catch (err) {
      logger.error({ err }, '[Order] cancelOrder failed');
      return res.status(500).json({ error: 'internal_error' });
    }
  };

  return { createOrder, cancelOrder };
}
