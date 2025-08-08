"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const rabbitmq_1 = require("./rabbitmq");
const InventoryStatusUpdatedConsumer_1 = require("./events/consumers/InventoryStatusUpdatedConsumer");
const env_1 = require("./config/env");
class NotificationService {
    constructor() {
        this.isShuttingDown = false;
        this.inventoryConsumer = new InventoryStatusUpdatedConsumer_1.InventoryStatusUpdatedConsumer();
    }
    async start() {
        try {
            console.log('🚀 Starting Notification Service...');
            console.log(`📍 Environment: ${env_1.env.NODE_ENV}`);
            console.log(`🔗 RabbitMQ URL: ${env_1.env.RABBITMQ_URL}`);
            await (0, rabbitmq_1.connectRabbitMQ)();
            console.log('✅ RabbitMQ connection established');
            await this.inventoryConsumer.start();
            console.log('✅ Inventory status consumer started');
            console.log('🎯 Notification Service is running and ready to process messages');
            console.log('📨 Listening for inventory.status.updated messages...');
            console.log('💡 Press Ctrl+C to stop the service');
        }
        catch (error) {
            console.error('❌ Failed to start Notification Service:', error);
            await this.shutdown();
            process.exit(1);
        }
    }
    async shutdown() {
        if (this.isShuttingDown) {
            console.log('⏳ Shutdown already in progress...');
            return;
        }
        this.isShuttingDown = true;
        console.log('🛑 Shutting down Notification Service...');
        try {
            await (0, rabbitmq_1.closeConnection)();
            console.log('✅ RabbitMQ connection closed');
            console.log('👋 Notification Service stopped gracefully');
        }
        catch (error) {
            console.error('❌ Error during shutdown:', error);
        }
    }
    setupGracefulShutdown() {
        process.on('SIGINT', async () => {
            console.log('\n🔄 Received SIGINT (Ctrl+C), initiating graceful shutdown...');
            await this.shutdown();
            process.exit(0);
        });
        process.on('SIGTERM', async () => {
            console.log('\n🔄 Received SIGTERM, initiating graceful shutdown...');
            await this.shutdown();
            process.exit(0);
        });
        process.on('uncaughtException', async (error) => {
            console.error('💥 Uncaught Exception:', error);
            await this.shutdown();
            process.exit(1);
        });
        process.on('unhandledRejection', async (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            await this.shutdown();
            process.exit(1);
        });
    }
}
exports.NotificationService = NotificationService;
async function main() {
    const service = new NotificationService();
    service['setupGracefulShutdown']();
    await service.start();
    process.stdin.resume();
}
if (require.main === module) {
    main().catch(async (error) => {
        console.error('💥 Fatal error starting Notification Service:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=index.js.map