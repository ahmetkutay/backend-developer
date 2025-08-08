import dotenv from 'dotenv';
dotenv.config();

export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  SERVICE_NAME: process.env.SERVICE_NAME || 'notification-service',
  PORT: Number(process.env.PORT || 3003),
  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  MONGO_URL: process.env.MONGO_URL || 'mongodb://localhost:27017/notifications'
};
