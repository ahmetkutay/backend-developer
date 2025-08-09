# Backend-Developer — Olay Tabanlı Mikroservisler

Bu repo; Order, Inventory ve Notification servislerinden oluşan, RabbitMQ ve MongoDB kullanan olay tabanlı (event-driven) bir örnek sistemi içerir. Servisler; sağlık (liveness), hazırlık (readiness), retry/DLQ, idempotency ve (best‑effort) ordering gibi üretim pratikleri ile donatılmıştır. Kurulum ve test için Docker Compose ve yardımcı bir yayınlama scripti (scripts/mq-publish.sh) bulunur.

- Dil/Runtime: Node.js + TypeScript
- Mesajlaşma: RabbitMQ (exchanges/queues bindings tanımları rabbitmq/definitions.json)
- Depolama: MongoDB (event store + read-model)
- Gözlemlenebilirlik: Pino log
- Sağlık uçları: /health (liveness), /ready (readiness)

## Mimari
```
[ Client ] --HTTP--> [ Order Service ] --orders.created--> [ RabbitMQ ] --> [ Inventory Service ]
                                               |                                      |
                                               |                                      +--> (approved/rejected) --> [ RabbitMQ ] --> [ Order Service ]
                                               |                                                                              \--> [ Notification Service ]
                                               +--orders.cancelled-------------------------------------------------------------> [ RabbitMQ ] --> [ Inventory Service, Notification Service ]

[ Notification Service ] --notification.sent--> [ RabbitMQ ] (tüketici örnek amaçlı hazır; serviste tüketen yok)
```

- order-service (3001):
  - Üretir: orders.created.v1, orders.cancelled.v1
  - Tüketir: inventory.reserve.approved.q, inventory.reserve.rejected.q
  - HTTP: POST /orders, POST /orders/:id/cancel
- inventory-service (3002):
  - Tüketir: order.created.q, orders.cancelled.q
  - Üretir: inventory.reserve.approved.v1, inventory.reserve.rejected.v1
- notification-service (3003):
  - Tüketir: orders.created.notification.q, inventory.reserve.approved.notification.q, inventory.reserve.rejected.notification.q, orders.cancelled.notification.q
  - Üretir: notification.sent.v1 (örnek amaçlı; tüketeni bu repoda yok)

Exchanges (topic): orders, orders.retry, inventory, inventory.retry, notifications, notifications.retry.
Queues ve bindings: rabbitmq/definitions.json içinde detaylıdır (retry/dlq kuyrukları dahil).

## Mesaj Akışları
1) Sipariş Oluşturma
- Client → POST /orders (order-service)
- order-service: events koleksiyonuna ekler (idempotent), orders.created.v1 yayınlar (x-group-id = orderId)
- inventory-service: order.created.q’dan tüketir, stok kurallarına göre approved/rejected üretir
- order-service: inventory.* kuyruklarından tüketir, sipariş durumunu CONFIRMED/REJECTED yapar
- notification-service: hem orders.created hem inventory.* olaylarını dinler, notification.sent.v1 üretir

2) Sipariş İptali
- Client → POST /orders/:id/cancel (order-service), events’e ekler, orders.cancelled.v1 yayınlar
- inventory-service: orders.cancelled.q’dan tüketir (örnek: restock simülasyonu)
- notification-service: orders.cancelled.notification.q’dan tüketip notification.sent.v1 yayınlar

## Retry / DLQ
- Tüketici hata aldığında MessageBus.retry() mesajı `${queue}.retry` kuyruğuna yayınlar.
- Retry kuyruklarında TTL (örn. 10sn) sonrası x-dead-letter-exchange ile ana exchange’e geri döner.
- Deneme sayısı (x-attempt header) CONSUMER_MAX_RETRIES limitini aşarsa mesaj `${queue}.dlq` kuyruğuna yönlendirilir.
- İlgili kuyruk/TTL/DLX konfigürasyonları: rabbitmq/definitions.json

## Idempotency
- Event Store (Mongo ‘events’ koleksiyonu): eventId eşsiz index → aynı eventId ikinci kez insert edilirse no-op.
- Order Read-Model (orders koleksiyonu): orderId eşsiz index → aynı order birden fazla kez oluşturma isteği gelirse mevcut döndürülür.
- HTTP İstek idempotency: POST /orders çağrısında Idempotency-Key header’ı desteklenir (in-memory 24h TTL; prod için Redis önerilir).

## Ordering (Sıralama)
- RabbitMQ tek kuyruk ve tek tüketici/kanal için FIFO sağlar; fakat retry/TTL/DLX ve çoklu tüketici (prefetch>1) durumlarında global sıralama garanti edilmez.
- `x-group-id` (orderId) header’ı korelasyon için kullanılır; sıralama garantisi vermez.
- Varsayılan PREFETCH=1 ile tüketiciler tek kanal/tek tüketici şeklinde çalışır ve pratikte sıra korunur, ancak kesin garanti olarak kabul etmeyin.

## Readiness / Liveness
- /health: süreç ayakta mı (liveness)
- /ready: Mongo `db.command({ ping: 1 })` ve RabbitMQ queue `checkQueue(<queue>)` ile readiness. Ortam değişkenleriyle timeout ve kontrol kuyruğu ayarlanabilir.

## Ortam Değişkenleri (ortak)
- SERVICE_NAME (örn: order-service)
- PORT (3001/3002/3003)
- RABBITMQ_URL (örn: amqp://admin:admin123@localhost:5672)
- MONGO_URL (örn: mongodb://localhost:27017/orders)
- READY_TIMEOUT_MS (default 1500)
- READY_RMQ_CHECK_QUEUE (servise göre varsayılan bir kontrol kuyruğu)
- PREFETCH (default 1)
- CONSUMER_MAX_RETRIES (default 3)
- MQ_BREAKER_ENABLED (default true)
- MQ_BREAKER_TIMEOUT_MS (default 2000)
- MQ_BREAKER_RESET_TIMEOUT_MS (default 3000)
- MQ_BREAKER_ERROR_THRESHOLD_PERCENT (default 50)
- MQ_BREAKER_VOLUME_THRESHOLD (default 5)
- DB_BREAKER_* (ileride DB işlemlerine sarmalama için rezerv)

Örnek .env (her servis klasörü için uyarlayın):
```
NODE_ENV=development
SERVICE_NAME=order-service
PORT=3001
RABBITMQ_URL=amqp://admin:admin123@localhost:5672
MONGO_URL=mongodb://localhost:27017/orders
PREFETCH=1
CONSUMER_MAX_RETRIES=3
READY_TIMEOUT_MS=1500
READY_RMQ_CHECK_QUEUE=inventory.reserve.approved.q
MQ_BREAKER_ENABLED=true
MQ_BREAKER_TIMEOUT_MS=2000
MQ_BREAKER_RESET_TIMEOUT_MS=3000
MQ_BREAKER_ERROR_THRESHOLD_PERCENT=50
MQ_BREAKER_VOLUME_THRESHOLD=5
```

## Kurulum (Docker Compose)
1. Gereksinimler: Docker, Docker Compose
2. Çalıştırın:
```
docker compose up -d --build
```
3. RabbitMQ UI: http://localhost:15672 (admin / admin123)
4. Servisler:
   - Order: http://localhost:3001
   - Inventory: http://localhost:3002
   - Notification: http://localhost:3003

Sağlık kontrolü:
```
curl -s localhost:3001/health; echo
curl -s localhost:3001/ready; echo
```

## Test Senaryoları
### 1) HTTP ile Sipariş Oluşturma
```
curl -X POST http://localhost:3001/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: idem-123' \
  -d '{
    "customerId": "cust_1",
    "items": [ {"productId":"p1","quantity":2,"unitPrice":100} ]
  }'
```
Beklenen: order-service PENDING oluşturur; inventory-service onaylar veya reddeder; order-service statüyü günceller; notification-service bildirim yayınlar.

### 2) İptal
```
curl -X POST http://localhost:3001/orders/<ORDER_ID>/cancel \
  -H 'Content-Type: application/json' \
  -d '{"reason":"user_request"}'
```

### 3) mq-publish.sh ile Manuel Yayınlama / Poll
Script kullanımı ve örnekler için: scripts/mq-publish.sh (aşağıya bakınız).

## scripts/mq-publish.sh
Yardımcı script RabbitMQ Management HTTP API üzerinden publish/poll yapar.
- Gereksinimler: curl, (opsiyonel) jq
- Varsayılanlar: RABBIT_HOST=localhost, RABBIT_PORT=15672, RABBIT_USER=admin, RABBIT_PASS=admin123, RABBIT_VHOST=/

Örnekler:
```
# orders.created yayınla
env RABBIT_HOST=localhost ./scripts/mq-publish.sh orders.created \
  --orderId ord_001 --customerId cust_1 --qty 2 --unitPrice 100

# retry exchange üzerinden yayınla (TTL sonrası ana kuyruğa döner)
./scripts/mq-publish.sh retry.orders.created --orderId ord_001

# DLQ’ya doğrudan publish
./scripts/mq-publish.sh dlq order.created.q.dlq

# Kuyruğu poll et (5 mesaj)
./scripts/mq-publish.sh poll order.created.q 5
```

Komut listesi ve detaylar için:
```
./scripts/mq-publish.sh --help
```

## Replay (Olayları Yeniden Yayınlama)
order-service altında bir replay script’i bulunur. Ayrıntılar: docs/replay.md

## Etkin Şema Dokümantasyonu
Tüm olay şemaları ve örnek payloadlar: docs/event-schemas.md

## Troubleshooting
- /ready 503 dönerse: RabbitMQ veya Mongo bağlantısı yok ya da hazır değil. RabbitMQ UI’de queue’lar oluşmuş mu? Mongo container sağlıklı mı?
- Mesajlar .retry kuyruğunda kalıyor: TTL süresini (definitions.json’daki x-message-ttl) bekleyin; sonra ana exchange’e DLX ile geri yönlenir.
- DLQ doluyor: Tüketici hata sayısı CONSUMER_MAX_RETRIES’ı aşıyor; tüketici loglarına bakın.
- Idempotency: Aynı Idempotency-Key ile tekrar POST /orders gönderirseniz mevcut orderId döner.
