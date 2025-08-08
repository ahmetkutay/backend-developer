const amqp = require('amqplib');

async function sendTestMessage() {
  let connection;
  let channel;

  try {
    console.log('🔗 Connecting to RabbitMQ for testing...');
    connection = await amqp.connect('amqp://localhost:5672');
    channel = await connection.createChannel();

    const queue = 'inventory.status.updated';
    await channel.assertQueue(queue, { durable: true });

    // Test message 1: Low stock
    const lowStockMessage = {
      productId: 'prod-123',
      productName: 'iPhone 15 Pro',
      stockQuantity: 5,
      previousStockQuantity: 15,
      updatedAt: new Date().toISOString(),
      userId: 'user-456'
    };

    // Test message 2: Out of stock
    const outOfStockMessage = {
      productId: 'prod-789',
      productName: 'MacBook Pro M3',
      stockQuantity: 0,
      previousStockQuantity: 3,
      updatedAt: new Date().toISOString(),
      userId: 'user-789'
    };

    // Test message 3: Stock available
    const stockAvailableMessage = {
      productId: 'prod-456',
      productName: 'AirPods Pro',
      stockQuantity: 50,
      previousStockQuantity: 45,
      updatedAt: new Date().toISOString(),
      userId: 'user-123'
    };

    console.log('📤 Sending test messages...');
    
    // Send messages with delays
    setTimeout(() => {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(lowStockMessage)), { persistent: true });
      console.log('✅ Sent low stock message');
    }, 1000);

    setTimeout(() => {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(outOfStockMessage)), { persistent: true });
      console.log('✅ Sent out of stock message');
    }, 3000);

    setTimeout(() => {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(stockAvailableMessage)), { persistent: true });
      console.log('✅ Sent stock available message');
    }, 5000);

    setTimeout(async () => {
      console.log('🏁 All test messages sent. Closing connection...');
      await channel.close();
      await connection.close();
      console.log('👋 Test completed');
    }, 7000);

  } catch (error) {
    console.error('❌ Error sending test messages:', error);
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

console.log('🧪 Starting notification service test...');
console.log('📝 This script will send test inventory status update messages');
console.log('🚀 Make sure the notification service is running to see the notifications');
console.log('');

sendTestMessage();