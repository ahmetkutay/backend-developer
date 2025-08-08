import amqp from 'amqplib';
import { env } from './config/env';

let connection: amqp.Connection | null = null;
let channel: amqp.Channel | null = null;

export async function connectRabbitMQ(): Promise<void> {
  try {
    console.log('Connecting to RabbitMQ...');
    connection = await amqp.connect(env.RABBITMQ_URL) as any;
    
    if (!connection) {
      throw new Error('Failed to establish RabbitMQ connection');
    }
    
    channel = await (connection as any).createChannel();
    
    console.log('Connected to RabbitMQ successfully');
    
    // Handle connection errors
    connection.on('error', (err) => {
      console.error('RabbitMQ connection error:', err);
    });
    
    connection.on('close', () => {
      console.log('RabbitMQ connection closed');
    });
    
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
    throw error;
  }
}

export async function publishMessage(queue: string, message: object): Promise<void> {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized. Call connectRabbitMQ() first.');
  }
  
  try {
    // Ensure queue exists and is durable
    await channel.assertQueue(queue, { durable: true });
    
    const messageBuffer = Buffer.from(JSON.stringify(message));
    
    const published = channel.sendToQueue(queue, messageBuffer, {
      persistent: true // Make message persistent
    });
    
    if (published) {
      console.log(`Message published to queue "${queue}":`, message);
    } else {
      console.warn(`Failed to publish message to queue "${queue}"`);
    }
    
  } catch (error) {
    console.error(`Error publishing message to queue "${queue}":`, error);
    throw error;
  }
}

export async function consumeMessage(
  queue: string, 
  callback: (message: any) => Promise<void>
): Promise<void> {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized. Call connectRabbitMQ() first.');
  }
  
  try {
    // Ensure queue exists and is durable
    await channel.assertQueue(queue, { durable: true });
    
    // Set prefetch to 1 to ensure fair dispatch
    await channel.prefetch(1);
    
    console.log(`Starting to consume messages from queue "${queue}"`);
    
    await channel.consume(queue, async (msg) => {
      if (msg) {
        try {
          const messageContent = JSON.parse(msg.content.toString());
          console.log(`Received message from queue "${queue}":`, messageContent);
          
          // Process the message
          await callback(messageContent);
          
          // Acknowledge the message
          channel!.ack(msg);
          console.log(`Message processed and acknowledged from queue "${queue}"`);
          
        } catch (error) {
          console.error(`Error processing message from queue "${queue}":`, error);
          
          // Reject the message and requeue it
          channel!.nack(msg, false, true);
        }
      }
    });
    
  } catch (error) {
    console.error(`Error setting up consumer for queue "${queue}":`, error);
    throw error;
  }
}

export async function closeConnection(): Promise<void> {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    
    if (connection) {
      await (connection as any).close();
      connection = null;
    }
    
    console.log('RabbitMQ connection closed successfully');
  } catch (error) {
    console.error('Error closing RabbitMQ connection:', error);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing RabbitMQ connection...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing RabbitMQ connection...');
  await closeConnection();
  process.exit(0);
});