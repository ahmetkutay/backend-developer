# Event Schemas (v1)

This document describes the canonical event envelopes and payloads produced/consumed by the services in this repository. All events use a common envelope and are published to RabbitMQ topic exchanges with versioned routing keys.

Common envelope fields:
- eventId: UUID string
- type: event type (e.g., "orders.created")
- version: 1 (literal)
- occurredAt: ISO-8601 timestamp string
- producer: service name (e.g., order-service)
- correlationId: correlation identifier string

Common headers:
- x-correlation-id: mirrors envelope.correlationId for message tracing
- x-group-id: best-effort grouping key for ordering/correlation (we use orderId)
- x-attempt: internal retry counter added by consumers (see retry/DLQ)
- x-replay: true when published by the replay script

Exchanges (topic): orders, orders.retry, inventory, inventory.retry, notifications, notifications.retry. Bindings/queues are defined in rabbitmq/definitions.json.

Notes on versioning:
- Routing keys are versioned (e.g., orders.created.v1) and must match envelope.version.
- Event schema evolution should bump version and add new routing key suffix (e.g., .v2) while keeping previous bindings for consumers that still expect v1.

## orders.created v1
- Exchange: orders
- Routing key: orders.created.v1
- Bound queues: order.created.q, orders.created.notification.q
- Produced by: order-service
- Consumed by: inventory-service (order.created.q), notification-service (orders.created.notification.q)

Envelope + payload:
```
{
  "eventId": "2c9df8a8-7a7a-4c75-b56f-7a6fe4d05f77",
  "type": "orders.created",
  "version": 1,
  "occurredAt": "2025-08-09T20:41:00Z",
  "producer": "order-service",
  "correlationId": "corr-abc123",
  "payload": {
    "orderId": "ord_12ab34cd",
    "customerId": "cust_1",
    "items": [
      { "productId": "p1", "quantity": 2, "unitPrice": 100 }
    ],
    "total": 200
  }
}
```
Headers (example): { "x-group-id": "ord_12ab34cd", "x-correlation-id": "corr-abc123" }

## orders.cancelled v1
- Exchange: orders
- Routing key: orders.cancelled.v1
- Bound queues: orders.cancelled.q, orders.cancelled.notification.q
- Produced by: order-service
- Consumed by: inventory-service (orders.cancelled.q), notification-service (orders.cancelled.notification.q)

Envelope + payload:
```
{
  "eventId": "f8b5b1a6-1b2c-41fd-8b80-043b0b3d5a7c",
  "type": "orders.cancelled",
  "version": 1,
  "occurredAt": "2025-08-09T20:42:00Z",
  "producer": "order-service",
  "correlationId": "corr-xyz789",
  "payload": {
    "orderId": "ord_12ab34cd",
    "reason": "user_request"
  }
}
```
Headers (example): { "x-group-id": "ord_12ab34cd", "x-correlation-id": "corr-xyz789" }

## inventory.reserve.approved v1
- Exchange: inventory
- Routing key: inventory.reserve.approved.v1
- Bound queues: inventory.reserve.approved.q, inventory.reserve.approved.notification.q
- Produced by: inventory-service
- Consumed by: order-service (inventory.reserve.approved.q), notification-service (inventory.reserve.approved.notification.q)

Envelope + payload:
```
{
  "eventId": "3a4d5e6f-7081-42d0-9c6a-11b2c3d4e5f6",
  "type": "inventory.reserve.approved",
  "version": 1,
  "occurredAt": "2025-08-09T20:43:00Z",
  "producer": "inventory-service",
  "correlationId": "corr-abc123",
  "payload": {
    "orderId": "ord_12ab34cd",
    "reservationId": "res_7f3a1bcd"
  }
}
```
Headers (example): { "x-group-id": "ord_12ab34cd", "x-correlation-id": "corr-abc123" }

## inventory.reserve.rejected v1
- Exchange: inventory
- Routing key: inventory.reserve.rejected.v1
- Bound queues: inventory.reserve.rejected.q, inventory.reserve.rejected.notification.q
- Produced by: inventory-service
- Consumed by: order-service (inventory.reserve.rejected.q), notification-service (inventory.reserve.rejected.notification.q)

Envelope + payload:
```
{
  "eventId": "aa06d7d8-0d67-4f3c-ae37-97e5ae0c27c5",
  "type": "inventory.reserve.rejected",
  "version": 1,
  "occurredAt": "2025-08-09T20:44:00Z",
  "producer": "inventory-service",
  "correlationId": "corr-abc123",
  "payload": {
    "orderId": "ord_12ab34cd",
    "reason": "insufficient_stock"
  }
}
```
Headers (example): { "x-group-id": "ord_12ab34cd", "x-correlation-id": "corr-abc123" }

## notification.sent v1
- Exchange: notifications
- Routing key: notification.sent.v1
- Bound queues: notification.sent.q
- Produced by: notification-service
- Consumed by: (example queue only in this repo; no consumer service here)

Envelope + payload:
```
{
  "eventId": "0c95b9a8-7f6e-4f13-a4a7-5b0a12b34c5d",
  "type": "notification.sent",
  "version": 1,
  "occurredAt": "2025-08-09T20:45:00Z",
  "producer": "notification-service",
  "correlationId": "corr-notif-123",
  "payload": {
    "orderId": "ord_12ab34cd",
    "kind": "order_confirmed", // one of: order_created | order_confirmed | order_rejected | order_cancelled
    "channel": "log"
  }
}
```
Headers (example): { "x-group-id": "ord_12ab34cd", "x-correlation-id": "corr-notif-123" }

## Additional notes
- There is a reserved inventory.reserve.requested.v1 routing key and queue in definitions.json for future use; it is not produced by the current code.
- All services persist incoming/outgoing events to their MongoDB "events" collections with a unique index on eventId for idempotency.
- Consumers should treat event handling as idempotent where possible. Replayed or retried events may be delivered more than once.


## Runtime validation (Zod)
- All consumers validate incoming events at runtime using Zod.safeParse against the service-local schemas. Invalid messages are not retried infinitely; handlers log the reason and route them to DLQ via the consumer's dlq helper (ack + publish to <queue>.dlq per MessageBus logic).
- All producers validate outgoing event envelopes before persisting to the event store and before publishing:
  - order-service: validates orders.created.v1 and orders.cancelled.v1.
  - inventory-service: validates inventory.reserve.approved.v1 and inventory.reserve.rejected.v1.
  - notification-service: validates notification.sent.v1.
- If an outgoing event fails validation, the service logs the error and skips publishing (order-service returns HTTP 500 with error "invalid_event_envelope" for create/cancel endpoints). This prevents malformed events from entering the system.
- Schemas live under each service at src/events/schemas and are versioned (v1). When evolving schemas, add new versions (e.g., *.v2) and keep backward compatibility for existing consumers.
