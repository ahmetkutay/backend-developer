export interface InventoryStatusUpdatedMessage {
    productId: string;
    productName: string;
    stockQuantity: number;
    previousStockQuantity?: number;
    updatedAt: string;
    userId?: string;
}
export interface NotificationData {
    userId: string;
    productId: string;
    productName: string;
    message: string;
    type: 'stock_low' | 'stock_out' | 'stock_available';
    sentAt: string;
}
export declare class InventoryStatusUpdatedConsumer {
    private static readonly QUEUE_NAME;
    private static readonly LOW_STOCK_THRESHOLD;
    private notificationPublisher;
    constructor();
    start(): Promise<void>;
    private processMessage;
    private determineNotificationType;
    private generateNotificationMessage;
    private sendNotificationToUser;
}
//# sourceMappingURL=InventoryStatusUpdatedConsumer.d.ts.map