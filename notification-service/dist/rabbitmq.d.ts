export declare function connectRabbitMQ(): Promise<void>;
export declare function publishMessage(queue: string, message: object): Promise<void>;
export declare function consumeMessage(queue: string, callback: (message: any) => Promise<void>): Promise<void>;
export declare function closeConnection(): Promise<void>;
//# sourceMappingURL=rabbitmq.d.ts.map