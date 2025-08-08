import pino from 'pino';
import { env } from '../config/env';

// Create logger configuration
const loggerConfig: pino.LoggerOptions = {
  level: env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
};

// Create logger instance
export const logger = pino(loggerConfig);

// Create child loggers for different components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Specific loggers for different parts of the application
export const appLogger = createLogger('app');
export const rabbitMQLogger = createLogger('rabbitmq');
export const redisLogger = createLogger('redis');
export const mongoLogger = createLogger('mongodb');
export const eventLogger = createLogger('events');
export const errorLogger = createLogger('errors');

// Log levels enum for type safety
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

// Utility functions for structured logging
export const logEvent = (eventType: string, eventData: any, metadata?: any) => {
  eventLogger.info({
    eventType,
    eventData,
    metadata,
    timestamp: new Date().toISOString(),
  }, `Event processed: ${eventType}`);
};

export const logError = (error: Error, context?: any) => {
  errorLogger.error({
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
    timestamp: new Date().toISOString(),
  }, `Error occurred: ${error.message}`);
};

export const logEventProcessing = (
  eventId: string,
  eventType: string,
  status: 'started' | 'completed' | 'failed',
  duration?: number,
  error?: Error
) => {
  const logData = {
    eventId,
    eventType,
    status,
    duration,
    timestamp: new Date().toISOString(),
    ...(error && {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    }),
  };

  if (status === 'failed') {
    eventLogger.error(logData, `Event processing failed: ${eventType}`);
  } else {
    eventLogger.info(logData, `Event processing ${status}: ${eventType}`);
  }
};

export const logRetry = (
  operation: string,
  attempt: number,
  maxAttempts: number,
  error?: Error
) => {
  logger.warn({
    operation,
    attempt,
    maxAttempts,
    timestamp: new Date().toISOString(),
    ...(error && {
      error: {
        name: error.name,
        message: error.message,
      },
    }),
  }, `Retry attempt ${attempt}/${maxAttempts} for operation: ${operation}`);
};

export const logCircuitBreaker = (
  operation: string,
  state: 'open' | 'closed' | 'half-open',
  reason?: string
) => {
  logger.warn({
    operation,
    circuitBreakerState: state,
    reason,
    timestamp: new Date().toISOString(),
  }, `Circuit breaker ${state} for operation: ${operation}`);
};