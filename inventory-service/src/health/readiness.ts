import { config } from '../config';

export async function readiness(): Promise<boolean> {
  // TODO: Implement checks for RabbitMQ and Mongo using config values
  return true;
}

export default readiness;
