declare class RabbitMQConnection {
    private connection;
    private channel;
    private isConnected;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    publishMessage(queueName: string, message: object): Promise<void>;
    consumeMessage(queueName: string, callback: (message: any) => Promise<void>): Promise<void>;
    getConnectionStatus(): boolean;
    ensureConnection(): Promise<void>;
}
declare const rabbitMQ: RabbitMQConnection;
export { rabbitMQ };
export declare const connectRabbitMQ: () => Promise<void>;
export declare const disconnectRabbitMQ: () => Promise<void>;
export declare const publishMessage: (queueName: string, message: object) => Promise<void>;
export declare const consumeMessage: (queueName: string, callback: (message: any) => Promise<void>) => Promise<void>;
export declare const getRabbitMQStatus: () => boolean;
//# sourceMappingURL=rabbitmq.d.ts.map