import { NotificationData } from '../consumers/InventoryStatusUpdatedConsumer';
export interface NotificationSentMessage extends NotificationData {
    notificationId: string;
    channel: 'system' | 'email' | 'sms' | 'push';
    status: 'sent' | 'failed' | 'pending';
    retryCount?: number;
    metadata?: {
        [key: string]: any;
    };
}
export declare class NotificationSentPublisher {
    private static readonly QUEUE_NAME;
    constructor();
    publish(notificationData: NotificationData): Promise<void>;
    private generateNotificationId;
    publishRetry(notificationData: NotificationData, retryCount: number, error: string): Promise<void>;
}
//# sourceMappingURL=NotificationSentPublisher.d.ts.map