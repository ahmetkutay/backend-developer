import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env';
import { redisLogger, logError } from './logger';

class RedisConnection {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start with 1 second

  async connect(): Promise<void> {
    try {
      redisLogger.info('Connecting to Redis...');
      
      this.client = createClient({
        url: env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => {
            if (retries >= this.maxReconnectAttempts) {
              redisLogger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
              return false;
            }
            const delay = Math.min(this.reconnectDelay * Math.pow(2, retries), 30000);
            redisLogger.warn(`Reconnecting to Redis in ${delay}ms (attempt ${retries + 1})`);
            return delay;
          },
        },
      });

      // Set up event listeners
      this.client.on('error', (error) => {
        redisLogger.error('Redis connection error:', error);
        this.isConnected = false;
        logError(error, { component: 'redis' });
      });

      this.client.on('connect', () => {
        redisLogger.info('Redis connection established');
        this.reconnectAttempts = 0;
      });

      this.client.on('ready', () => {
        redisLogger.info('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        redisLogger.warn('Redis connection ended');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        redisLogger.info(`Redis reconnecting (attempt ${this.reconnectAttempts})`);
      });

      await this.client.connect();
      redisLogger.info('Successfully connected to Redis');
    } catch (error) {
      redisLogger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
        this.isConnected = false;
        redisLogger.info('Disconnected from Redis');
      }
    } catch (error) {
      redisLogger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected && this.client !== null;
  }

  private ensureConnection(): void {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis is not connected');
    }
  }

  // Idempotency methods
  async isMessageProcessed(messageId: string): Promise<boolean> {
    this.ensureConnection();
    try {
      const key = `processed:${messageId}`;
      const exists = await this.client!.exists(key);
      return exists === 1;
    } catch (error) {
      redisLogger.error(`Error checking if message ${messageId} is processed:`, error);
      throw error;
    }
  }

  async markMessageAsProcessed(
    messageId: string, 
    ttlSeconds: number = 86400 // 24 hours default
  ): Promise<void> {
    this.ensureConnection();
    try {
      const key = `processed:${messageId}`;
      await this.client!.setEx(key, ttlSeconds, new Date().toISOString());
      redisLogger.debug(`Marked message ${messageId} as processed with TTL ${ttlSeconds}s`);
    } catch (error) {
      redisLogger.error(`Error marking message ${messageId} as processed:`, error);
      throw error;
    }
  }

  async getProcessedMessageInfo(messageId: string): Promise<string | null> {
    this.ensureConnection();
    try {
      const key = `processed:${messageId}`;
      return await this.client!.get(key);
    } catch (error) {
      redisLogger.error(`Error getting processed message info for ${messageId}:`, error);
      throw error;
    }
  }

  // Retry tracking methods
  async getRetryCount(messageId: string): Promise<number> {
    this.ensureConnection();
    try {
      const key = `retry:${messageId}`;
      const count = await this.client!.get(key);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      redisLogger.error(`Error getting retry count for ${messageId}:`, error);
      throw error;
    }
  }

  async incrementRetryCount(
    messageId: string, 
    ttlSeconds: number = 3600 // 1 hour default
  ): Promise<number> {
    this.ensureConnection();
    try {
      const key = `retry:${messageId}`;
      const count = await this.client!.incr(key);
      await this.client!.expire(key, ttlSeconds);
      redisLogger.debug(`Incremented retry count for ${messageId} to ${count}`);
      return count;
    } catch (error) {
      redisLogger.error(`Error incrementing retry count for ${messageId}:`, error);
      throw error;
    }
  }

  async clearRetryCount(messageId: string): Promise<void> {
    this.ensureConnection();
    try {
      const key = `retry:${messageId}`;
      await this.client!.del(key);
      redisLogger.debug(`Cleared retry count for ${messageId}`);
    } catch (error) {
      redisLogger.error(`Error clearing retry count for ${messageId}:`, error);
      throw error;
    }
  }

  // Circuit breaker state methods
  async getCircuitBreakerState(operation: string): Promise<string | null> {
    this.ensureConnection();
    try {
      const key = `circuit:${operation}`;
      return await this.client!.get(key);
    } catch (error) {
      redisLogger.error(`Error getting circuit breaker state for ${operation}:`, error);
      throw error;
    }
  }

  async setCircuitBreakerState(
    operation: string, 
    state: string, 
    ttlSeconds: number = 300 // 5 minutes default
  ): Promise<void> {
    this.ensureConnection();
    try {
      const key = `circuit:${operation}`;
      await this.client!.setEx(key, ttlSeconds, state);
      redisLogger.debug(`Set circuit breaker state for ${operation} to ${state}`);
    } catch (error) {
      redisLogger.error(`Error setting circuit breaker state for ${operation}:`, error);
      throw error;
    }
  }

  // Generic cache methods
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.ensureConnection();
    try {
      if (ttlSeconds) {
        await this.client!.setEx(key, ttlSeconds, value);
      } else {
        await this.client!.set(key, value);
      }
    } catch (error) {
      redisLogger.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    this.ensureConnection();
    try {
      return await this.client!.get(key);
    } catch (error) {
      redisLogger.error(`Error getting key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    this.ensureConnection();
    try {
      await this.client!.del(key);
    } catch (error) {
      redisLogger.error(`Error deleting key ${key}:`, error);
      throw error;
    }
  }
}

// Create singleton instance
const redis = new RedisConnection();

// Export the instance and utility functions
export { redis };

export const connectRedis = async (): Promise<void> => {
  await redis.connect();
};

export const disconnectRedis = async (): Promise<void> => {
  await redis.disconnect();
};

export const getRedisStatus = (): boolean => {
  return redis.getConnectionStatus();
};

// Idempotency utilities
export const isMessageProcessed = async (messageId: string): Promise<boolean> => {
  return redis.isMessageProcessed(messageId);
};

export const markMessageAsProcessed = async (
  messageId: string, 
  ttlSeconds?: number
): Promise<void> => {
  return redis.markMessageAsProcessed(messageId, ttlSeconds);
};

// Retry utilities
export const getRetryCount = async (messageId: string): Promise<number> => {
  return redis.getRetryCount(messageId);
};

export const incrementRetryCount = async (
  messageId: string, 
  ttlSeconds?: number
): Promise<number> => {
  return redis.incrementRetryCount(messageId, ttlSeconds);
};

export const clearRetryCount = async (messageId: string): Promise<void> => {
  return redis.clearRetryCount(messageId);
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  redisLogger.info('Received SIGINT, closing Redis connection...');
  await disconnectRedis();
});

process.on('SIGTERM', async () => {
  redisLogger.info('Received SIGTERM, closing Redis connection...');
  await disconnectRedis();
});