// MongoDB initialization script: create DBs, collections, and indexes

// Orders DB: event store and read model
var dbOrders = db.getSiblingDB('orders');

dbOrders.createCollection('events');
dbOrders.events.createIndex({ eventId: 1 }, { unique: true });
dbOrders.events.createIndex({ 'payload.orderId': 1 }, { background: true });

dbOrders.createCollection('orders');
dbOrders.orders.createIndex({ orderId: 1 }, { unique: true });
dbOrders.orders.createIndex({ status: 1 }, { background: true });

// Inventory DB: reservations
var dbInventory = db.getSiblingDB('inventory');

dbInventory.createCollection('reservations');
dbInventory.reservations.createIndex({ reservationId: 1 }, { unique: true });
dbInventory.reservations.createIndex({ orderId: 1 }, { background: true });

// Notifications DB: event store (optional)
var dbNotifications = db.getSiblingDB('notifications');

dbNotifications.createCollection('events');
dbNotifications.events.createIndex({ eventId: 1 }, { unique: true });
