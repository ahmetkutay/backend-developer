import { consumeMessage } from '../../rabbitmq';
import { InventoryManager } from '../../data/products';
import { InventoryStatusUpdatedPublisher } from '../publishers/InventoryStatusUpdatedPublisher';

// Define the structure of the order created message
export interface OrderCreatedMessage {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

// Define the inventory status response
export interface InventoryStatusMessage {
  orderId: string;
  status: 'available' | 'out_of_stock';
  items: InventoryItemStatus[];
  checkedAt: string;
}

export interface InventoryItemStatus {
  productId: string;
  requestedQuantity: number;
  availableQuantity: number;
  status: 'available' | 'out_of_stock';
}

export class OrderCreatedConsumer {
  private static readonly QUEUE_NAME = 'order.created';

  /**
   * Start consuming order created messages
   */
  static async startConsuming(): Promise<void> {
    console.log('🎯 Starting OrderCreatedConsumer...');
    
    try {
      await consumeMessage(this.QUEUE_NAME, this.processOrderCreatedMessage.bind(this));
    } catch (error) {
      console.error('❌ Failed to start OrderCreatedConsumer:', error);
      throw error;
    }
  }

  /**
   * Process an order created message
   */
  private static async processOrderCreatedMessage(message: OrderCreatedMessage): Promise<void> {
    console.log(`🔍 Processing order created message for order: ${message.orderId}`);

    try {
      // Validate message structure
      if (!this.validateMessage(message)) {
        console.error('❌ Invalid message structure:', message);
        return;
      }

      // Check inventory for each item in the order
      const inventoryStatus = await this.checkInventoryStatus(message);

      // Publish inventory status update
      await InventoryStatusUpdatedPublisher.publish(inventoryStatus);

      console.log(`✅ Successfully processed inventory check for order: ${message.orderId}`);
    } catch (error) {
      console.error(`❌ Error processing order created message for order ${message.orderId}:`, error);
      throw error;
    }
  }

  /**
   * Validate the incoming message structure
   */
  private static validateMessage(message: any): message is OrderCreatedMessage {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const requiredFields = ['orderId', 'customerId', 'items', 'totalAmount', 'createdAt'];
    for (const field of requiredFields) {
      if (!(field in message)) {
        console.error(`❌ Missing required field: ${field}`);
        return false;
      }
    }

    if (!Array.isArray(message.items) || message.items.length === 0) {
      console.error('❌ Items must be a non-empty array');
      return false;
    }

    // Validate each item
    for (const item of message.items) {
      if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {
        console.error('❌ Invalid item structure:', item);
        return false;
      }
    }

    return true;
  }

  /**
   * Check inventory status for all items in the order
   */
  private static async checkInventoryStatus(message: OrderCreatedMessage): Promise<InventoryStatusMessage> {
    console.log(`📋 Checking inventory for ${message.items.length} items in order ${message.orderId}`);

    const itemStatuses: InventoryItemStatus[] = [];
    let overallStatus: 'available' | 'out_of_stock' = 'available';

    for (const item of message.items) {
      const product = InventoryManager.getProduct(item.productId);
      const isAvailable = InventoryManager.checkAvailability(item.productId, item.quantity);
      
      const itemStatus: InventoryItemStatus = {
        productId: item.productId,
        requestedQuantity: item.quantity,
        availableQuantity: product?.available || 0,
        status: isAvailable ? 'available' : 'out_of_stock'
      };

      itemStatuses.push(itemStatus);

      // If any item is out of stock, mark the entire order as out of stock
      if (!isAvailable) {
        overallStatus = 'out_of_stock';
      }
    }

    const inventoryStatus: InventoryStatusMessage = {
      orderId: message.orderId,
      status: overallStatus,
      items: itemStatuses,
      checkedAt: new Date().toISOString()
    };

    console.log(`📊 Inventory check result for order ${message.orderId}: ${overallStatus.toUpperCase()}`);
    
    // If all items are available, reserve the stock
    if (overallStatus === 'available') {
      console.log(`🔒 Reserving stock for order ${message.orderId}`);
      for (const item of message.items) {
        InventoryManager.reserveStock(item.productId, item.quantity);
      }
    }

    return inventoryStatus;
  }

  /**
   * Stop consuming messages (for graceful shutdown)
   */
  static async stopConsuming(): Promise<void> {
    console.log('🛑 Stopping OrderCreatedConsumer...');
    // Note: The actual stopping logic would depend on how we want to handle graceful shutdown
    // For now, we'll just log the intention
  }
}