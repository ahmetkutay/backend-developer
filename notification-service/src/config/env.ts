import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

interface EnvConfig {
  RABBITMQ_URL: string;
  NODE_ENV: string;
}

function validateEnv(): EnvConfig {
  const requiredEnvVars = ['RABBITMQ_URL'];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    RABBITMQ_URL: process.env['RABBITMQ_URL']!,
    NODE_ENV: process.env['NODE_ENV'] || 'development'
  };
}

export const env = validateEnv();