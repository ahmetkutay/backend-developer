import { publishEnhancedMessage } from './enhanced-rabbitmq';
import { 
  mongodb, 
  StoredEvent, 
  getEventsByType, 
  getEventsByDateRange, 
  getFailedEvents,
  getPendingEvents,
  updateEventStatus 
} from './mongodb';
import { validateAndMigrateEvent } from './event-schemas';
import { eventLogger, logError, appLogger } from './logger';

export interface ReplayOptions {
  eventType?: string;
  eventIds?: string[];
  correlationId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'pending' | 'processed' | 'failed';
  limit?: number;
  dryRun?: boolean;
  targetVersion?: string;
  delayMs?: number;
}

export interface ReplayResult {
  totalEvents: number;
  successfulReplays: number;
  failedReplays: number;
  skippedEvents: number;
  errors: Array<{
    eventId: string;
    error: string;
  }>;
  duration: number;
}

export class EventReplayService {
  /**
   * Replays events based on the provided criteria
   */
  static async replayEvents(options: ReplayOptions = {}): Promise<ReplayResult> {
    const startTime = Date.now();
    const result: ReplayResult = {
      totalEvents: 0,
      successfulReplays: 0,
      failedReplays: 0,
      skippedEvents: 0,
      errors: [],
      duration: 0,
    };

    try {
      eventLogger.info('Starting event replay with options:', options);

      // Get events to replay
      const events = await this.getEventsToReplay(options);
      result.totalEvents = events.length;

      if (events.length === 0) {
        eventLogger.info('No events found matching the replay criteria');
        result.duration = Date.now() - startTime;
        return result;
      }

      eventLogger.info(`Found ${events.length} events to replay`);

      // Process events
      for (const event of events) {
        try {
          await this.replayEvent(event, options);
          result.successfulReplays++;
          
          if (options.delayMs && options.delayMs > 0) {
            await this.delay(options.delayMs);
          }
        } catch (error) {
          result.failedReplays++;
          result.errors.push({
            eventId: event.eventId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          
          eventLogger.error(`Failed to replay event ${event.eventId}:`, error);
        }
      }

      result.duration = Date.now() - startTime;
      
      eventLogger.info('Event replay completed:', {
        totalEvents: result.totalEvents,
        successful: result.successfulReplays,
        failed: result.failedReplays,
        skipped: result.skippedEvents,
        duration: result.duration,
      });

      return result;
    } catch (error) {
      logError(error as Error, { component: 'event-replay', options });
      throw error;
    }
  }

  /**
   * Replays a single event
   */
  static async replayEvent(event: StoredEvent, options: ReplayOptions = {}): Promise<void> {
    try {
      eventLogger.debug(`Replaying event ${event.eventId} (${event.eventType})`);

      // Validate and potentially migrate the event
      const validation = validateAndMigrateEvent({
        eventId: event.eventId,
        eventType: event.eventType,
        version: event.version,
        timestamp: event.timestamp.toISOString(),
        data: event.data,
        metadata: event.metadata,
      }, options.targetVersion);

      if (!validation.isValid) {
        throw new Error(`Event validation failed: ${validation.errors?.join(', ')}`);
      }

      const eventToReplay = validation.validatedEvent!;

      // Determine the queue name based on event type
      const queueName = this.getQueueNameForEventType(event.eventType);

      if (options.dryRun) {
        eventLogger.info(`[DRY RUN] Would replay event ${event.eventId} to queue ${queueName}`);
        return;
      }

      // Publish the event
      await publishEnhancedMessage(queueName, eventToReplay, {
        enableIdempotency: false, // Don't check idempotency for replays
        enableDLQ: true,
        maxRetries: 3,
      });

      // Update event status
      await updateEventStatus(event.eventId, 'replayed');

      eventLogger.info(`Successfully replayed event ${event.eventId}`);
    } catch (error) {
      // Update event status to failed
      await updateEventStatus(event.eventId, 'failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      throw error;
    }
  }

  /**
   * Gets events to replay based on the provided options
   */
  private static async getEventsToReplay(options: ReplayOptions): Promise<StoredEvent[]> {
    const { limit = 100 } = options;

    // If specific event IDs are provided
    if (options.eventIds && options.eventIds.length > 0) {
      const events: StoredEvent[] = [];
      for (const eventId of options.eventIds) {
        const event = await mongodb.getEvent(eventId);
        if (event) {
          events.push(event);
        }
      }
      return events;
    }

    // If correlation ID is provided
    if (options.correlationId) {
      return await mongodb.getEventsByCorrelationId(options.correlationId);
    }

    // If date range is provided
    if (options.startDate && options.endDate) {
      return await mongodb.getEventsByDateRange(options.startDate, options.endDate, limit);
    }

    // If specific status is requested
    if (options.status === 'failed') {
      return await getFailedEvents(limit);
    }

    if (options.status === 'pending') {
      return await getPendingEvents(limit);
    }

    // If event type is provided
    if (options.eventType) {
      return await getEventsByType(options.eventType, limit);
    }

    // Default: get failed events
    return await getFailedEvents(limit);
  }

  /**
   * Maps event types to their corresponding queue names
   */
  private static getQueueNameForEventType(eventType: string): string {
    const queueMapping: { [key: string]: string } = {
      'order.created': 'order.created',
      'inventory.status.updated': 'inventory.status.updated',
      'notification.sent': 'notification.sent',
    };

    return queueMapping[eventType] || eventType;
  }

  /**
   * Utility method to add delay between replays
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets replay statistics
   */
  static async getReplayStats(): Promise<{
    totalEvents: number;
    pendingEvents: number;
    processedEvents: number;
    failedEvents: number;
    replayedEvents: number;
  }> {
    return await mongodb.getEventStats();
  }

  /**
   * Validates replay options
   */
  static validateReplayOptions(options: ReplayOptions): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (options.limit && (options.limit <= 0 || options.limit > 1000)) {
      errors.push('Limit must be between 1 and 1000');
    }

    if (options.startDate && options.endDate && options.startDate > options.endDate) {
      errors.push('Start date must be before end date');
    }

    if (options.delayMs && options.delayMs < 0) {
      errors.push('Delay must be non-negative');
    }

    if (options.eventIds && options.eventIds.length > 100) {
      errors.push('Cannot replay more than 100 specific events at once');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

// CLI Interface
export class EventReplayCLI {
  /**
   * Parses command line arguments and executes replay
   */
  static async executeFromCLI(args: string[]): Promise<void> {
    try {
      const options = this.parseArguments(args);
      
      // Validate options
      const validation = EventReplayService.validateReplayOptions(options);
      if (!validation.isValid) {
        console.error('Invalid options:', validation.errors.join(', '));
        process.exit(1);
      }

      console.log('Starting event replay with options:', JSON.stringify(options, null, 2));
      
      const result = await EventReplayService.replayEvents(options);
      
      console.log('\nReplay Results:');
      console.log(`Total Events: ${result.totalEvents}`);
      console.log(`Successful: ${result.successfulReplays}`);
      console.log(`Failed: ${result.failedReplays}`);
      console.log(`Skipped: ${result.skippedEvents}`);
      console.log(`Duration: ${result.duration}ms`);
      
      if (result.errors.length > 0) {
        console.log('\nErrors:');
        result.errors.forEach(error => {
          console.log(`  ${error.eventId}: ${error.error}`);
        });
      }
      
      process.exit(result.failedReplays > 0 ? 1 : 0);
    } catch (error) {
      console.error('Replay failed:', error);
      process.exit(1);
    }
  }

  /**
   * Parses command line arguments into replay options
   */
  private static parseArguments(args: string[]): ReplayOptions {
    const options: ReplayOptions = {};
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const nextArg = args[i + 1];
      
      switch (arg) {
        case '--event-type':
          options.eventType = nextArg;
          i++;
          break;
        case '--event-ids':
          options.eventIds = nextArg.split(',');
          i++;
          break;
        case '--correlation-id':
          options.correlationId = nextArg;
          i++;
          break;
        case '--start-date':
          options.startDate = new Date(nextArg);
          i++;
          break;
        case '--end-date':
          options.endDate = new Date(nextArg);
          i++;
          break;
        case '--status':
          options.status = nextArg as 'pending' | 'processed' | 'failed';
          i++;
          break;
        case '--limit':
          options.limit = parseInt(nextArg, 10);
          i++;
          break;
        case '--target-version':
          options.targetVersion = nextArg;
          i++;
          break;
        case '--delay':
          options.delayMs = parseInt(nextArg, 10);
          i++;
          break;
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--help':
          this.printHelp();
          process.exit(0);
          break;
      }
    }
    
    return options;
  }

  /**
   * Prints CLI help
   */
  private static printHelp(): void {
    console.log(`
Event Replay CLI

Usage: npm run replay -- [options]

Options:
  --event-type <type>        Replay events of specific type
  --event-ids <ids>          Replay specific events (comma-separated)
  --correlation-id <id>      Replay events with specific correlation ID
  --start-date <date>        Replay events from this date (ISO format)
  --end-date <date>          Replay events until this date (ISO format)
  --status <status>          Replay events with specific status (pending|processed|failed)
  --limit <number>           Maximum number of events to replay (default: 100)
  --target-version <version> Target version for event migration
  --delay <ms>               Delay between replays in milliseconds
  --dry-run                  Show what would be replayed without actually doing it
  --help                     Show this help message

Examples:
  npm run replay -- --event-type order.created --limit 50
  npm run replay -- --status failed --dry-run
  npm run replay -- --correlation-id 123e4567-e89b-12d3-a456-426614174000
  npm run replay -- --start-date 2023-01-01 --end-date 2023-01-31
    `);
  }
}

// HTTP Interface
export interface ReplayRequest {
  eventType?: string;
  eventIds?: string[];
  correlationId?: string;
  startDate?: string;
  endDate?: string;
  status?: 'pending' | 'processed' | 'failed';
  limit?: number;
  dryRun?: boolean;
  targetVersion?: string;
  delayMs?: number;
}

export class EventReplayHTTP {
  /**
   * Handles HTTP replay request
   */
  static async handleReplayRequest(req: ReplayRequest): Promise<ReplayResult> {
    try {
      // Convert request to replay options
      const options: ReplayOptions = {
        ...req,
        startDate: req.startDate ? new Date(req.startDate) : undefined,
        endDate: req.endDate ? new Date(req.endDate) : undefined,
      };

      // Validate options
      const validation = EventReplayService.validateReplayOptions(options);
      if (!validation.isValid) {
        throw new Error(`Invalid options: ${validation.errors.join(', ')}`);
      }

      return await EventReplayService.replayEvents(options);
    } catch (error) {
      logError(error as Error, { component: 'event-replay-http', request: req });
      throw error;
    }
  }

  /**
   * Gets replay statistics for HTTP endpoint
   */
  static async getStats(): Promise<any> {
    return await EventReplayService.getReplayStats();
  }
}

// Export utilities
export const replayEvents = (options: ReplayOptions) => EventReplayService.replayEvents(options);
export const replayEvent = (event: StoredEvent, options?: ReplayOptions) => 
  EventReplayService.replayEvent(event, options);
export const getReplayStats = () => EventReplayService.getReplayStats();