import { config } from './config';
import logger from './logger';
import { createServer } from './http/server';

async function health(): Promise<boolean> {
  // Placeholder health: in future, check MQ and DB connectivity
  return true;
}

const app = createServer(health);

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, service: config.SERVICE_NAME }, 'Service started');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  // Force exit if not closed in time
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
