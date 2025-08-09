# Replay Guide (order-service)

This document explains how to replay previously stored events from MongoDB back to RabbitMQ using the order-service replay script.

Purpose:
- Recover from consumer outages by re-emitting missed events
- Rebuild downstream read models
- Troubleshoot by re-sending specific events

Caveats:
- Consumers must be idempotent. Replayed events may cause side effects again if handlers are not idempotent.
- Ordering is best-effort; see the Ordering section in README. Do not assume strict global order across retries/DLQ.

## Where events are stored
- MongoDB database: orders
- Collection: events
- Unique index on events.eventId ensures idempotent inserts

Note: Other services also maintain their own events collections, but this replay script reads from the order-service DB (orders) only.

## Script location and runtime
- File: order-service/src/scripts/replay.ts
- NPM script: npm run replay
- Runtime: ts-node (dev dependency)

Because Docker images are optimized to run the compiled app, run the replay script on your host (not inside the container), pointing to the same RabbitMQ and MongoDB.

## Requirements
- Node.js 18+
- From repository root, install dependencies for order-service:
```
cd order-service
npm ci
```

## Configuration (env)
The script uses order-service configuration keys:
- RABBITMQ_URL (e.g., amqp://admin:admin123@localhost:5672)
- MONGO_URL (e.g., mongodb://localhost:27017/orders)
- SERVICE_NAME (optional; defaults to order-service)

Example for Docker Compose environment on localhost:
```
export RABBITMQ_URL=amqp://admin:admin123@localhost:5672
export MONGO_URL=mongodb://localhost:27017/orders
```

## Usage
```
npm run replay -- [--type=<eventType>] [--orderId=<id>] [--from=<ISO>] [--to=<ISO>] [--help]
```

Filters:
- --type: exact event type (e.g., orders.created, orders.cancelled, inventory.reserve.approved)
- --orderId: matches payload.orderId
- --from: occurredAt >= ISO timestamp (e.g., 2025-08-01T00:00:00Z)
- --to: occurredAt <= ISO timestamp

Examples:
```
# Replay all orders.created for a specific orderId
npm run replay -- --type=orders.created --orderId=ord_12ab34cd

# Replay everything in the time range (all types)
npm run replay -- --from=2025-08-01T00:00:00Z --to=2025-08-09T23:59:59Z

# Replay inventory approvals (if present in order-service events store)
npm run replay -- --type=inventory.reserve.approved
```

## Behavior
- The script connects to MongoDB and queries the events collection using your filters.
- Sorting: { occurredAt: 1, eventId: 1 } (ascending ordering by timestamp, then by eventId)
- For each event, it derives the exchange and routing key by type+version:
  - orders.created → orders / orders.created.v1
  - orders.cancelled → orders / orders.cancelled.v1
  - inventory.reserve.requested → inventory / inventory.reserve.requested.v1
  - inventory.reserve.approved → inventory / inventory.reserve.approved.v1
  - inventory.reserve.rejected → inventory / inventory.reserve.rejected.v1
  - notification.sent → notifications / notification.sent.v1
- Headers set on publish:
  - x-replay: true
  - x-correlation-id: copied from event.correlationId
  - x-group-id: payload.orderId (if present)
- Unknown event types are skipped with a warning.

## Verifying replay
- Use RabbitMQ Management UI (http://localhost:15672) to watch queue message rates.
- Or poll a queue via helper script:
```
# Example: poll notification.sent.q (acknowledges messages)
./scripts/mq-publish.sh poll notification.sent.q 5
```
- Check service logs to confirm consumers are handling replayed events.

## Safety considerations
- Replay only the necessary subset using filters. Do not replay the entire history into production without a clear plan.
- If consumers append events as part of their handling, duplicates are still possible (at-least-once delivery); design handlers to be idempotent.
- Prefer dry-run validations in staging when possible. (The script does not include a dry-run mode.)

## Troubleshooting
- No messages seen: verify RABBITMQ_URL, queue bindings (rabbitmq/definitions.json), and that consumers are running.
- Mongo connection errors: confirm MONGO_URL, and that Docker Compose mongodb service is healthy.
- Ordering concerns: see README Ordering section; consider filtering by orderId and serializing replays per aggregate if strict ordering is required.
