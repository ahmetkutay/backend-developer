import amqp from 'amqplib';
import CircuitBreaker from 'opossum';
import { env } from '../config/env';
import { rabbitMQLogger, logError, logRetry, logCircuitBreaker } from './logger';
import { 
  isMessageProcessed, 
  markMessageAsProcessed, 
  getRetryCount, 
  incrementRetryCount, 
  clearRetryCount 
} from './redis';

export interface MessageProcessingOptions {
  maxRetries?: number;
  retryDelay?: number;
  enableIdempotency?: boolean;
  idempotencyTtl?: number;
  enableDLQ?: boolean;
  prefetchCount?: number;
}

export interface QueueConfig {
  name: string;
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: any;
}

export interface ExchangeConfig {
  name: string;
  type: 'direct' | 'topic' | 'fanout' | 'headers';
  durable?: boolean;
  autoDelete?: boolean;
  arguments?: any;
}

export interface MessageHandler<T = any> {
  (message: T, metadata: MessageMetadata): Promise<void>;
}

export interface MessageMetadata {
  messageId: string;
  timestamp: string;
  deliveryTag: number;
  redelivered: boolean;
  exchange: string;
  routingKey: string;
  attempt: number;
}

class EnhancedRabbitMQConnection {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private circuitBreaker: CircuitBreaker | null = null;

  constructor() {
    this.setupCircuitBreaker();
  }

  private setupCircuitBreaker(): void {
    const options = {
      timeout: 30000, // 30 seconds
      errorThresholdPercentage: 50,
      resetTimeout: 60000, // 1 minute
      rollingCountTimeout: 10000, // 10 seconds
      rollingCountBuckets: 10,
    };

    this.circuitBreaker = new CircuitBreaker(this.connectInternal.bind(this), options);

    this.circuitBreaker.on('open', () => {
      logCircuitBreaker('rabbitmq-connection', 'open', 'Circuit breaker opened due to failures');
    });

    this.circuitBreaker.on('halfOpen', () => {
      logCircuitBreaker('rabbitmq-connection', 'half-open', 'Circuit breaker attempting to close');
    });

    this.circuitBreaker.on('close', () => {
      logCircuitBreaker('rabbitmq-connection', 'closed', 'Circuit breaker closed - connection restored');
    });
  }

  private async connectInternal(): Promise<void> {
    rabbitMQLogger.info('Connecting to RabbitMQ...');
    
    this.connection = await amqp.connect(env.RABBITMQ_URL || 'amqp://localhost:5672');
    
    if (!this.connection) {
      throw new Error('Failed to establish RabbitMQ connection');
    }
    
    this.channel = await this.connection.createChannel();
    
    if (!this.channel) {
      throw new Error('Failed to create RabbitMQ channel');
    }

    // Set up connection event listeners
    this.connection.on('error', (err: Error) => {
      rabbitMQLogger.error('RabbitMQ connection error:', err);
      this.isConnected = false;
      logError(err, { component: 'rabbitmq' });
    });

    this.connection.on('close', () => {
      rabbitMQLogger.warn('RabbitMQ connection closed');
      this.isConnected = false;
      this.scheduleReconnect();
    });

    // Set up channel event listeners
    this.channel.on('error', (err: Error) => {
      rabbitMQLogger.error('RabbitMQ channel error:', err);
      logError(err, { component: 'rabbitmq-channel' });
    });

    this.channel.on('close', () => {
      rabbitMQLogger.warn('RabbitMQ channel closed');
    });

    this.isConnected = true;
    this.reconnectAttempts = 0;
    rabbitMQLogger.info('Successfully connected to RabbitMQ');
  }

  async connect(): Promise<void> {
    try {
      if (this.circuitBreaker) {
        await this.circuitBreaker.fire();
      } else {
        await this.connectInternal();
      }
    } catch (error) {
      rabbitMQLogger.error('Failed to connect to RabbitMQ:', error);
      this.isConnected = false;
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      rabbitMQLogger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
      return;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    rabbitMQLogger.info(`Scheduling reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        rabbitMQLogger.error('Reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.isConnected = false;
      rabbitMQLogger.info('Disconnected from RabbitMQ');
    } catch (error) {
      rabbitMQLogger.error('Error disconnecting from RabbitMQ:', error);
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected && this.connection !== null && this.channel !== null;
  }

  private ensureConnection(): void {
    if (!this.getConnectionStatus()) {
      throw new Error('RabbitMQ is not connected');
    }
  }

  async setupQueue(config: QueueConfig): Promise<void> {
    this.ensureConnection();
    
    const options = {
      durable: config.durable ?? true,
      exclusive: config.exclusive ?? false,
      autoDelete: config.autoDelete ?? false,
      arguments: config.arguments ?? {},
    };

    await this.channel!.assertQueue(config.name, options);
    rabbitMQLogger.info(`Queue '${config.name}' set up successfully`);
  }

  async setupExchange(config: ExchangeConfig): Promise<void> {
    this.ensureConnection();
    
    const options = {
      durable: config.durable ?? true,
      autoDelete: config.autoDelete ?? false,
      arguments: config.arguments ?? {},
    };

    await this.channel!.assertExchange(config.name, config.type, options);
    rabbitMQLogger.info(`Exchange '${config.name}' (${config.type}) set up successfully`);
  }

  async setupDLQ(queueName: string): Promise<void> {
    const dlqName = `${queueName}.dlq`;
    const dlxName = `${queueName}.dlx`;

    // Set up Dead Letter Exchange
    await this.setupExchange({
      name: dlxName,
      type: 'direct',
      durable: true,
    });

    // Set up Dead Letter Queue
    await this.setupQueue({
      name: dlqName,
      durable: true,
    });

    // Bind DLQ to DLX
    await this.channel!.bindQueue(dlqName, dlxName, queueName);

    // Set up main queue with DLX configuration
    await this.setupQueue({
      name: queueName,
      durable: true,
      arguments: {
        'x-dead-letter-exchange': dlxName,
        'x-dead-letter-routing-key': queueName,
      },
    });

    rabbitMQLogger.info(`DLQ setup completed for queue '${queueName}'`);
  }

  async publishMessage(
    queueName: string, 
    message: any, 
    options: MessageProcessingOptions = {}
  ): Promise<void> {
    this.ensureConnection();

    const messageId = message.eventId || message.id || `msg-${Date.now()}-${Math.random()}`;
    
    try {
      // Check idempotency if enabled
      if (options.enableIdempotency) {
        const alreadyProcessed = await isMessageProcessed(messageId);
        if (alreadyProcessed) {
          rabbitMQLogger.warn(`Message ${messageId} already processed, skipping publish`);
          return;
        }
      }

      // Ensure queue exists
      await this.setupQueue({ name: queueName });

      // Set up DLQ if enabled
      if (options.enableDLQ) {
        await this.setupDLQ(queueName);
      }

      const messageBuffer = Buffer.from(JSON.stringify({
        ...message,
        messageId,
        timestamp: new Date().toISOString(),
      }));

      const publishOptions = {
        persistent: true,
        messageId,
        timestamp: Date.now(),
      };

      const published = this.channel!.sendToQueue(queueName, messageBuffer, publishOptions);

      if (published) {
        rabbitMQLogger.info(`Message published to queue '${queueName}':`, { messageId });
        
        // Mark as processed if idempotency is enabled
        if (options.enableIdempotency) {
          await markMessageAsProcessed(messageId, options.idempotencyTtl);
        }
      } else {
        throw new Error('Failed to publish message to queue');
      }
    } catch (error) {
      rabbitMQLogger.error(`Failed to publish message to queue '${queueName}':`, error);
      throw error;
    }
  }

  async consumeMessages<T>(
    queueName: string,
    handler: MessageHandler<T>,
    options: MessageProcessingOptions = {}
  ): Promise<void> {
    this.ensureConnection();

    const {
      maxRetries = 3,
      retryDelay = 1000,
      enableIdempotency = true,
      enableDLQ = true,
      prefetchCount = 1,
    } = options;

    // Set prefetch count for message ordering
    await this.channel!.prefetch(prefetchCount);

    // Set up queue and DLQ
    await this.setupQueue({ name: queueName });
    if (enableDLQ) {
      await this.setupDLQ(queueName);
    }

    rabbitMQLogger.info(`Starting to consume messages from queue '${queueName}'`);

    await this.channel!.consume(queueName, async (msg) => {
      if (!msg) return;

      const startTime = Date.now();
      let messageData: T;
      let messageId: string;

      try {
        messageData = JSON.parse(msg.content.toString());
        messageId = messageData.messageId || messageData.id || `unknown-${Date.now()}`;

        const metadata: MessageMetadata = {
          messageId,
          timestamp: new Date().toISOString(),
          deliveryTag: msg.fields.deliveryTag,
          redelivered: msg.fields.redelivered,
          exchange: msg.fields.exchange,
          routingKey: msg.fields.routingKey,
          attempt: 1,
        };

        // Check idempotency
        if (enableIdempotency) {
          const alreadyProcessed = await isMessageProcessed(messageId);
          if (alreadyProcessed) {
            rabbitMQLogger.warn(`Message ${messageId} already processed, acknowledging`);
            this.channel!.ack(msg);
            return;
          }
        }

        // Get current retry count
        const currentRetries = await getRetryCount(messageId);
        metadata.attempt = currentRetries + 1;

        if (currentRetries >= maxRetries) {
          rabbitMQLogger.error(`Message ${messageId} exceeded max retries (${maxRetries}), sending to DLQ`);
          
          if (enableDLQ) {
            this.channel!.nack(msg, false, false); // Send to DLQ
          } else {
            this.channel!.ack(msg); // Just acknowledge to remove from queue
          }
          
          await clearRetryCount(messageId);
          return;
        }

        // Process the message
        await handler(messageData, metadata);

        // Success - acknowledge and mark as processed
        this.channel!.ack(msg);
        
        if (enableIdempotency) {
          await markMessageAsProcessed(messageId, options.idempotencyTtl);
        }
        
        await clearRetryCount(messageId);

        const duration = Date.now() - startTime;
        rabbitMQLogger.info(`Message ${messageId} processed successfully in ${duration}ms`);

      } catch (error) {
        const duration = Date.now() - startTime;
        rabbitMQLogger.error(`Error processing message ${messageId}:`, error);
        logError(error as Error, { messageId, queueName, duration });

        try {
          // Increment retry count
          const newRetryCount = await incrementRetryCount(messageId);
          logRetry(`process-message-${queueName}`, newRetryCount, maxRetries, error as Error);

          if (newRetryCount < maxRetries) {
            // Reject and requeue for retry
            setTimeout(() => {
              this.channel!.nack(msg, false, true);
            }, retryDelay * newRetryCount);
          } else {
            // Max retries reached, send to DLQ or acknowledge
            if (enableDLQ) {
              this.channel!.nack(msg, false, false);
            } else {
              this.channel!.ack(msg);
            }
            await clearRetryCount(messageId);
          }
        } catch (retryError) {
          rabbitMQLogger.error(`Error handling retry for message ${messageId}:`, retryError);
          this.channel!.nack(msg, false, false);
        }
      }
    });
  }

  async purgeQueue(queueName: string): Promise<number> {
    this.ensureConnection();
    const result = await this.channel!.purgeQueue(queueName);
    rabbitMQLogger.info(`Purged ${result.messageCount} messages from queue '${queueName}'`);
    return result.messageCount;
  }

  async getQueueInfo(queueName: string): Promise<any> {
    this.ensureConnection();
    return await this.channel!.checkQueue(queueName);
  }
}

// Create singleton instance
const enhancedRabbitMQ = new EnhancedRabbitMQConnection();

// Export the instance and utility functions
export { enhancedRabbitMQ };

export const connectEnhancedRabbitMQ = async (): Promise<void> => {
  await enhancedRabbitMQ.connect();
};

export const disconnectEnhancedRabbitMQ = async (): Promise<void> => {
  await enhancedRabbitMQ.disconnect();
};

export const getEnhancedRabbitMQStatus = (): boolean => {
  return enhancedRabbitMQ.getConnectionStatus();
};

export const publishEnhancedMessage = async (
  queueName: string,
  message: any,
  options?: MessageProcessingOptions
): Promise<void> => {
  return enhancedRabbitMQ.publishMessage(queueName, message, options);
};

export const consumeEnhancedMessages = async <T>(
  queueName: string,
  handler: MessageHandler<T>,
  options?: MessageProcessingOptions
): Promise<void> => {
  return enhancedRabbitMQ.consumeMessages(queueName, handler, options);
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  rabbitMQLogger.info('Received SIGINT, closing enhanced RabbitMQ connection...');
  await disconnectEnhancedRabbitMQ();
});

process.on('SIGTERM', async () => {
  rabbitMQLogger.info('Received SIGTERM, closing enhanced RabbitMQ connection...');
  await disconnectEnhancedRabbitMQ();
});