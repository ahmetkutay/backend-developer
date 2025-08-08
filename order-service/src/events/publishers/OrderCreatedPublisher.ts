import { publishMessage } from '../../rabbitmq';

// Queue name for order created events
export const ORDER_CREATED_QUEUE = 'order.created';

// Interface for order created event data
export interface OrderCreatedEvent {
  id: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

// Event wrapper for consistent message structure
export interface OrderCreatedEventMessage {
  eventType: 'order.created';
  eventId: string;
  timestamp: string;
  version: string;
  data: OrderCreatedEvent;
}

export class OrderCreatedPublisher {
  /**
   * Publishes an order created event to the RabbitMQ queue
   * @param orderData - The order data to publish
   * @returns Promise<void>
   */
  static async publishOrderCreated(orderData: OrderCreatedEvent): Promise<void> {
    try {
      // Create event message with metadata
      const eventMessage: OrderCreatedEventMessage = {
        eventType: 'order.created',
        eventId: `order-created-${orderData.id}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: orderData,
      };

      // Publish to RabbitMQ queue
      await publishMessage(ORDER_CREATED_QUEUE, eventMessage);

      console.log(`✅ Order created event published successfully for order ID: ${orderData.id}`);
    } catch (error) {
      console.error(`❌ Failed to publish order created event for order ID: ${orderData.id}`, error);
      throw new Error(`Failed to publish order created event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Publishes multiple order created events in batch
   * @param ordersData - Array of order data to publish
   * @returns Promise<void>
   */
  static async publishOrderCreatedBatch(ordersData: OrderCreatedEvent[]): Promise<void> {
    try {
      const publishPromises = ordersData.map(orderData => 
        this.publishOrderCreated(orderData)
      );

      await Promise.all(publishPromises);
      console.log(`✅ Batch published ${ordersData.length} order created events successfully`);
    } catch (error) {
      console.error('❌ Failed to publish batch order created events', error);
      throw new Error(`Failed to publish batch order created events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Convenience function for direct usage
export const publishOrderCreated = async (orderData: OrderCreatedEvent): Promise<void> => {
  return OrderCreatedPublisher.publishOrderCreated(orderData);
};