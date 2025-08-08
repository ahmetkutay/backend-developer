"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRabbitMQ = connectRabbitMQ;
exports.publishMessage = publishMessage;
exports.consumeMessage = consumeMessage;
exports.closeConnection = closeConnection;
const amqplib_1 = __importDefault(require("amqplib"));
const env_1 = require("./config/env");
let connection = null;
let channel = null;
async function connectRabbitMQ() {
    try {
        console.log('Connecting to RabbitMQ...');
        connection = await amqplib_1.default.connect(env_1.env.RABBITMQ_URL);
        if (!connection) {
            throw new Error('Failed to establish RabbitMQ connection');
        }
        channel = await connection.createChannel();
        console.log('Connected to RabbitMQ successfully');
        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err);
        });
        connection.on('close', () => {
            console.log('RabbitMQ connection closed');
        });
    }
    catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        throw error;
    }
}
async function publishMessage(queue, message) {
    if (!channel) {
        throw new Error('RabbitMQ channel not initialized. Call connectRabbitMQ() first.');
    }
    try {
        await channel.assertQueue(queue, { durable: true });
        const messageBuffer = Buffer.from(JSON.stringify(message));
        const published = channel.sendToQueue(queue, messageBuffer, {
            persistent: true
        });
        if (published) {
            console.log(`Message published to queue "${queue}":`, message);
        }
        else {
            console.warn(`Failed to publish message to queue "${queue}"`);
        }
    }
    catch (error) {
        console.error(`Error publishing message to queue "${queue}":`, error);
        throw error;
    }
}
async function consumeMessage(queue, callback) {
    if (!channel) {
        throw new Error('RabbitMQ channel not initialized. Call connectRabbitMQ() first.');
    }
    try {
        await channel.assertQueue(queue, { durable: true });
        await channel.prefetch(1);
        console.log(`Starting to consume messages from queue "${queue}"`);
        await channel.consume(queue, async (msg) => {
            if (msg) {
                try {
                    const messageContent = JSON.parse(msg.content.toString());
                    console.log(`Received message from queue "${queue}":`, messageContent);
                    await callback(messageContent);
                    channel.ack(msg);
                    console.log(`Message processed and acknowledged from queue "${queue}"`);
                }
                catch (error) {
                    console.error(`Error processing message from queue "${queue}":`, error);
                    channel.nack(msg, false, true);
                }
            }
        });
    }
    catch (error) {
        console.error(`Error setting up consumer for queue "${queue}":`, error);
        throw error;
    }
}
async function closeConnection() {
    try {
        if (channel) {
            await channel.close();
            channel = null;
        }
        if (connection) {
            await connection.close();
            connection = null;
        }
        console.log('RabbitMQ connection closed successfully');
    }
    catch (error) {
        console.error('Error closing RabbitMQ connection:', error);
    }
}
process.on('SIGINT', async () => {
    console.log('Received SIGINT, closing RabbitMQ connection...');
    await closeConnection();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, closing RabbitMQ connection...');
    await closeConnection();
    process.exit(0);
});
//# sourceMappingURL=rabbitmq.js.map