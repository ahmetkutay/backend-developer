import { publishMessage } from '../../rabbitmq';
import { InventoryStatusMessage } from '../consumers/OrderCreatedConsumer';

// Queue name for inventory status updated events
export const INVENTORY_STATUS_UPDATED_QUEUE = 'inventory.status.updated';

// Event wrapper for consistent message structure
export interface InventoryStatusUpdatedEventMessage {
  eventType: 'inventory.status.updated';
  eventId: string;
  timestamp: string;
  version: string;
  data: InventoryStatusMessage;
}

export class InventoryStatusUpdatedPublisher {
  /**
   * Publishes an inventory status updated event to the RabbitMQ queue
   * @param inventoryStatus - The inventory status data to publish
   * @returns Promise<void>
   */
  static async publish(inventoryStatus: InventoryStatusMessage): Promise<void> {
    try {
      // Create event message with metadata
      const eventMessage: InventoryStatusUpdatedEventMessage = {
        eventType: 'inventory.status.updated',
        eventId: `inventory-status-${inventoryStatus.orderId}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        data: inventoryStatus,
      };

      // Publish to RabbitMQ queue
      await publishMessage(INVENTORY_STATUS_UPDATED_QUEUE, eventMessage);

      console.log(`✅ Inventory status updated event published successfully for order ID: ${inventoryStatus.orderId}`);
      console.log(`📊 Status: ${inventoryStatus.status.toUpperCase()}, Items checked: ${inventoryStatus.items.length}`);
    } catch (error) {
      console.error(`❌ Failed to publish inventory status updated event for order ID: ${inventoryStatus.orderId}`, error);
      throw new Error(`Failed to publish inventory status updated event: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Publishes multiple inventory status updated events in batch
   * @param inventoryStatuses - Array of inventory status data to publish
   * @returns Promise<void>
   */
  static async publishBatch(inventoryStatuses: InventoryStatusMessage[]): Promise<void> {
    try {
      const publishPromises = inventoryStatuses.map(inventoryStatus => 
        this.publish(inventoryStatus)
      );

      await Promise.all(publishPromises);
      console.log(`✅ Batch published ${inventoryStatuses.length} inventory status updated events successfully`);
    } catch (error) {
      console.error('❌ Failed to publish batch inventory status updated events', error);
      throw new Error(`Failed to publish batch inventory status updated events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Publishes a simple availability status for an order
   * @param orderId - The order ID
   * @param status - The availability status
   * @returns Promise<void>
   */
  static async publishSimpleStatus(orderId: string, status: 'available' | 'out_of_stock'): Promise<void> {
    const inventoryStatus: InventoryStatusMessage = {
      orderId,
      status,
      items: [],
      checkedAt: new Date().toISOString()
    };

    await this.publish(inventoryStatus);
  }
}

// Convenience function for direct usage
export const publishInventoryStatusUpdated = async (inventoryStatus: InventoryStatusMessage): Promise<void> => {
  return InventoryStatusUpdatedPublisher.publish(inventoryStatus);
};