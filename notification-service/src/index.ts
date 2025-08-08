import { connectRabbitMQ, closeConnection } from './rabbitmq';
import { InventoryStatusUpdatedConsumer } from './events/consumers/InventoryStatusUpdatedConsumer';
import { env } from './config/env';

class NotificationService {
  private inventoryConsumer: InventoryStatusUpdatedConsumer;
  private isShuttingDown = false;

  constructor() {
    this.inventoryConsumer = new InventoryStatusUpdatedConsumer();
  }

  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Notification Service...');
      console.log(`📍 Environment: ${env.NODE_ENV}`);
      console.log(`🔗 RabbitMQ URL: ${env.RABBITMQ_URL}`);
      
      // Connect to RabbitMQ
      await connectRabbitMQ();
      console.log('✅ RabbitMQ connection established');

      // Start consuming inventory status updates
      await this.inventoryConsumer.start();
      console.log('✅ Inventory status consumer started');

      console.log('🎯 Notification Service is running and ready to process messages');
      console.log('📨 Listening for inventory.status.updated messages...');
      console.log('💡 Press Ctrl+C to stop the service');

    } catch (error) {
      console.error('❌ Failed to start Notification Service:', error);
      await this.shutdown();
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      console.log('⏳ Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    console.log('🛑 Shutting down Notification Service...');

    try {
      // Close RabbitMQ connection
      await closeConnection();
      console.log('✅ RabbitMQ connection closed');

      console.log('👋 Notification Service stopped gracefully');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  private setupGracefulShutdown(): void {
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      console.log('\n🔄 Received SIGINT (Ctrl+C), initiating graceful shutdown...');
      await this.shutdown();
      process.exit(0);
    });

    // Handle SIGTERM
    process.on('SIGTERM', async () => {
      console.log('\n🔄 Received SIGTERM, initiating graceful shutdown...');
      await this.shutdown();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught Exception:', error);
      await this.shutdown();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }
}

// Main execution
async function main(): Promise<void> {
  const service = new NotificationService();
  
  // Setup graceful shutdown handlers
  service['setupGracefulShutdown']();

  // Start the service
  await service.start();

  // Keep the process running
  process.stdin.resume();
}

// Start the application
if (require.main === module) {
  main().catch(async (error) => {
    console.error('💥 Fatal error starting Notification Service:', error);
    process.exit(1);
  });
}

export { NotificationService };