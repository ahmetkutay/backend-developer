import { validateEnv } from './config/env';
import { connectRabbitMQ, disconnectRabbitMQ, getRabbitMQStatus } from './rabbitmq';
import { OrderCreatedConsumer } from './events/consumers/OrderCreatedConsumer';
import { InventoryManager } from './data/products';

/**
 * Inventory Service - Event-driven microservice for inventory management
 * 
 * This service:
 * 1. Listens to RabbitMQ for 'order.created' messages
 * 2. Checks inventory availability for ordered items
 * 3. Publishes 'inventory.status.updated' messages with availability status
 */

async function startInventoryService(): Promise<void> {
  try {
    console.log('🚀 Starting Inventory Service...');
    console.log('=====================================');

    // Validate environment variables
    validateEnv();

    // Display initial inventory status
    displayInventoryStatus();

    // Connect to RabbitMQ
    console.log('🔌 Connecting to RabbitMQ...');
    await connectRabbitMQ();

    // Verify RabbitMQ connection
    if (!getRabbitMQStatus()) {
      throw new Error('Failed to establish RabbitMQ connection');
    }

    console.log('✅ RabbitMQ connection established successfully');

    // Start consuming order created messages
    console.log('🎯 Starting Order Created Consumer...');
    await OrderCreatedConsumer.startConsuming();

    console.log('=====================================');
    console.log('✅ Inventory Service is running and ready to process orders!');
    console.log('📥 Listening for order.created messages...');
    console.log('📤 Will publish to inventory.status.updated queue');
    console.log('🛑 Press CTRL+C to stop the service');
    console.log('=====================================');

  } catch (error) {
    console.error('❌ Failed to start Inventory Service:', error);
    process.exit(1);
  }
}

/**
 * Display current inventory status on startup
 */
function displayInventoryStatus(): void {
  console.log('📦 Current Inventory Status:');
  console.log('-----------------------------');
  
  const products = InventoryManager.getAllProducts();
  products.forEach(product => {
    const status = product.available > 0 ? '✅ Available' : '❌ Out of Stock';
    console.log(`${status} | ${product.name} (ID: ${product.id}) - Available: ${product.available}, Reserved: ${product.reserved}, Total: ${product.stock}`);
  });
  
  console.log('-----------------------------');
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal}, initiating graceful shutdown...`);
  
  try {
    // Stop consuming messages
    console.log('🔄 Stopping message consumers...');
    await OrderCreatedConsumer.stopConsuming();
    
    // Disconnect from RabbitMQ
    console.log('🔌 Disconnecting from RabbitMQ...');
    await disconnectRabbitMQ();
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * Handle uncaught exceptions
 */
function handleUncaughtException(error: Error): void {
  console.error('💥 Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);
  
  // Attempt graceful shutdown
  gracefulShutdown('UNCAUGHT_EXCEPTION')
    .catch(() => {
      console.error('❌ Failed to shutdown gracefully after uncaught exception');
      process.exit(1);
    });
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(reason: any, promise: Promise<any>): void {
  console.error('💥 Unhandled Promise Rejection at:', promise);
  console.error('Reason:', reason);
  
  // Attempt graceful shutdown
  gracefulShutdown('UNHANDLED_REJECTION')
    .catch(() => {
      console.error('❌ Failed to shutdown gracefully after unhandled rejection');
      process.exit(1);
    });
}

// Register signal handlers for graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Register error handlers
process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

// Start the service
startInventoryService().catch((error) => {
  console.error('💥 Fatal error starting Inventory Service:', error);
  process.exit(1);
});