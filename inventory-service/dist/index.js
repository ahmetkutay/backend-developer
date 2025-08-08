"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const rabbitmq_1 = require("./rabbitmq");
const OrderCreatedConsumer_1 = require("./events/consumers/OrderCreatedConsumer");
const products_1 = require("./data/products");
async function startInventoryService() {
    try {
        console.log('🚀 Starting Inventory Service...');
        console.log('=====================================');
        (0, env_1.validateEnv)();
        displayInventoryStatus();
        console.log('🔌 Connecting to RabbitMQ...');
        await (0, rabbitmq_1.connectRabbitMQ)();
        if (!(0, rabbitmq_1.getRabbitMQStatus)()) {
            throw new Error('Failed to establish RabbitMQ connection');
        }
        console.log('✅ RabbitMQ connection established successfully');
        console.log('🎯 Starting Order Created Consumer...');
        await OrderCreatedConsumer_1.OrderCreatedConsumer.startConsuming();
        console.log('=====================================');
        console.log('✅ Inventory Service is running and ready to process orders!');
        console.log('📥 Listening for order.created messages...');
        console.log('📤 Will publish to inventory.status.updated queue');
        console.log('🛑 Press CTRL+C to stop the service');
        console.log('=====================================');
    }
    catch (error) {
        console.error('❌ Failed to start Inventory Service:', error);
        process.exit(1);
    }
}
function displayInventoryStatus() {
    console.log('📦 Current Inventory Status:');
    console.log('-----------------------------');
    const products = products_1.InventoryManager.getAllProducts();
    products.forEach(product => {
        const status = product.available > 0 ? '✅ Available' : '❌ Out of Stock';
        console.log(`${status} | ${product.name} (ID: ${product.id}) - Available: ${product.available}, Reserved: ${product.reserved}, Total: ${product.stock}`);
    });
    console.log('-----------------------------');
}
async function gracefulShutdown(signal) {
    console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
    try {
        console.log('🔄 Stopping message consumers...');
        await OrderCreatedConsumer_1.OrderCreatedConsumer.stopConsuming();
        console.log('🔌 Disconnecting from RabbitMQ...');
        await (0, rabbitmq_1.disconnectRabbitMQ)();
        console.log('✅ Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
    }
}
function handleUncaughtException(error) {
    console.error('💥 Uncaught Exception:', error);
    console.error('Stack trace:', error.stack);
    gracefulShutdown('UNCAUGHT_EXCEPTION')
        .catch(() => {
        console.error('❌ Failed to shutdown gracefully after uncaught exception');
        process.exit(1);
    });
}
function handleUnhandledRejection(reason, promise) {
    console.error('💥 Unhandled Promise Rejection at:', promise);
    console.error('Reason:', reason);
    gracefulShutdown('UNHANDLED_REJECTION')
        .catch(() => {
        console.error('❌ Failed to shutdown gracefully after unhandled rejection');
        process.exit(1);
    });
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);
startInventoryService().catch((error) => {
    console.error('💥 Fatal error starting Inventory Service:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map