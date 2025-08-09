import { Db, Collection, WithId, Document } from 'mongodb';
import { config } from '../config';
import { executeWithBreaker } from '../utils/breaker';

export interface EventEnvelope {
  eventId: string;
  type: string;
  version: number;
  occurredAt: string;
  producer: string;
  correlationId: string;
  payload: Record<string, any>;
}

export class EventsRepo {
  private col: Collection<EventEnvelope>;

  constructor(db: Db) {
    this.col = db.collection<EventEnvelope>('events');
  }

  async append(event: EventEnvelope): Promise<void> {
    const options = {
      timeout: config.DB_BREAKER_TIMEOUT_MS,
      resetTimeout: config.DB_BREAKER_RESET_TIMEOUT_MS,
      errorThresholdPercentage: config.DB_BREAKER_ERROR_THRESHOLD_PERCENT,
      volumeThreshold: config.DB_BREAKER_VOLUME_THRESHOLD,
    };
    await executeWithBreaker('db.events.append', async () => {
      try {
        await this.col.insertOne(event);
      } catch (err: any) {
        // Duplicate eventId → idempotent no-op
        if (err && (err.code === 11000 || err.code === 11001)) return;
        throw err;
      }
    }, options, config.DB_BREAKER_ENABLED);
  }

  async findByEventId(eventId: string): Promise<WithId<EventEnvelope> | null> {
    return this.col.findOne({ eventId });
  }
}
