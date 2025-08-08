import { consumeMessage } from '../../rabbitmq';
import { NotificationSentPublisher } from '../publishers/NotificationSentPublisher';

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

export class InventoryStatusUpdatedConsumer {
  private static readonly QUEUE_NAME = 'inventory.status.updated';
  private static readonly LOW_STOCK_THRESHOLD = 10;
  
  private notificationPublisher: NotificationSentPublisher;

  constructor() {
    this.notificationPublisher = new NotificationSentPublisher();
  }

  async start(): Promise<void> {
    console.log(`Starting ${InventoryStatusUpdatedConsumer.name}...`);
    
    await consumeMessage(
      InventoryStatusUpdatedConsumer.QUEUE_NAME,
      this.processMessage.bind(this)
    );
  }

  private async processMessage(message: InventoryStatusUpdatedMessage): Promise<void> {
    try {
      console.log('Processing inventory status update:', message);

      // Determine notification type and message based on stock status
      const notificationType = this.determineNotificationType(message.stockQuantity);
      const notificationMessage = this.generateNotificationMessage(message, notificationType);

      // Simulate sending notification to user (console.log as requested)
      await this.sendNotificationToUser(message, notificationMessage, notificationType);

      // Publish notification sent event
      const notificationData: NotificationData = {
        userId: message.userId || 'system', // Default to system if no specific user
        productId: message.productId,
        productName: message.productName,
        message: notificationMessage,
        type: notificationType,
        sentAt: new Date().toISOString()
      };

      await this.notificationPublisher.publish(notificationData);

    } catch (error) {
      console.error('Error processing inventory status update message:', error);
      throw error; // Re-throw to trigger message requeue
    }
  }

  private determineNotificationType(stockQuantity: number): 'stock_low' | 'stock_out' | 'stock_available' {
    if (stockQuantity === 0) {
      return 'stock_out';
    } else if (stockQuantity <= InventoryStatusUpdatedConsumer.LOW_STOCK_THRESHOLD) {
      return 'stock_low';
    } else {
      return 'stock_available';
    }
  }

  private generateNotificationMessage(
    message: InventoryStatusUpdatedMessage, 
    type: 'stock_low' | 'stock_out' | 'stock_available'
  ): string {
    const { productName, stockQuantity } = message;

    switch (type) {
      case 'stock_out':
        return `⚠️ STOK BİTTİ: "${productName}" ürünü stokta kalmamıştır. Lütfen tedarik sağlayın.`;
      
      case 'stock_low':
        return `🔔 DÜŞÜK STOK: "${productName}" ürününde sadece ${stockQuantity} adet kalmıştır. Stok yenilenmesi gerekebilir.`;
      
      case 'stock_available':
        return `✅ STOK MEVCUT: "${productName}" ürünü stokta mevcuttur (${stockQuantity} adet).`;
      
      default:
        return `📦 STOK DURUMU: "${productName}" ürünü için stok durumu güncellendi (${stockQuantity} adet).`;
    }
  }

  private async sendNotificationToUser(
    message: InventoryStatusUpdatedMessage,
    notificationMessage: string,
    type: 'stock_low' | 'stock_out' | 'stock_available'
  ): Promise<void> {
    // Simulate notification sending delay (bonus feature)
    const delay = Math.random() * 1000 + 500; // 500-1500ms delay
    await new Promise(resolve => setTimeout(resolve, delay));

    // Simulate sending notification (console.log as requested)
    console.log('='.repeat(80));
    console.log('📱 KULLANICIYA BİLDİRİM GÖNDERİLDİ');
    console.log('='.repeat(80));
    console.log(`👤 Kullanıcı ID: ${message.userId || 'system'}`);
    console.log(`📦 Ürün: ${message.productName} (ID: ${message.productId})`);
    console.log(`📊 Stok Miktarı: ${message.stockQuantity}`);
    console.log(`🔔 Bildirim Türü: ${type.toUpperCase()}`);
    console.log(`💬 Mesaj: ${notificationMessage}`);
    console.log(`⏰ Gönderim Zamanı: ${new Date().toLocaleString('tr-TR')}`);
    console.log('='.repeat(80));

    // Log successful notification
    console.log(`✅ Notification sent successfully for product ${message.productId}`);
  }
}