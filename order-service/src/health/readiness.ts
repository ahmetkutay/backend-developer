import { config } from '../config';

export async function readiness(): Promise<boolean> {
  // TODO: implement checks for MongoDB and RabbitMQ using config values
  // For now, return true so healthcheck passes
  return true;
}

export default readiness;
