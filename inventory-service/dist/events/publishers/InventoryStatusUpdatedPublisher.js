"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishInventoryStatusUpdated = exports.InventoryStatusUpdatedPublisher = exports.INVENTORY_STATUS_UPDATED_QUEUE = void 0;
const rabbitmq_1 = require("../../rabbitmq");
exports.INVENTORY_STATUS_UPDATED_QUEUE = 'inventory.status.updated';
class InventoryStatusUpdatedPublisher {
    static async publish(inventoryStatus) {
        try {
            const eventMessage = {
                eventType: 'inventory.status.updated',
                eventId: `inventory-status-${inventoryStatus.orderId}-${Date.now()}`,
                timestamp: new Date().toISOString(),
                version: '1.0.0',
                data: inventoryStatus,
            };
            await (0, rabbitmq_1.publishMessage)(exports.INVENTORY_STATUS_UPDATED_QUEUE, eventMessage);
            console.log(`✅ Inventory status updated event published successfully for order ID: ${inventoryStatus.orderId}`);
            console.log(`📊 Status: ${inventoryStatus.status.toUpperCase()}, Items checked: ${inventoryStatus.items.length}`);
        }
        catch (error) {
            console.error(`❌ Failed to publish inventory status updated event for order ID: ${inventoryStatus.orderId}`, error);
            throw new Error(`Failed to publish inventory status updated event: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static async publishBatch(inventoryStatuses) {
        try {
            const publishPromises = inventoryStatuses.map(inventoryStatus => this.publish(inventoryStatus));
            await Promise.all(publishPromises);
            console.log(`✅ Batch published ${inventoryStatuses.length} inventory status updated events successfully`);
        }
        catch (error) {
            console.error('❌ Failed to publish batch inventory status updated events', error);
            throw new Error(`Failed to publish batch inventory status updated events: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static async publishSimpleStatus(orderId, status) {
        const inventoryStatus = {
            orderId,
            status,
            items: [],
            checkedAt: new Date().toISOString()
        };
        await this.publish(inventoryStatus);
    }
}
exports.InventoryStatusUpdatedPublisher = InventoryStatusUpdatedPublisher;
const publishInventoryStatusUpdated = async (inventoryStatus) => {
    return InventoryStatusUpdatedPublisher.publish(inventoryStatus);
};
exports.publishInventoryStatusUpdated = publishInventoryStatusUpdated;
//# sourceMappingURL=InventoryStatusUpdatedPublisher.js.map