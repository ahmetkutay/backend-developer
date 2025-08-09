import express from 'express';

export function createServer(liveness: () => Promise<boolean>, readiness?: () => Promise<boolean>) {
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      const ok = await liveness();
      res.status(ok ? 200 : 500).json({
        status: ok ? 'ok' : 'fail',
        service: process.env.SERVICE_NAME || 'order-service',
        env: process.env.NODE_ENV || 'development'
      });
    } catch (e) {
      res.status(500).json({ status: 'fail' });
    }
  });

  app.get('/ready', async (_req, res) => {
    try {
      const check = readiness || liveness;
      const ok = await check();
      res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'not_ready' });
    } catch (e) {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  return app;
}
