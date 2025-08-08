"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderCreatedConsumer = void 0;
const rabbitmq_1 = require("../../rabbitmq");
const products_1 = require("../../data/products");
const InventoryStatusUpdatedPublisher_1 = require("../publishers/InventoryStatusUpdatedPublisher");
class OrderCreatedConsumer {
    static async startConsuming() {
        console.log('🎯 Starting OrderCreatedConsumer...');
        try {
            await (0, rabbitmq_1.consumeMessage)(this.QUEUE_NAME, this.processOrderCreatedMessage.bind(this));
        }
        catch (error) {
            console.error('❌ Failed to start OrderCreatedConsumer:', error);
            throw error;
        }
    }
    static async processOrderCreatedMessage(message) {
        console.log(`🔍 Processing order created message for order: ${message.orderId}`);
        try {
            if (!this.validateMessage(message)) {
                console.error('❌ Invalid message structure:', message);
                return;
            }
            const inventoryStatus = await this.checkInventoryStatus(message);
            await InventoryStatusUpdatedPublisher_1.InventoryStatusUpdatedPublisher.publish(inventoryStatus);
            console.log(`✅ Successfully processed inventory check for order: ${message.orderId}`);
        }
        catch (error) {
            console.error(`❌ Error processing order created message for order ${message.orderId}:`, error);
            throw error;
        }
    }
    static validateMessage(message) {
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
        for (const item of message.items) {
            if (!item.productId || typeof item.quantity !== 'number' || item.quantity <= 0) {
                console.error('❌ Invalid item structure:', item);
                return false;
            }
        }
        return true;
    }
    static async checkInventoryStatus(message) {
        console.log(`📋 Checking inventory for ${message.items.length} items in order ${message.orderId}`);
        const itemStatuses = [];
        let overallStatus = 'available';
        for (const item of message.items) {
            const product = products_1.InventoryManager.getProduct(item.productId);
            const isAvailable = products_1.InventoryManager.checkAvailability(item.productId, item.quantity);
            const itemStatus = {
                productId: item.productId,
                requestedQuantity: item.quantity,
                availableQuantity: product?.available || 0,
                status: isAvailable ? 'available' : 'out_of_stock'
            };
            itemStatuses.push(itemStatus);
            if (!isAvailable) {
                overallStatus = 'out_of_stock';
            }
        }
        const inventoryStatus = {
            orderId: message.orderId,
            status: overallStatus,
            items: itemStatuses,
            checkedAt: new Date().toISOString()
        };
        console.log(`📊 Inventory check result for order ${message.orderId}: ${overallStatus.toUpperCase()}`);
        if (overallStatus === 'available') {
            console.log(`🔒 Reserving stock for order ${message.orderId}`);
            for (const item of message.items) {
                products_1.InventoryManager.reserveStock(item.productId, item.quantity);
            }
        }
        return inventoryStatus;
    }
    static async stopConsuming() {
        console.log('🛑 Stopping OrderCreatedConsumer...');
    }
}
exports.OrderCreatedConsumer = OrderCreatedConsumer;
OrderCreatedConsumer.QUEUE_NAME = 'order.created';
//# sourceMappingURL=OrderCreatedConsumer.js.map