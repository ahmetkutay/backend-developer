declare class NotificationService {
    private inventoryConsumer;
    private isShuttingDown;
    constructor();
    start(): Promise<void>;
    shutdown(): Promise<void>;
    private setupGracefulShutdown;
}
export { NotificationService };
//# sourceMappingURL=index.d.ts.map