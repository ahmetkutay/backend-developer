import amqplib from 'amqplib';
import logger from '../logger';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MQ {
  conn: any;
  ch: any;
}

export async function connectRabbit(url: string, prefetch = 1): Promise<MQ> {
  let attempt = 0;
  while (true) {
    try {
      const conn = await amqplib.connect(url);
      const ch = await conn.createChannel();
      if (prefetch > 0) await ch.prefetch(prefetch);
      conn.on('error', (err: unknown) => logger.error({ err }, '[MQ] connection error'));
      conn.on('close', () => logger.warn('[MQ] connection closed'));
      logger.info({ url }, '[MQ] connected');
      return { conn, ch };
    } catch (err) {
      attempt++;
      const backoff = Math.min(30000, 1000 * 2 ** attempt);
      logger.warn({ attempt, backoff, err }, '[MQ] connect failed, retrying');
      await sleep(backoff);
    }
  }
}

export async function closeRabbit(mq: MQ | null) {
  try {
    await mq?.ch.close();
  } catch {}
  try {
    await mq?.conn.close();
  } catch {}
}
