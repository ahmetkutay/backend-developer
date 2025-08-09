import dotenv from 'dotenv';
dotenv.config();

const toNumber = (v: any, def: number) => (v !== undefined ? Number(v) : def);

export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  SERVICE_NAME: process.env.SERVICE_NAME || 'order-service',
  PORT: toNumber(process.env.PORT, 3001),
  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  MONGO_URL: process.env.MONGO_URL || 'mongodb://localhost:27017/orders',

  // Readiness
  READY_TIMEOUT_MS: toNumber(process.env.READY_TIMEOUT_MS, 1500),
  READY_RMQ_CHECK_QUEUE: process.env.READY_RMQ_CHECK_QUEUE || 'inventory.reserve.approved.q',
  PREFETCH: toNumber(process.env.PREFETCH, 1),
  CONSUMER_MAX_RETRIES: toNumber(process.env.CONSUMER_MAX_RETRIES, 3),

  // Circuit breaker (MQ)
  MQ_BREAKER_ENABLED: process.env.MQ_BREAKER_ENABLED !== 'false',
  MQ_BREAKER_TIMEOUT_MS: toNumber(process.env.MQ_BREAKER_TIMEOUT_MS, 2000),
  MQ_BREAKER_RESET_TIMEOUT_MS: toNumber(process.env.MQ_BREAKER_RESET_TIMEOUT_MS, 3000),
  MQ_BREAKER_ERROR_THRESHOLD_PERCENT: toNumber(process.env.MQ_BREAKER_ERROR_THRESHOLD_PERCENT, 50),
  MQ_BREAKER_VOLUME_THRESHOLD: toNumber(process.env.MQ_BREAKER_VOLUME_THRESHOLD, 5),

  // Circuit breaker (DB)
  DB_BREAKER_ENABLED: process.env.DB_BREAKER_ENABLED !== 'false',
  DB_BREAKER_TIMEOUT_MS: toNumber(process.env.DB_BREAKER_TIMEOUT_MS, 3000),
  DB_BREAKER_RESET_TIMEOUT_MS: toNumber(process.env.DB_BREAKER_RESET_TIMEOUT_MS, 5000),
  DB_BREAKER_ERROR_THRESHOLD_PERCENT: toNumber(process.env.DB_BREAKER_ERROR_THRESHOLD_PERCENT, 50),
  DB_BREAKER_VOLUME_THRESHOLD: toNumber(process.env.DB_BREAKER_VOLUME_THRESHOLD, 5),
};
