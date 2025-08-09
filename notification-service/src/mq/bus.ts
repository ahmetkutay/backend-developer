import { Channel, ConsumeMessage } from 'amqplib';
import logger from '../logger';
import { config } from '../config';
import { executeWithBreaker } from '../utils/breaker';

export type Handler = (
  msg: any,
  raw: ConsumeMessage,
  helpers: { ack: () => void; retry: () => void; dlq: () => void }
) => Promise<void>;

export class MessageBus {
  constructor(private ch: Channel, private service: string) {}

  async publish(exchange: string, routingKey: string, event: any, headers: Record<string, any> = {}) {
    const payload = Buffer.from(JSON.stringify(event));
    const options = {
      timeout: config.MQ_BREAKER_TIMEOUT_MS,
      resetTimeout: config.MQ_BREAKER_RESET_TIMEOUT_MS,
      errorThresholdPercentage: config.MQ_BREAKER_ERROR_THRESHOLD_PERCENT,
      volumeThreshold: config.MQ_BREAKER_VOLUME_THRESHOLD,
    };
    await executeWithBreaker('mq.publish', async () => {
      const ok = this.ch.publish(exchange, routingKey, payload, {
        contentType: 'application/json',
        persistent: true,
        headers,
      });
      if (!ok) logger.warn({ routingKey }, '[MQ] publish backpressure');
      return ok;
    }, options, config.MQ_BREAKER_ENABLED);
  }

  async consume(queue: string, handler: Handler, options?: { maxRetries?: number }) {
    const maxRetries = options?.maxRetries ?? config.CONSUMER_MAX_RETRIES;
    await this.ch.consume(
      queue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;
        const headers = msg.properties.headers || {};
        const attempts = (headers['x-attempt'] as number) || 0;

        const ack = () => this.ch.ack(msg);
        const retry = () => {
          const nextAttempt = attempts + 1;
          if (nextAttempt > maxRetries) {
            this.ch.publish('', `${queue}.dlq`, msg.content, {
              headers: { ...headers, 'x-attempt': nextAttempt },
              persistent: true,
            });
            return this.ch.ack(msg);
          }
          this.ch.publish('', `${queue}.retry`, msg.content, {
            headers: { ...headers, 'x-attempt': nextAttempt },
            persistent: true,
          });
          this.ch.ack(msg);
        };
        const dlq = () => {
          this.ch.publish('', `${queue}.dlq`, msg.content, { headers, persistent: true });
          this.ch.ack(msg);
        };

        try {
          const parsed = JSON.parse(msg.content.toString());
          await handler(parsed, msg, { ack, retry, dlq });
        } catch (err) {
          logger.error({ err, queue }, '[MQ] handler error');
          retry();
        }
      },
      { noAck: false }
    );
  }
}
