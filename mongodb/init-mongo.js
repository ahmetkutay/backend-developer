// MongoDB initialization script: create DBs, collections, and indexes

// Orders DB: event store and read model
var dbOrders = db.getSiblingDB('orders');

dbOrders.createCollection('events');
dbOrders.events.createIndex({ eventId: 1 }, { unique: true });
dbOrders.events.createIndex({ 'payload.orderId': 1 }, { background: true });

dbOrders.createCollection('orders');
dbOrders.orders.createIndex({ orderId: 1 }, { unique: true });
dbOrders.orders.createIndex({ status: 1 }, { background: true });

// Inventory DB: reservations + event store
var dbInventory = db.getSiblingDB('inventory');

dbInventory.createCollection('reservations');
dbInventory.reservations.createIndex({ reservationId: 1 }, { unique: true });
dbInventory.reservations.createIndex({ orderId: 1 }, { background: true });

// Add event store for inventory
try { dbInventory.createCollection('events'); } catch (e) {}
try { dbInventory.events.createIndex({ eventId: 1 }, { unique: true }); } catch (e) {}
try { dbInventory.events.createIndex({ 'payload.orderId': 1 }, { background: true }); } catch (e) {}

// Notifications DB: event store (optional)
var dbNotifications = db.getSiblingDB('notifications');

try { dbNotifications.createCollection('events'); } catch (e) {}
try { dbNotifications.events.createIndex({ eventId: 1 }, { unique: true }); } catch (e) {}
