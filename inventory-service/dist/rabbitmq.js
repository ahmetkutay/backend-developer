"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRabbitMQStatus = exports.consumeMessage = exports.publishMessage = exports.disconnectRabbitMQ = exports.connectRabbitMQ = exports.rabbitMQ = void 0;
const amqplib_1 = __importDefault(require("amqplib"));
const env_1 = require("./config/env");
class RabbitMQConnection {
    constructor() {
        this.connection = null;
        this.channel = null;
        this.isConnected = false;
    }
    async connect() {
        try {
            console.log('🐰 Connecting to RabbitMQ...');
            this.connection = await amqplib_1.default.connect(env_1.env.RABBITMQ_URL);
            if (!this.connection) {
                throw new Error('Failed to establish RabbitMQ connection');
            }
            this.channel = await this.connection.createChannel();
            if (!this.channel) {
                throw new Error('Failed to create RabbitMQ channel');
            }
            this.isConnected = true;
            this.connection.on('error', (err) => {
                console.error('❌ RabbitMQ connection error:', err);
                this.isConnected = false;
            });
            this.connection.on('close', () => {
                console.log('🔌 RabbitMQ connection closed');
                this.isConnected = false;
            });
            console.log('✅ Connected to RabbitMQ successfully');
        }
        catch (error) {
            console.error('❌ Failed to connect to RabbitMQ:', error);
            this.isConnected = false;
            throw error;
        }
    }
    async disconnect() {
        try {
            if (this.channel) {
                await this.channel.close();
                this.channel = null;
            }
            if (this.connection) {
                await this.connection.close();
                this.connection = null;
            }
            this.isConnected = false;
            console.log('🔌 Disconnected from RabbitMQ');
        }
        catch (error) {
            console.error('❌ Error disconnecting from RabbitMQ:', error);
            throw error;
        }
    }
    async publishMessage(queueName, message) {
        if (!this.isConnected || !this.channel) {
            throw new Error('RabbitMQ is not connected');
        }
        try {
            await this.channel.assertQueue(queueName, {
                durable: true,
            });
            const messageBuffer = Buffer.from(JSON.stringify(message));
            const published = this.channel.sendToQueue(queueName, messageBuffer, {
                persistent: true,
            });
            if (published) {
                console.log(`📤 Message published to queue "${queueName}":`, message);
            }
            else {
                console.warn(`⚠️ Message may not have been published to queue "${queueName}"`);
            }
        }
        catch (error) {
            console.error(`❌ Failed to publish message to queue "${queueName}":`, error);
            throw error;
        }
    }
    async consumeMessage(queueName, callback) {
        if (!this.isConnected || !this.channel) {
            throw new Error('RabbitMQ is not connected');
        }
        try {
            await this.channel.assertQueue(queueName, {
                durable: true,
            });
            await this.channel.prefetch(1);
            console.log(`📥 Waiting for messages from queue "${queueName}". To exit press CTRL+C`);
            await this.channel.consume(queueName, async (msg) => {
                if (msg !== null) {
                    try {
                        const messageContent = JSON.parse(msg.content.toString());
                        console.log(`📨 Received message from queue "${queueName}":`, messageContent);
                        await callback(messageContent);
                        this.channel.ack(msg);
                        console.log(`✅ Message processed and acknowledged from queue "${queueName}"`);
                    }
                    catch (error) {
                        console.error(`❌ Error processing message from queue "${queueName}":`, error);
                        this.channel.nack(msg, false, false);
                    }
                }
            });
        }
        catch (error) {
            console.error(`❌ Failed to consume messages from queue "${queueName}":`, error);
            throw error;
        }
    }
    getConnectionStatus() {
        return this.isConnected;
    }
    async ensureConnection() {
        if (!this.isConnected) {
            await this.connect();
        }
    }
}
const rabbitMQ = new RabbitMQConnection();
exports.rabbitMQ = rabbitMQ;
const connectRabbitMQ = async () => {
    await rabbitMQ.connect();
};
exports.connectRabbitMQ = connectRabbitMQ;
const disconnectRabbitMQ = async () => {
    await rabbitMQ.disconnect();
};
exports.disconnectRabbitMQ = disconnectRabbitMQ;
const publishMessage = async (queueName, message) => {
    await rabbitMQ.ensureConnection();
    await rabbitMQ.publishMessage(queueName, message);
};
exports.publishMessage = publishMessage;
const consumeMessage = async (queueName, callback) => {
    await rabbitMQ.ensureConnection();
    await rabbitMQ.consumeMessage(queueName, callback);
};
exports.consumeMessage = consumeMessage;
const getRabbitMQStatus = () => {
    return rabbitMQ.getConnectionStatus();
};
exports.getRabbitMQStatus = getRabbitMQStatus;
process.on('SIGINT', async () => {
    console.log('🛑 Received SIGINT, closing RabbitMQ connection...');
    await (0, exports.disconnectRabbitMQ)();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, closing RabbitMQ connection...');
    await (0, exports.disconnectRabbitMQ)();
    process.exit(0);
});
//# sourceMappingURL=rabbitmq.js.map