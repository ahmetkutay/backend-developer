"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function validateEnv() {
    const requiredEnvVars = ['RABBITMQ_URL'];
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
    }
    return {
        RABBITMQ_URL: process.env['RABBITMQ_URL'],
        NODE_ENV: process.env['NODE_ENV'] || 'development'
    };
}
exports.env = validateEnv();
//# sourceMappingURL=env.js.map