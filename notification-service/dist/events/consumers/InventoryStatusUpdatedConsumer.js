"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryStatusUpdatedConsumer = void 0;
const rabbitmq_1 = require("../../rabbitmq");
const NotificationSentPublisher_1 = require("../publishers/NotificationSentPublisher");
class InventoryStatusUpdatedConsumer {
    constructor() {
        this.notificationPublisher = new NotificationSentPublisher_1.NotificationSentPublisher();
    }
    async start() {
        console.log(`Starting ${InventoryStatusUpdatedConsumer.name}...`);
        await (0, rabbitmq_1.consumeMessage)(InventoryStatusUpdatedConsumer.QUEUE_NAME, this.processMessage.bind(this));
    }
    async processMessage(message) {
        try {
            console.log('Processing inventory status update:', message);
            const notificationType = this.determineNotificationType(message.stockQuantity);
            const notificationMessage = this.generateNotificationMessage(message, notificationType);
            await this.sendNotificationToUser(message, notificationMessage, notificationType);
            const notificationData = {
                userId: message.userId || 'system',
                productId: message.productId,
                productName: message.productName,
                message: notificationMessage,
                type: notificationType,
                sentAt: new Date().toISOString()
            };
            await this.notificationPublisher.publish(notificationData);
        }
        catch (error) {
            console.error('Error processing inventory status update message:', error);
            throw error;
        }
    }
    determineNotificationType(stockQuantity) {
        if (stockQuantity === 0) {
            return 'stock_out';
        }
        else if (stockQuantity <= InventoryStatusUpdatedConsumer.LOW_STOCK_THRESHOLD) {
            return 'stock_low';
        }
        else {
            return 'stock_available';
        }
    }
    generateNotificationMessage(message, type) {
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
    async sendNotificationToUser(message, notificationMessage, type) {
        const delay = Math.random() * 1000 + 500;
        await new Promise(resolve => setTimeout(resolve, delay));
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
        console.log(`✅ Notification sent successfully for product ${message.productId}`);
    }
}
exports.InventoryStatusUpdatedConsumer = InventoryStatusUpdatedConsumer;
InventoryStatusUpdatedConsumer.QUEUE_NAME = 'inventory.status.updated';
InventoryStatusUpdatedConsumer.LOW_STOCK_THRESHOLD = 10;
//# sourceMappingURL=InventoryStatusUpdatedConsumer.js.map