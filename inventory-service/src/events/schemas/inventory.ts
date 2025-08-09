import { z } from 'zod';
import { EventEnvelopeBaseV1 } from './common';

export const InventoryReserveApprovedV1Schema = EventEnvelopeBaseV1.extend({
  type: z.literal('inventory.reserve.approved'),
  payload: z.object({
    orderId: z.string().min(1),
    reservationId: z.string().min(1),
  }),
});
export type InventoryReserveApprovedV1 = z.infer<typeof InventoryReserveApprovedV1Schema>;

export const InventoryReserveRejectedV1Schema = EventEnvelopeBaseV1.extend({
  type: z.literal('inventory.reserve.rejected'),
  payload: z.object({
    orderId: z.string().min(1),
    reason: z.string().min(1),
  }),
});
export type InventoryReserveRejectedV1 = z.infer<typeof InventoryReserveRejectedV1Schema>;
