import { z } from 'zod';
import { EventEnvelopeBaseV1 } from './common';

export const NotificationSentV1Schema = EventEnvelopeBaseV1.extend({
  type: z.literal('notification.sent'),
  payload: z.object({
    orderId: z.string().min(1),
    kind: z.enum(['order_created', 'order_confirmed', 'order_rejected', 'order_cancelled']),
    channel: z.string().min(1),
  }),
});
export type NotificationSentV1 = z.infer<typeof NotificationSentV1Schema>;
