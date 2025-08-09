import { config } from '../config';
import logger from '../logger';

export function buildReadiness(getState: () => { mq: any | null; mongo: any | null }) {
  return async function readiness(): Promise<boolean> {
    const { mq, mongo } = getState() || ({} as any);
    if (!mq || !mongo) return false;
    const timeout = config.READY_TIMEOUT_MS || 1500;
    const withTimeout = async <T>(p: Promise<T>): Promise<T> => {
      return await Promise.race<T>([
        p,
        new Promise<T>((_r, rej) => setTimeout(() => rej(new Error('ready_timeout')), timeout)) as Promise<T>,
      ]);
    };
    try {
      await withTimeout(mongo.db.command({ ping: 1 }) as any);
      const q = config.READY_RMQ_CHECK_QUEUE || 'order.created.q';
      await withTimeout((mq as any)?.ch.checkQueue(q));
      return true;
    } catch (e) {
      logger.warn({ e }, '[Inventory] readiness check failed');
      return false;
    }
  };
}

export default buildReadiness;
