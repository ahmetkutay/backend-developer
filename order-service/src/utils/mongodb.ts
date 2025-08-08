import mongoose from 'mongoose';
import { env } from '../config/env';
import { mongoLogger, logError } from './logger';

// Event storage schema
export interface StoredEvent {
  eventId: string;
  eventType: string;
  version: string;
  timestamp: Date;
  data: any;
  metadata: {
    service: string;
    correlationId?: string;
    causationId?: string;
    userId?: string;
    source: string;
  };
  status: 'pending' | 'processed' | 'failed' | 'replayed';
  processingAttempts: number;
  lastProcessedAt?: Date;
  error?: {
    message: string;
    stack?: string;
    timestamp: Date;
  };
}

// Mongoose schema for events
const eventSchema = new mongoose.Schema<StoredEvent>({
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true, index: true },
  version: { type: String, required: true, default: '1.0.0' },
  timestamp: { type: Date, required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  metadata: {
    service: { type: String, required: true, index: true },
    correlationId: { type: String, index: true },
    causationId: { type: String, index: true },
    userId: { type: String, index: true },
    source: { type: String, required: true },
  },
  status: { 
    type: String, 
    enum: ['pending', 'processed', 'failed', 'replayed'], 
    default: 'pending',
    index: true 
  },
  processingAttempts: { type: Number, default: 0 },
  lastProcessedAt: { type: Date },
  error: {
    message: String,
    stack: String,
    timestamp: Date,
  },
}, {
  timestamps: true,
  collection: 'events',
});

// Add compound indexes for better query performance
eventSchema.index({ eventType: 1, timestamp: -1 });
eventSchema.index({ 'metadata.service': 1, timestamp: -1 });
eventSchema.index({ status: 1, timestamp: -1 });
eventSchema.index({ 'metadata.correlationId': 1, timestamp: -1 });

export const EventModel = mongoose.model<StoredEvent>('Event', eventSchema);

class MongoDBConnection {
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;

  async connect(): Promise<void> {
    try {
      mongoLogger.info('Connecting to MongoDB...');
      
      const mongoUrl = env.MONGODB_URL || 'mongodb://localhost:27017/ecommerce-events';
      
      await mongoose.connect(mongoUrl, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferCommands: false,
        bufferMaxEntries: 0,
      });

      // Set up event listeners
      mongoose.connection.on('connected', () => {
        mongoLogger.info('MongoDB connected successfully');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      mongoose.connection.on('error', (error) => {
        mongoLogger.error('MongoDB connection error:', error);
        this.isConnected = false;
        logError(error, { component: 'mongodb' });
      });

      mongoose.connection.on('disconnected', () => {
        mongoLogger.warn('MongoDB disconnected');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      mongoose.connection.on('reconnected', () => {
        mongoLogger.info('MongoDB reconnected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.isConnected = true;
      mongoLogger.info('Successfully connected to MongoDB');
    } catch (error) {
      mongoLogger.error('Failed to connect to MongoDB:', error);
      this.isConnected = false;
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      mongoLogger.error(`Max MongoDB reconnection attempts (${this.maxReconnectAttempts}) reached`);
      return;
    }

    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    mongoLogger.info(`Scheduling MongoDB reconnection in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        mongoLogger.error('MongoDB reconnection failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect();
      this.isConnected = false;
      mongoLogger.info('Disconnected from MongoDB');
    } catch (error) {
      mongoLogger.error('Error disconnecting from MongoDB:', error);
      throw error;
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  private ensureConnection(): void {
    if (!this.getConnectionStatus()) {
      throw new Error('MongoDB is not connected');
    }
  }

  // Event storage methods
  async storeEvent(event: Omit<StoredEvent, '_id'>): Promise<StoredEvent> {
    this.ensureConnection();
    
    try {
      const storedEvent = new EventModel(event);
      const savedEvent = await storedEvent.save();
      
      mongoLogger.debug(`Event stored: ${event.eventId} (${event.eventType})`);
      return savedEvent.toObject();
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key error - event already exists
        mongoLogger.warn(`Event ${event.eventId} already exists in storage`);
        const existingEvent = await EventModel.findOne({ eventId: event.eventId });
        return existingEvent!.toObject();
      }
      
      mongoLogger.error(`Error storing event ${event.eventId}:`, error);
      throw error;
    }
  }

  async getEvent(eventId: string): Promise<StoredEvent | null> {
    this.ensureConnection();
    
    try {
      const event = await EventModel.findOne({ eventId });
      return event ? event.toObject() : null;
    } catch (error) {
      mongoLogger.error(`Error retrieving event ${eventId}:`, error);
      throw error;
    }
  }

  async getEventsByType(
    eventType: string, 
    limit: number = 100, 
    offset: number = 0
  ): Promise<StoredEvent[]> {
    this.ensureConnection();
    
    try {
      const events = await EventModel
        .find({ eventType })
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(offset)
        .lean();
      
      return events;
    } catch (error) {
      mongoLogger.error(`Error retrieving events by type ${eventType}:`, error);
      throw error;
    }
  }

  async getEventsByService(
    service: string, 
    limit: number = 100, 
    offset: number = 0
  ): Promise<StoredEvent[]> {
    this.ensureConnection();
    
    try {
      const events = await EventModel
        .find({ 'metadata.service': service })
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(offset)
        .lean();
      
      return events;
    } catch (error) {
      mongoLogger.error(`Error retrieving events by service ${service}:`, error);
      throw error;
    }
  }

  async getEventsByCorrelationId(correlationId: string): Promise<StoredEvent[]> {
    this.ensureConnection();
    
    try {
      const events = await EventModel
        .find({ 'metadata.correlationId': correlationId })
        .sort({ timestamp: 1 })
        .lean();
      
      return events;
    } catch (error) {
      mongoLogger.error(`Error retrieving events by correlation ID ${correlationId}:`, error);
      throw error;
    }
  }

  async getEventsByDateRange(
    startDate: Date, 
    endDate: Date, 
    limit: number = 100
  ): Promise<StoredEvent[]> {
    this.ensureConnection();
    
    try {
      const events = await EventModel
        .find({
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          },
        })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
      
      return events;
    } catch (error) {
      mongoLogger.error('Error retrieving events by date range:', error);
      throw error;
    }
  }

  async updateEventStatus(
    eventId: string, 
    status: StoredEvent['status'], 
    error?: { message: string; stack?: string }
  ): Promise<void> {
    this.ensureConnection();
    
    try {
      const updateData: any = {
        status,
        lastProcessedAt: new Date(),
        $inc: { processingAttempts: 1 },
      };

      if (error) {
        updateData.error = {
          message: error.message,
          stack: error.stack,
          timestamp: new Date(),
        };
      }

      await EventModel.updateOne({ eventId }, updateData);
      mongoLogger.debug(`Event ${eventId} status updated to ${status}`);
    } catch (error) {
      mongoLogger.error(`Error updating event ${eventId} status:`, error);
      throw error;
    }
  }

  async getFailedEvents(limit: number = 100): Promise<StoredEvent[]> {
    this.ensureConnection();
    
    try {
      const events = await EventModel
        .find({ status: 'failed' })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
      
      return events;
    } catch (error) {
      mongoLogger.error('Error retrieving failed events:', error);
      throw error;
    }
  }

  async getPendingEvents(limit: number = 100): Promise<StoredEvent[]> {
    this.ensureConnection();
    
    try {
      const events = await EventModel
        .find({ status: 'pending' })
        .sort({ timestamp: 1 })
        .limit(limit)
        .lean();
      
      return events;
    } catch (error) {
      mongoLogger.error('Error retrieving pending events:', error);
      throw error;
    }
  }

  async deleteOldEvents(olderThanDays: number = 30): Promise<number> {
    this.ensureConnection();
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const result = await EventModel.deleteMany({
        timestamp: { $lt: cutoffDate },
        status: { $in: ['processed', 'failed'] },
      });
      
      mongoLogger.info(`Deleted ${result.deletedCount} old events older than ${olderThanDays} days`);
      return result.deletedCount;
    } catch (error) {
      mongoLogger.error('Error deleting old events:', error);
      throw error;
    }
  }

  async getEventStats(): Promise<{
    total: number;
    pending: number;
    processed: number;
    failed: number;
    replayed: number;
  }> {
    this.ensureConnection();
    
    try {
      const stats = await EventModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const result = {
        total: 0,
        pending: 0,
        processed: 0,
        failed: 0,
        replayed: 0,
      };

      stats.forEach((stat) => {
        result[stat._id as keyof typeof result] = stat.count;
        result.total += stat.count;
      });

      return result;
    } catch (error) {
      mongoLogger.error('Error retrieving event stats:', error);
      throw error;
    }
  }
}

// Create singleton instance
const mongodb = new MongoDBConnection();

// Export the instance and utility functions
export { mongodb };

export const connectMongoDB = async (): Promise<void> => {
  await mongodb.connect();
};

export const disconnectMongoDB = async (): Promise<void> => {
  await mongodb.disconnect();
};

export const getMongoDBStatus = (): boolean => {
  return mongodb.getConnectionStatus();
};

// Event storage utilities
export const storeEvent = async (event: Omit<StoredEvent, '_id'>): Promise<StoredEvent> => {
  return mongodb.storeEvent(event);
};

export const getEvent = async (eventId: string): Promise<StoredEvent | null> => {
  return mongodb.getEvent(eventId);
};

export const getEventsByType = async (
  eventType: string, 
  limit?: number, 
  offset?: number
): Promise<StoredEvent[]> => {
  return mongodb.getEventsByType(eventType, limit, offset);
};

export const updateEventStatus = async (
  eventId: string, 
  status: StoredEvent['status'], 
  error?: { message: string; stack?: string }
): Promise<void> => {
  return mongodb.updateEventStatus(eventId, status, error);
};

// Graceful shutdown handling
process.on('SIGINT', async () => {
  mongoLogger.info('Received SIGINT, closing MongoDB connection...');
  await disconnectMongoDB();
});

process.on('SIGTERM', async () => {
  mongoLogger.info('Received SIGTERM, closing MongoDB connection...');
  await disconnectMongoDB();
});