# Event-Driven E-Commerce Microservices Platform

A robust, scalable event-driven e-commerce system built with Node.js, TypeScript, RabbitMQ, MongoDB, and Redis. This platform demonstrates advanced microservices patterns including event sourcing, CQRS, circuit breakers, retry mechanisms, and comprehensive monitoring.

## 🏗️ Architecture Overview

The system consists of three core microservices that communicate through events:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Order Service │    │Inventory Service│    │Notification Svc │
│                 │    │                 │    │                 │
│ • Create Orders │    │ • Check Stock   │    │ • Send Emails   │
│ • Validate Data │    │ • Reserve Items │    │ • SMS Alerts    │
│ • Publish Events│    │ • Update Status │    │ • Push Notifs   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │    RabbitMQ     │
                    │  Message Broker │
                    │                 │
                    │ • Event Routing │
                    │ • Dead Letter Q │
                    │ • Retry Logic   │
                    └─────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    MongoDB      │    │     Redis       │    │   Monitoring    │
│                 │    │                 │    │                 │
│ • Event Store   │    │ • Idempotency   │    │ • Prometheus    │
│ • Event Replay  │    │ • Retry Counts  │    │ • Grafana       │
│ • Audit Trail   │    │ • Circuit State │    │ • Health Checks │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔄 Event Flow

The system follows this event-driven flow:

```mermaid
sequenceDiagram
    participant Client
    participant OrderService
    participant RabbitMQ
    participant InventoryService
    participant NotificationService
    participant MongoDB
    participant Redis

    Client->>OrderService: POST /orders
    OrderService->>Redis: Check idempotency
    OrderService->>MongoDB: Store event
    OrderService->>RabbitMQ: Publish order.created
    OrderService->>Client: 201 Created

    RabbitMQ->>InventoryService: Consume order.created
    InventoryService->>Redis: Check idempotency
    InventoryService->>InventoryService: Check stock
    InventoryService->>MongoDB: Store event
    InventoryService->>RabbitMQ: Publish inventory.status.updated

    RabbitMQ->>NotificationService: Consume inventory.status.updated
    NotificationService->>Redis: Check idempotency
    NotificationService->>NotificationService: Send notification
    NotificationService->>MongoDB: Store event
    NotificationService->>RabbitMQ: Publish notification.sent
```

## 🚀 Features

### Core Features
- **Event-Driven Architecture**: Asynchronous communication between services
- **Event Sourcing**: Complete audit trail of all system events
- **CQRS Pattern**: Separate read and write models
- **Microservices**: Independently deployable and scalable services

### Advanced Features
- **Message Processing**:
  - ✅ Configurable retry mechanisms with exponential backoff
  - ✅ Idempotency using Redis to prevent duplicate processing
  - ✅ Dead Letter Queue (DLQ) for failed messages
  - ✅ Message ordering with prefetch configuration

- **Event Handling**:
  - ✅ Schema validation using Zod with strict typing
  - ✅ Event versioning with backward compatibility
  - ✅ Event storage in MongoDB for replay and audit
  - ✅ Event replay functionality (CLI and HTTP)

- **Error Handling**:
  - ✅ Automatic reconnection for RabbitMQ and databases
  - ✅ Circuit breaker pattern using Opossum
  - ✅ Comprehensive retry mechanisms
  - ✅ Invalid message routing to DLQ

- **Monitoring & Logging**:
  - ✅ Structured JSON logging with Pino
  - ✅ Request/response logging
  - ✅ Error tracking and alerting
  - ✅ Health checks for all services

- **Infrastructure**:
  - ✅ Docker containerization
  - ✅ Docker Compose orchestration
  - ✅ Environment-based configuration
  - ✅ Service discovery and networking

## 📋 Prerequisites

- **Docker** (v20.10+)
- **Docker Compose** (v2.0+)
- **Node.js** (v18+) - for local development
- **npm** (v8+)

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd event-driven-ecommerce
```

### 2. Environment Configuration

Create environment files for each service:

```bash
# Copy example environment files
cp order-service/.env.example order-service/.env
cp inventory-service/.env.example inventory-service/.env
cp notification-service/.env.example notification-service/.env
```

### 3. Start the System

```bash
# Start all services with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### 4. Verify Installation

```bash
# Check service health
curl http://localhost:3001/health  # Order Service
curl http://localhost:3002/health  # Inventory Service
curl http://localhost:3003/health  # Notification Service

# Access management interfaces
open http://localhost:15672  # RabbitMQ Management (admin/admin123)
open http://localhost:9090   # Prometheus
open http://localhost:3000   # Grafana (admin/admin123)
```

## 🔧 Configuration

### Environment Variables

Each service supports the following environment variables:

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
SERVICE_NAME=order-service

# RabbitMQ
RABBITMQ_URL=amqp://admin:admin123@rabbitmq:5672/

# MongoDB
MONGODB_URL=mongodb://admin:admin123@mongodb:27017/ecommerce-events?authSource=admin

# Redis
REDIS_URL=redis://:redis123@redis:6379

# Message Processing
MAX_RETRIES=3
RETRY_DELAY=1000
IDEMPOTENCY_TTL=86400

# Circuit Breaker
CIRCUIT_BREAKER_TIMEOUT=30000
CIRCUIT_BREAKER_ERROR_THRESHOLD=50
CIRCUIT_BREAKER_RESET_TIMEOUT=60000
```

### Service Ports

| Service | Port | Description |
|---------|------|-------------|
| Order Service | 3001 | HTTP API |
| Inventory Service | 3002 | HTTP API |
| Notification Service | 3003 | HTTP API |
| RabbitMQ | 5672 | AMQP |
| RabbitMQ Management | 15672 | Web UI |
| MongoDB | 27017 | Database |
| Redis | 6379 | Cache |
| Prometheus | 9090 | Metrics |
| Grafana | 3000 | Dashboard |
| Nginx | 80/443 | Load Balancer |

## 📡 API Usage

### Create an Order

```bash
curl -X POST http://localhost:3001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "123e4567-e89b-12d3-a456-426614174000",
    "items": [
      {
        "productId": "prod-123",
        "productName": "Laptop",
        "quantity": 1,
        "unitPrice": 999.99
      }
    ]
  }'
```

### Response

```json
{
  "success": true,
  "message": "Order created successfully",
  "order": {
    "id": "order-456",
    "customerId": "123e4567-e89b-12d3-a456-426614174000",
    "items": [
      {
        "productId": "prod-123",
        "productName": "Laptop",
        "quantity": 1,
        "unitPrice": 999.99,
        "totalPrice": 999.99
      }
    ],
    "totalAmount": 999.99,
    "status": "PENDING",
    "createdAt": "2023-12-08T10:00:00.000Z",
    "updatedAt": "2023-12-08T10:00:00.000Z"
  }
}
```

### Health Check

```bash
curl http://localhost:3001/health
```

```json
{
  "status": "healthy",
  "timestamp": "2023-12-08T10:00:00.000Z",
  "uptime": 3600,
  "services": {
    "rabbitmq": "connected",
    "mongodb": "connected",
    "redis": "connected"
  }
}
```

## 🔄 Event Replay

The system supports event replay for recovery and testing:

### CLI Usage

```bash
# Replay failed events
npm run replay -- --status failed --limit 10

# Replay events by type
npm run replay -- --event-type order.created --limit 50

# Replay events by date range
npm run replay -- --start-date 2023-12-01 --end-date 2023-12-07

# Dry run (show what would be replayed)
npm run replay -- --status failed --dry-run

# Replay specific events
npm run replay -- --event-ids "event-1,event-2,event-3"

# Replay with delay between events
npm run replay -- --status failed --delay 1000
```

### HTTP API

```bash
# Replay events via HTTP
curl -X POST http://localhost:3001/admin/replay \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "order.created",
    "limit": 10,
    "dryRun": false
  }'

# Get replay statistics
curl http://localhost:3001/admin/replay/stats
```

## 📊 Monitoring

### Metrics

The system exposes metrics for monitoring:

- **Application Metrics**: Request rates, response times, error rates
- **Business Metrics**: Orders created, inventory checks, notifications sent
- **Infrastructure Metrics**: CPU, memory, disk usage
- **Message Queue Metrics**: Queue depths, processing rates, failures

### Dashboards

Access pre-configured dashboards:

1. **Grafana**: http://localhost:3000 (admin/admin123)
   - Service overview dashboard
   - Event processing metrics
   - Error tracking and alerting

2. **RabbitMQ Management**: http://localhost:15672 (admin/admin123)
   - Queue monitoring
   - Message rates
   - Connection status

### Alerts

Configure alerts for:
- High error rates
- Queue depth thresholds
- Service unavailability
- Circuit breaker activations

## 🧪 Testing

### Unit Tests

```bash
# Run tests for all services
npm run test

# Run tests for specific service
cd order-service && npm test
cd inventory-service && npm test
cd notification-service && npm test
```

### Integration Tests

```bash
# Start test environment
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# Cleanup
docker-compose -f docker-compose.test.yml down
```

### Load Testing

```bash
# Install k6
brew install k6  # macOS
# or download from https://k6.io/

# Run load tests
k6 run tests/load/order-creation.js
```

## 🔍 Troubleshooting

### Common Issues

1. **Services not starting**:
   ```bash
   # Check logs
   docker-compose logs service-name
   
   # Restart specific service
   docker-compose restart service-name
   ```

2. **RabbitMQ connection issues**:
   ```bash
   # Check RabbitMQ status
   docker-compose exec rabbitmq rabbitmq-diagnostics ping
   
   # Reset RabbitMQ
   docker-compose restart rabbitmq
   ```

3. **MongoDB connection issues**:
   ```bash
   # Check MongoDB status
   docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"
   
   # View MongoDB logs
   docker-compose logs mongodb
   ```

4. **Redis connection issues**:
   ```bash
   # Check Redis status
   docker-compose exec redis redis-cli ping
   
   # Clear Redis cache
   docker-compose exec redis redis-cli FLUSHALL
   ```

### Debug Mode

Enable debug logging:

```bash
# Set LOG_LEVEL to debug in docker-compose.yml
LOG_LEVEL=debug

# Restart services
docker-compose restart
```

### Performance Issues

1. **High memory usage**:
   - Adjust Node.js memory limits
   - Optimize database queries
   - Review event retention policies

2. **Slow message processing**:
   - Increase prefetch counts
   - Scale service replicas
   - Optimize message handlers

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**:
   ```bash
   # Use production environment file
   cp .env.production .env
   
   # Update sensitive credentials
   # - Database passwords
   # - RabbitMQ credentials
   # - Redis passwords
   # - SMTP settings
   ```

2. **Security Hardening**:
   - Enable TLS/SSL for all connections
   - Use secrets management (Docker Secrets, Kubernetes Secrets)
   - Configure firewall rules
   - Enable authentication and authorization

3. **Scaling**:
   ```bash
   # Scale services horizontally
   docker-compose up -d --scale order-service=3
   docker-compose up -d --scale inventory-service=2
   docker-compose up -d --scale notification-service=2
   ```

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods
kubectl get services
```

## 📚 Architecture Decisions

### Event Sourcing
- **Why**: Complete audit trail, temporal queries, replay capability
- **Trade-offs**: Increased storage, complexity in projections

### CQRS
- **Why**: Separate read/write optimization, scalability
- **Trade-offs**: Eventual consistency, increased complexity

### Circuit Breaker
- **Why**: Prevent cascade failures, improve resilience
- **Trade-offs**: Temporary service degradation

### Message Ordering
- **Why**: Ensure event processing order
- **Trade-offs**: Reduced throughput, single-threaded processing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Write comprehensive tests
- Use conventional commits
- Update documentation
- Ensure all checks pass

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **RabbitMQ** for reliable message queuing
- **MongoDB** for flexible document storage
- **Redis** for high-performance caching
- **Pino** for structured logging
- **Zod** for schema validation
- **Opossum** for circuit breaker implementation

---

## 📞 Support

For support and questions:

- Create an issue in the repository
- Check the troubleshooting section
- Review the logs for error details

**Happy coding! 🚀**