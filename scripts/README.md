# scripts/README — mq-publish.sh Kullanım Kılavuzu

Bu klasörde RabbitMQ Management HTTP API üzerinden mesaj yayınlama ve kuyruklardan mesaj çekme (poll) işlemleri için bir yardımcı script bulunur.

- Script: scripts/mq-publish.sh
- Gereksinimler: curl (zorunlu), jq (opsiyonel; çıktıyı güzelleştirmek için)
- Kullanım amacı: Sistem çalışırken (docker compose) tanımlı exchanges/queues üzerine örnek event’leri gönderme veya kuyruktan mesaj çekerek akışı gözlemleme.


## Önkoşullar
- Docker Compose ile sistemin çalışıyor olması (RabbitMQ + servisler):
  - docker compose up -d --build
- RabbitMQ Management API erişimi açık olmalı (varsayılan):
  - UI: http://localhost:15672
  - Giriş: admin / admin123


## Ortam Değişkenleri
Aşağıdaki değişkenlerle Management API hedefini özelleştirebilirsiniz. Belirtmezseniz varsayılanlar kullanılır.
- RABBIT_HOST (default: localhost)
- RABBIT_PORT (default: 15672)
- RABBIT_USER (default: admin)
- RABBIT_PASS (default: admin123)
- RABBIT_VHOST (default: /)

Örnek:
- env RABBIT_HOST=localhost RABBIT_PORT=15672 ./scripts/mq-publish.sh --help


## Genel Kullanım
```
./scripts/mq-publish.sh <komut> [opsiyonlar]
```

Desteklenen komutlar:
- orders.created → orders exchange’e orders.created.v1 yayınlar
  - Argümanlar: --orderId <id> --customerId <id> --qty <n> --unitPrice <n> [--correlationId <id>]
- orders.cancelled → orders exchange’e orders.cancelled.v1 yayınlar
  - Argümanlar: <ORDER_ID> [<CORRELATION_ID>]
- inventory.approved → inventory exchange’e inventory.reserve.approved.v1 yayınlar
  - Argümanlar: <ORDER_ID> <RESERVATION_ID> [<CORRELATION_ID>]
- inventory.rejected → inventory exchange’e inventory.reserve.rejected.v1 yayınlar
  - Argümanlar: <ORDER_ID> [<REASON>] [<CORRELATION_ID>]
- retry.orders.created → orders.retry exchange’e orders.created.v1 yayınlar (TTL sonrası ana kuyruğa DLX ile geri döner)
  - Argümanlar: <ORDER_ID> <CUSTOMER_ID> <QTY> <UNIT_PRICE> [<CORRELATION_ID>]
- retry.inventory.approved → inventory.retry exchange’e inventory.reserve.approved.v1 yayınlar
  - Argümanlar: <ORDER_ID> <RESERVATION_ID> [<CORRELATION_ID>]
- dlq <QUEUE_NAME> → amq.default üzerinden doğrudan belirtilen DLQ kuyruğuna publish eder (ör: order.created.q.dlq)
- poll <QUEUE_NAME> [COUNT] → Belirtilen kuyruğu HTTP API ile poll eder (ack ile mesajları tüketir). Varsayılan COUNT=5.
- --help | -h | help → Yardım çıktısı

Notlar:
- Script, gönderdiği event’ler için örnek/zarf (envelope) alanlarını kendisi üretir (eventId, occurredAt, correlationId vb.).
- Management API publish çağrıları exchange + routing_key + payload (string) alır; script JSON payload’ı uygun formata dönüştürür.


## Hızlı Örnekler
- orders.created yayınla:
```
./scripts/mq-publish.sh orders.created \
  --orderId ord_001 --customerId cust_1 --qty 2 --unitPrice 100
```

- retry exchange üzerinden yayınla (TTL sonra ana exchange’e döner):
```
./scripts/mq-publish.sh retry.orders.created ord_002 cust_1 2 100
```

- inventory.reserve.approved manuel üret:
```
./scripts/mq-publish.sh inventory.approved ord_001 res_777
```

- DLQ’ya doğrudan publish (senaryo incelemek için):
```
./scripts/mq-publish.sh dlq order.created.q.dlq
```

- Bir kuyruğu poll et (5 mesaj):
```
./scripts/mq-publish.sh poll order.created.q 5
```

- Yardım:
```
./scripts/mq-publish.sh --help
```


## Beklenen Bağlantılar ve Kuyruk İsimleri
- Exchanges (topic): orders, orders.retry, inventory, inventory.retry, notifications
- Örnek kuyruklar: order.created.q, orders.cancelled.q, inventory.reserve.approved.q, inventory.reserve.rejected.q, …
- Retry/DLQ kuyrukları: <queue>.retry ve <queue>.dlq
- Tam liste: rabbitmq/definitions.json


## Çıktılar
- publish çağrısı, RabbitMQ Management API’den dönen JSON cevabı yazdırır (jq varsa pretty-print edilir).
- poll komutu, dönen mesaj listesi JSON’unu yazdırır (ack_requeue_false ile mesajlar kuyruktan çıkarılır).


## Sorun Giderme
- 401/403: Kullanıcı adı/şifre veya vhost yanlış (RABBIT_* env’lerini kontrol edin).
- 404 exchange/queue bulunamadı: docker compose henüz hazır değil ya da definitions.json yüklenmedi (biraz bekleyin veya RabbitMQ UI’den doğrulayın).
- Bağlantı hatası: RABBIT_HOST/RABBIT_PORT doğru mu? Docker network ve port yönlendirmelerini kontrol edin.
- JSON hatası: Argümanlarda boşluk/kaçış karakterleri varsa tırnaklamayı kontrol edin.


## Platform Notları
- Linux/macOS üzerinde doğrudan çalışır.
- Windows için Git Bash veya WSL kullanmanız önerilir.
