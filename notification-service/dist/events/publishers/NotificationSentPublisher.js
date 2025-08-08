"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationSentPublisher = void 0;
const rabbitmq_1 = require("../../rabbitmq");
class NotificationSentPublisher {
    constructor() { }
    async publish(notificationData) {
        try {
            console.log('Publishing notification sent event...');
            const notificationSentMessage = {
                ...notificationData,
                notificationId: this.generateNotificationId(),
                channel: 'system',
                status: 'sent',
                retryCount: 0,
                metadata: {
                    service: 'notification-service',
                    version: '1.0.0',
                    environment: process.env['NODE_ENV'] || 'development',
                    timestamp: Date.now()
                }
            };
            await (0, rabbitmq_1.publishMessage)(NotificationSentPublisher.QUEUE_NAME, notificationSentMessage);
            console.log(`✅ Notification sent event published successfully for product ${notificationData.productId}`);
        }
        catch (error) {
            console.error('Error publishing notification sent event:', error);
            const failedNotificationMessage = {
                ...notificationData,
                notificationId: this.generateNotificationId(),
                channel: 'system',
                status: 'failed',
                retryCount: 0,
                metadata: {
                    service: 'notification-service',
                    version: '1.0.0',
                    environment: process.env['NODE_ENV'] || 'development',
                    timestamp: Date.now(),
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            };
            try {
                await (0, rabbitmq_1.publishMessage)(NotificationSentPublisher.QUEUE_NAME, failedNotificationMessage);
            }
            catch (publishError) {
                console.error('Failed to publish failed notification event:', publishError);
            }
            throw error;
        }
    }
    generateNotificationId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `notif_${timestamp}_${random}`;
    }
    async publishRetry(notificationData, retryCount, error) {
        try {
            const retryNotificationMessage = {
                ...notificationData,
                notificationId: this.generateNotificationId(),
                channel: 'system',
                status: 'pending',
                retryCount,
                metadata: {
                    service: 'notification-service',
                    version: '1.0.0',
                    environment: process.env['NODE_ENV'] || 'development',
                    timestamp: Date.now(),
                    retryReason: error,
                    isRetry: true
                }
            };
            await (0, rabbitmq_1.publishMessage)(NotificationSentPublisher.QUEUE_NAME, retryNotificationMessage);
            console.log(`🔄 Notification retry event published (attempt ${retryCount}) for product ${notificationData.productId}`);
        }
        catch (publishError) {
            console.error('Error publishing notification retry event:', publishError);
            throw publishError;
        }
    }
}
exports.NotificationSentPublisher = NotificationSentPublisher;
NotificationSentPublisher.QUEUE_NAME = 'notification.sent';
//# sourceMappingURL=NotificationSentPublisher.js.map