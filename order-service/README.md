# Order Service

Event-driven mikroservis for e-commerce platform that handles order creation and publishes `order.created` events to RabbitMQ.

## 🚀 Features

- **Order Creation**: REST API endpoint for creating new orders
- **Event Publishing**: Publishes `order.created` events to RabbitMQ queue
- **Type Safety**: Full TypeScript implementation with strict type checking
- **Docker Support**: Containerized application with multi-stage builds
- **Health Checks**: Built-in health check endpoint
- **Graceful Shutdown**: Proper cleanup of RabbitMQ connections

## 🛠 Tech Stack

- **Node.js** v18+
- **TypeScript** 5.3+
- **Express** - Web framework
- **amqplib** - RabbitMQ client
- **dotenv** - Environment configuration
- **Docker** - Containerization

## 📁 Project Structure

```
order-service/
├── src/
│   ├── index.ts                    # Express app and HTTP endpoints
│   ├── rabbitmq.ts                 # RabbitMQ connection and messaging
│   ├── events/
│   │   └── publishers/
│   │       └── OrderCreatedPublisher.ts
│   └── config/
│       └── env.ts                  # Environment configuration
├── .env                            # Environment variables
├── Dockerfile                      # Docker configuration
├── tsconfig.json                   # TypeScript configuration
├── package.json                    # Dependencies and scripts
└── README.md                       # This file
```

## 🔧 Environment Variables

Create a `.env` file in the root directory:

```env
# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672

# Server Configuration
PORT=3001

# Node Environment
NODE_ENV=development
```

## 🚀 Getting Started

### Prerequisites

- Node.js v18 or higher
- RabbitMQ server running
- npm or yarn package manager

### Installation

1. **Clone and navigate to the project:**
   ```bash
   cd order-service
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

5. **Start the service:**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## 📡 API Endpoints

### Create Order
**POST** `/orders`

Creates a new order and publishes an `order.created` event to RabbitMQ.

**Request Body:**
```json
{
  "customerId": "customer-123",
  "items": [
    {
      "productId": "product-456",
      "productName": "Sample Product",
      "quantity": 2,
      "unitPrice": 29.99
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "id": "generated-uuid",
    "customerId": "customer-123",
    "items": [
      {
        "productId": "product-456",
        "productName": "Sample Product",
        "quantity": 2,
        "unitPrice": 29.99,
        "totalPrice": 59.98
      }
    ],
    "totalAmount": 59.98,
    "status": "PENDING",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Health Check
**GET** `/health`

Returns service health status and RabbitMQ connection status.

**Response:**
```json
{
  "status": "OK",
  "service": "order-service",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "rabbitmq": "connected",
  "version": "1.0.0"
}
```

## 🐰 RabbitMQ Integration

The service publishes events to the `order.created` queue with the following message structure:

```json
{
  "eventType": "order.created",
  "eventId": "order-created-{orderId}-{timestamp}",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "data": {
    "id": "order-uuid",
    "customerId": "customer-123",
    "items": [
      {
        "productId": "product-456",
        "productName": "Sample Product",
        "quantity": 2,
        "unitPrice": 29.99,
        "totalPrice": 59.98
      }
    ],
    "totalAmount": 59.98,
    "status": "PENDING",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

## 🐳 Docker Usage

### Build Image
```bash
# Development
docker build --target development -t order-service:dev .

# Production
docker build --target production -t order-service:prod .
```

### Run Container
```bash
# Development
docker run -p 3001:3001 --env-file .env order-service:dev

# Production
docker run -p 3001:3001 --env-file .env order-service:prod
```

### Docker Compose Example
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
      RABBITMQ_DEFAULT_PASS: admin

  order-service:
    build: .
    ports:
      - "3001:3001"
    environment:
      RABBITMQ_URL: amqp://admin:admin@rabbitmq:5672
      PORT: 3001
      NODE_ENV: production
    depends_on:
      - rabbitmq
```

## 📝 Available Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run dev` - Start development server with ts-node
- `npm run dev:watch` - Start development server with watch mode
- `npm run clean` - Clean build directory

## 🔍 Monitoring

The service includes:
- Request logging middleware
- Health check endpoint at `/health`
- Docker health checks
- Graceful shutdown handling (SIGINT, SIGTERM)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.