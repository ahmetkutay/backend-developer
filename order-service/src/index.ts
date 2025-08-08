import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { env, validateEnv } from './config/env';
import { connectRabbitMQ, getRabbitMQStatus } from './rabbitmq';
import { 
  OrderCreatedPublisher, 
  OrderCreatedEvent, 
  OrderItem, 
  OrderStatus 
} from './events/publishers/OrderCreatedPublisher';

// Initialize Express app
const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  const rabbitMQStatus = getRabbitMQStatus();
  
  res.status(200).json({
    status: 'OK',
    service: 'order-service',
    timestamp: new Date().toISOString(),
    rabbitmq: rabbitMQStatus ? 'connected' : 'disconnected',
    version: '1.0.0'
  });
});

// Interface for order creation request
interface CreateOrderRequest {
  customerId: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
}

// Validation middleware for order creation
const validateOrderRequest = (req: Request, res: Response, next: NextFunction): void => {
  const { customerId, items } = req.body as CreateOrderRequest;

  // Validate required fields
  if (!customerId || typeof customerId !== 'string') {
    res.status(400).json({
      error: 'customerId is required and must be a string'
    });
    return;
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({
      error: 'items is required and must be a non-empty array'
    });
    return;
  }

  // Validate each item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    if (!item || !item.productId || typeof item.productId !== 'string') {
      res.status(400).json({
        error: `items[${i}].productId is required and must be a string`
      });
      return;
    }

    if (!item.productName || typeof item.productName !== 'string') {
      res.status(400).json({
        error: `items[${i}].productName is required and must be a string`
      });
      return;
    }

    if (!item.quantity || typeof item.quantity !== 'number' || item.quantity <= 0) {
      res.status(400).json({
        error: `items[${i}].quantity is required and must be a positive number`
      });
      return;
    }

    if (!item.unitPrice || typeof item.unitPrice !== 'number' || item.unitPrice <= 0) {
      res.status(400).json({
        error: `items[${i}].unitPrice is required and must be a positive number`
      });
      return;
    }
  }

  next();
};

// POST /orders endpoint - Create new order
app.post('/orders', validateOrderRequest, async (req: Request, res: Response) => {
  try {
    const { customerId, items } = req.body as CreateOrderRequest;
    
    // Generate unique order ID
    const orderId = uuidv4();
    const now = new Date().toISOString();

    // Calculate order items with total prices
    const orderItems: OrderItem[] = items.map(item => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice
    }));

    // Calculate total amount
    const totalAmount = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);

    // Create order data
    const orderData: OrderCreatedEvent = {
      id: orderId,
      customerId,
      items: orderItems,
      totalAmount,
      status: OrderStatus.PENDING,
      createdAt: now,
      updatedAt: now
    };

    // Publish order created event to RabbitMQ
    await OrderCreatedPublisher.publishOrderCreated(orderData);

    // Return success response
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: {
        id: orderId,
        customerId,
        items: orderItems,
        totalAmount,
        status: OrderStatus.PENDING,
        createdAt: now,
        updatedAt: now
      }
    });

    console.log(`✅ Order created successfully: ${orderId}`);
  } catch (error) {
    console.error('❌ Error creating order:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Start server function
const startServer = async (): Promise<void> => {
  try {
    // Validate environment variables
    validateEnv();

    // Connect to RabbitMQ
    await connectRabbitMQ();

    // Start HTTP server
    app.listen(env.PORT, () => {
      console.log(`🚀 Order Service started successfully!`);
      console.log(`📡 Server running on port ${env.PORT}`);
      console.log(`🌍 Environment: ${env.NODE_ENV}`);
      console.log(`🐰 RabbitMQ: ${getRabbitMQStatus() ? 'Connected' : 'Disconnected'}`);
      console.log(`📋 Available endpoints:`);
      console.log(`   GET  /health - Health check`);
      console.log(`   POST /orders - Create new order`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer().catch((error) => {
  console.error('❌ Fatal error during startup:', error);
  process.exit(1);
});