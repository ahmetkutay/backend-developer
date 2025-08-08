import express from 'express';

export function createServer(health: () => Promise<boolean>) {
  const app = express();
  app.use(express.json());

  app.get('/health', async (_req, res) => {
    try {
      const ok = await health();
      res.status(ok ? 200 : 500).json({
        status: ok ? 'ok' : 'fail',
        service: process.env.SERVICE_NAME || 'order-service',
        env: process.env.NODE_ENV || 'development'
      });
    } catch (e) {
      res.status(500).json({ status: 'fail' });
    }
  });

  return app;
}
