import { z } from 'zod';

export const EventEnvelopeBaseV1 = z.object({
  eventId: z.string().uuid(),
  type: z.string().min(1),
  version: z.literal(1),
  occurredAt: z.string().min(1), // ISO string
  producer: z.string().min(1),
  correlationId: z.string().min(1),
});

export type EventEnvelopeBaseV1 = z.infer<typeof EventEnvelopeBaseV1>;
