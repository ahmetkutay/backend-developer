import { publishMessage } from '../../rabbitmq';
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

export class NotificationSentPublisher {
  private static readonly QUEUE_NAME = 'notification.sent';

  constructor() {}

  async publish(notificationData: NotificationData): Promise<void> {
    try {
      console.log('Publishing notification sent event...');

      // Create notification sent message with additional metadata
      const notificationSentMessage: NotificationSentMessage = {
        ...notificationData,
        notificationId: this.generateNotificationId(),
        channel: 'system', // Since we're using console.log simulation
        status: 'sent',
        retryCount: 0,
        metadata: {
          service: 'notification-service',
          version: '1.0.0',
          environment: process.env['NODE_ENV'] || 'development',
          timestamp: Date.now()
        }
      };

      // Publish to notification.sent queue
      await publishMessage(
        NotificationSentPublisher.QUEUE_NAME,
        notificationSentMessage
      );

      console.log(`✅ Notification sent event published successfully for product ${notificationData.productId}`);

    } catch (error) {
      console.error('Error publishing notification sent event:', error);
      
      // Create failed notification message
      const failedNotificationMessage: NotificationSentMessage = {
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
        // Try to publish failed notification event
        await publishMessage(
          NotificationSentPublisher.QUEUE_NAME,
          failedNotificationMessage
        );
      } catch (publishError) {
        console.error('Failed to publish failed notification event:', publishError);
      }

      throw error; // Re-throw original error
    }
  }

  private generateNotificationId(): string {
    // Generate a unique notification ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `notif_${timestamp}_${random}`;
  }

  // Method to publish retry notification (bonus feature)
  async publishRetry(
    notificationData: NotificationData, 
    retryCount: number, 
    error: string
  ): Promise<void> {
    try {
      const retryNotificationMessage: NotificationSentMessage = {
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

      await publishMessage(
        NotificationSentPublisher.QUEUE_NAME,
        retryNotificationMessage
      );

      console.log(`🔄 Notification retry event published (attempt ${retryCount}) for product ${notificationData.productId}`);

    } catch (publishError) {
      console.error('Error publishing notification retry event:', publishError);
      throw publishError;
    }
  }
}