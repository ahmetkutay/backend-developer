import amqp from 'amqplib';
import { env } from './config/env';

class RabbitMQConnection {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private isConnected = false;

  async connect(): Promise<void> {
    try {
      console.log('🐰 Connecting to RabbitMQ...');
      this.connection = await amqp.connect(env.RABBITMQ_URL) as unknown as amqp.Connection;
      
      if (!this.connection) {
        throw new Error('Failed to establish RabbitMQ connection');
      }
      
      this.channel = await (this.connection as any).createChannel() as amqp.Channel;
      
      if (!this.channel) {
        throw new Error('Failed to create RabbitMQ channel');
      }
      
      this.isConnected = true;

      // Handle connection events
      (this.connection as any).on('error', (err: Error) => {
        console.error('❌ RabbitMQ connection error:', err);
        this.isConnected = false;
      });

      (this.connection as any).on('close', () => {
        console.log('🔌 RabbitMQ connection closed');
        this.isConnected = false;
      });

      console.log('✅ Connected to RabbitMQ successfully');
    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await (this.channel as any).close();
        this.channel = null;
      }
      if (this.connection) {
        await (this.connection as any).close();
        this.connection = null;
      }
      this.isConnected = false;
      console.log('🔌 Disconnected from RabbitMQ');
    } catch (error) {
      console.error('❌ Error disconnecting from RabbitMQ:', error);
      throw error;
    }
  }

  async publishMessage(queueName: string, message: object): Promise<void> {
    if (!this.isConnected || !this.channel) {
      throw new Error('RabbitMQ is not connected');
    }

    try {
      // Ensure the queue exists and is durable
      await this.channel.assertQueue(queueName, {
        durable: true,
      });

      // Convert message to buffer
      const messageBuffer = Buffer.from(JSON.stringify(message));

      // Publish message with persistent option
      const published = this.channel.sendToQueue(queueName, messageBuffer, {
        persistent: true,
      });

      if (published) {
        console.log(`📤 Message published to queue "${queueName}":`, message);
      } else {
        console.warn(`⚠️ Message may not have been published to queue "${queueName}"`);
      }
    } catch (error) {
      console.error(`❌ Failed to publish message to queue "${queueName}":`, error);
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }
}

// Create singleton instance
const rabbitMQ = new RabbitMQConnection();

// Export the instance and utility functions
export { rabbitMQ };

export const connectRabbitMQ = async (): Promise<void> => {
  await rabbitMQ.connect();
};

export const disconnectRabbitMQ = async (): Promise<void> => {
  await rabbitMQ.disconnect();
};

export const publishMessage = async (queueName: string, message: object): Promise<void> => {
  await rabbitMQ.ensureConnection();
  await rabbitMQ.publishMessage(queueName, message);
};

export const getRabbitMQStatus = (): boolean => {
  return rabbitMQ.getConnectionStatus();
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, closing RabbitMQ connection...');
  await disconnectRabbitMQ();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, closing RabbitMQ connection...');
  await disconnectRabbitMQ();
  process.exit(0);
});