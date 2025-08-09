import { Db, Collection, WithId } from 'mongodb';
import { config } from '../config';
import { executeWithBreaker } from '../utils/breaker';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderDoc {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export class OrdersRepo {
  private col: Collection<OrderDoc>;

  constructor(db: Db) {
    this.col = db.collection<OrderDoc>('orders');
  }

  async create(doc: OrderDoc): Promise<WithId<OrderDoc>> {
    const options = {
      timeout: config.DB_BREAKER_TIMEOUT_MS,
      resetTimeout: config.DB_BREAKER_RESET_TIMEOUT_MS,
      errorThresholdPercentage: config.DB_BREAKER_ERROR_THRESHOLD_PERCENT,
      volumeThreshold: config.DB_BREAKER_VOLUME_THRESHOLD,
    };
    return executeWithBreaker('db.orders.create', async () => {
      try {
        const res = await this.col.insertOne(doc);
        return { _id: res.insertedId, ...doc } as WithId<OrderDoc>;
      } catch (err: any) {
        if (err && (err.code === 11000 || err.code === 11001)) {
          // duplicate orderId → fetch and return existing (idempotent)
          const existing = await this.col.findOne({ orderId: doc.orderId });
          if (existing) return existing as WithId<OrderDoc>;
        }
        throw err;
      }
    }, options, config.DB_BREAKER_ENABLED);
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<void> {
    const options = {
      timeout: config.DB_BREAKER_TIMEOUT_MS,
      resetTimeout: config.DB_BREAKER_RESET_TIMEOUT_MS,
      errorThresholdPercentage: config.DB_BREAKER_ERROR_THRESHOLD_PERCENT,
      volumeThreshold: config.DB_BREAKER_VOLUME_THRESHOLD,
    };
    await executeWithBreaker('db.orders.updateStatus', async () => {
      await this.col.updateOne(
        { orderId },
        { $set: { status, updatedAt: new Date().toISOString() } }
      );
    }, options, config.DB_BREAKER_ENABLED);
  }

  async getById(orderId: string): Promise<WithId<OrderDoc> | null> {
    return this.col.findOne({ orderId });
  }
}
