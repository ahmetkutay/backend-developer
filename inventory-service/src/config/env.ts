import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

interface EnvConfig {
  RABBITMQ_URL: string;
  NODE_ENV: string;
}

const getEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`Environment variable ${name} is required but not set`);
  }
  return value;
};

export const env: EnvConfig = {
  RABBITMQ_URL: getEnvVar('RABBITMQ_URL'),
  NODE_ENV: getEnvVar('NODE_ENV', 'development'),
};

// Validate required environment variables on startup
export const validateEnv = (): void => {
  console.log('🔧 Validating environment variables...');
  
  try {
    console.log(`✅ RABBITMQ_URL: ${env.RABBITMQ_URL}`);
    console.log(`✅ NODE_ENV: ${env.NODE_ENV}`);
    console.log('✅ All environment variables are valid');
  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    process.exit(1);
  }
};