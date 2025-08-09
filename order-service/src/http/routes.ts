import { Application, Router } from 'express';
import { createOrdersController, OrdersControllerDeps } from './controllers/orders.controller';

export type OrdersDepsProvider = () => OrdersControllerDeps | null;

export function registerOrderRoutes(app: Application, getDeps: OrdersDepsProvider) {
  const router = Router();
  const ctrl = createOrdersController(getDeps);

  router.post('/orders', ctrl.createOrder);
  router.post('/orders/:id/cancel', ctrl.cancelOrder);

  app.use('/', router);
}

export default registerOrderRoutes;
