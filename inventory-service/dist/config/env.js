"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnv = exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const getEnvVar = (name, defaultValue) => {
    const value = process.env[name] || defaultValue;
    if (!value) {
        throw new Error(`Environment variable ${name} is required but not set`);
    }
    return value;
};
exports.env = {
    RABBITMQ_URL: getEnvVar('RABBITMQ_URL'),
    NODE_ENV: getEnvVar('NODE_ENV', 'development'),
};
const validateEnv = () => {
    console.log('🔧 Validating environment variables...');
    try {
        console.log(`✅ RABBITMQ_URL: ${exports.env.RABBITMQ_URL}`);
        console.log(`✅ NODE_ENV: ${exports.env.NODE_ENV}`);
        console.log('✅ All environment variables are valid');
    }
    catch (error) {
        console.error('❌ Environment validation failed:', error);
        process.exit(1);
    }
};
exports.validateEnv = validateEnv;
//# sourceMappingURL=env.js.map