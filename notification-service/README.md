# Notification Service

Event-driven notification microservice for e-commerce platform that listens to inventory status updates and sends notifications to users.

## 🚀 Features

- **Event-Driven Architecture**: Listens to RabbitMQ messages for inventory status updates
- **Smart Notifications**: Automatically determines notification type based on stock levels
- **Turkish Language Support**: Notifications are generated in Turkish
- **Type-Safe**: Built with TypeScript in strict mode
- **Modular Design**: Clean separation of concerns with consumers and publishers
- **Error Handling**: Comprehensive error handling with retry mechanisms
- **Docker Support**: Ready for containerization
- **Graceful Shutdown**: Proper cleanup on service termination

## 📋 Requirements

- Node.js v18+
- RabbitMQ server
- TypeScript

## 🏗️ Architecture

```
notification-service/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── rabbitmq.ts                 # RabbitMQ connection utilities
│   ├── config/
│   │   └── env.ts                  # Environment configuration
│   └── events/
│       ├── consumers/
│       │   └── InventoryStatusUpdatedConsumer.ts
│       └── publishers/
│           └── NotificationSentPublisher.ts
├── .env                            # Environment variables
├── Dockerfile                      # Container configuration
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
└── test-message-sender.js          # Test script
```

## 🔧 Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your RabbitMQ URL
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## 🚀 Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Docker
```bash
# Build image
docker build -t notification-service .

# Run container
docker run -d --name notification-service \
  -e RABBITMQ_URL=amqp://rabbitmq:5672 \
  notification-service
```

## 📨 Message Formats

### Input: Inventory Status Updated
Queue: `inventory.status.updated`

```json
{
  "productId": "prod-123",
  "productName": "iPhone 15 Pro",
  "stockQuantity": 5,
  "previousStockQuantity": 15,
  "updatedAt": "2024-08-08T08:44:00.000Z",
  "userId": "user-456"
}
```

### Output: Notification Sent
Queue: `notification.sent`

```json
{
  "notificationId": "notif_1691484240000_abc123",
  "userId": "user-456",
  "productId": "prod-123",
  "productName": "iPhone 15 Pro",
  "message": "🔔 DÜŞÜK STOK: \"iPhone 15 Pro\" ürününde sadece 5 adet kalmıştır.",
  "type": "stock_low",
  "channel": "system",
  "status": "sent",
  "sentAt": "2024-08-08T08:44:00.000Z",
  "retryCount": 0,
  "metadata": {
    "service": "notification-service",
    "version": "1.0.0",
    "environment": "development",
    "timestamp": 1691484240000
  }
}
```

## 🔔 Notification Types

| Stock Quantity | Type | Turkish Message |
|----------------|------|-----------------|
| 0 | `stock_out` | ⚠️ STOK BİTTİ: "{productName}" ürünü stokta kalmamıştır. |
| 1-10 | `stock_low` | 🔔 DÜŞÜK STOK: "{productName}" ürününde sadece {quantity} adet kalmıştır. |
| 11+ | `stock_available` | ✅ STOK MEVCUT: "{productName}" ürünü stokta mevcuttur ({quantity} adet). |

## 🧪 Testing

### Manual Testing
1. Start the notification service:
   ```bash
   npm run dev
   ```

2. In another terminal, run the test script:
   ```bash
   node test-message-sender.js
   ```

3. Watch the console output for notifications.

### Test Messages
The test script sends three different scenarios:
- **Low Stock**: iPhone 15 Pro with 5 units
- **Out of Stock**: MacBook Pro M3 with 0 units  
- **Stock Available**: AirPods Pro with 50 units

## 🐳 Docker Compose Example

```yaml
version: '3.8'
services:
  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
    environment:
      RABBITMQ_DEFAULT_USER: admin
      RABBITMQ_DEFAULT_PASS: password

  notification-service:
    build: .
    environment:
      RABBITMQ_URL: amqp://admin:password@rabbitmq:5672
      NODE_ENV: production
    depends_on:
      - rabbitmq
    restart: unless-stopped
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RABBITMQ_URL` | RabbitMQ connection URL | `amqp://localhost:5672` |
| `NODE_ENV` | Environment mode | `development` |

### Queue Configuration
- **Durability**: All queues are durable
- **Persistence**: All messages are persistent
- **Acknowledgment**: Manual acknowledgment with error handling
- **Prefetch**: Set to 1 for fair dispatch

## 🛠️ Development

### Scripts
- `npm run build` - Build TypeScript
- `npm run dev` - Run in development mode
- `npm start` - Run production build
- `npm run clean` - Clean build directory

### Code Structure
- **Strict TypeScript**: Full type safety with strict mode
- **Modular Design**: Separate consumers and publishers
- **Error Handling**: Comprehensive error handling and logging
- **Graceful Shutdown**: Proper cleanup on SIGINT/SIGTERM

## 🔍 Monitoring

The service provides detailed console logging:
- Connection status
- Message processing
- Notification sending simulation
- Error handling
- Graceful shutdown

## 🚨 Error Handling

- **Connection Errors**: Automatic reconnection attempts
- **Message Processing**: Failed messages are requeued
- **Graceful Degradation**: Service continues running on non-critical errors
- **Retry Mechanism**: Built-in retry logic for failed operations

## 📝 License

ISC

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

---

**Note**: This service is designed for event-driven microservice architecture and requires RabbitMQ to be running for proper functionality.