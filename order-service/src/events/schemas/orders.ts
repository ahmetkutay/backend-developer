import { z } from 'zod';
import { EventEnvelopeBaseV1 } from './common';

export const OrderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
});

export const OrdersCreatedV1Schema = EventEnvelopeBaseV1.extend({
  type: z.literal('orders.created'),
  payload: z.object({
    orderId: z.string().min(1),
    customerId: z.string().min(1),
    items: z.array(OrderItemSchema).min(1),
    total: z.number().positive(),
  }),
});
export type OrdersCreatedV1 = z.infer<typeof OrdersCreatedV1Schema>;

export const OrdersCancelledV1Schema = EventEnvelopeBaseV1.extend({
  type: z.literal('orders.cancelled'),
  payload: z.object({
    orderId: z.string().min(1),
    reason: z.string().min(1),
  }),
});
export type OrdersCancelledV1 = z.infer<typeof OrdersCancelledV1Schema>;
