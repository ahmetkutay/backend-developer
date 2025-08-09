#!/usr/bin/env bash
set -euo pipefail

# RabbitMQ Management HTTP API publisher/poller helper
# Requirements: curl, jq (optional for pretty output)
# Defaults can be overridden by environment variables:
#   RABBIT_HOST (default: localhost)
#   RABBIT_PORT (default: 15672)
#   RABBIT_USER (default: admin)
#   RABBIT_PASS (default: admin123)
#   RABBIT_VHOST (default: /)
#
# Examples:
#   ./scripts/mq-publish.sh orders.created --orderId ord_001 --customerId cust_1 --qty 2 --unitPrice 100
#   ./scripts/mq-publish.sh retry.orders.created --orderId ord_001
#   ./scripts/mq-publish.sh inventory.approved ord_001 res_777
#   ./scripts/mq-publish.sh dlq order.created.q.dlq
#   ./scripts/mq-publish.sh poll order.created.q 5

RABBIT_HOST="${RABBIT_HOST:-localhost}"
RABBIT_PORT="${RABBIT_PORT:-15672}"
RABBIT_USER="${RABBIT_USER:-admin}"
RABBIT_PASS="${RABBIT_PASS:-admin123}"
RABBIT_VHOST="${RABBIT_VHOST:-/}"

usage() {
  cat <<'EOF'
Kullanım:
  mq-publish.sh <komut> [opsiyonlar]

Komutlar:
  orders.created           → orders exchange'e orders.created.v1 yayınla
  orders.cancelled         → orders exchange'e orders.cancelled.v1 yayınla
  inventory.approved       → inventory exchange'e inventory.reserve.approved.v1 yayınla
  inventory.rejected       → inventory exchange'e inventory.reserve.rejected.v1 yayınla
  retry.orders.created     → orders.retry exchange'e orders.created.v1 yayınla (TTL sonrası ana kuyruğa döner)
  retry.inventory.approved → inventory.retry exchange'e inventory.reserve.approved.v1 yayınla
  dlq <queue>              → amq.default üzerinden doğrudan belirtilen DLQ kuyruğuna publish (örn: order.created.q.dlq)
  poll <queue> [count]     → Bir kuyruğu HTTP API ile poll et (default 5, ack eder ve mesajı kuyruktan çıkarır)

Ortak Seçenekler (env):
  RABBIT_HOST (default: localhost)
  RABBIT_PORT (default: 15672)
  RABBIT_USER (default: admin)
  RABBIT_PASS (default: admin123)
  RABBIT_VHOST (default: /)

Örnekler:
  ./scripts/mq-publish.sh orders.created --orderId ord_001 --customerId cust_1 --qty 2 --unitPrice 100
  ./scripts/mq-publish.sh retry.orders.created --orderId ord_001
  ./scripts/mq-publish.sh dlq order.created.q.dlq
  ./scripts/mq-publish.sh inventory.approved ord_001 res_123
  ./scripts/mq-publish.sh poll order.created.q 5
EOF
}

uuid() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import uuid; print(uuid.uuid4())'
  elif command -v uuidgen >/dev/null 2>&1; then
    uuidgen
  else
    cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "rnd-$(date +%s%N)"
  fi
}

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Build base API URL (no credentials embedded; we pass via -u)
api_base() {
  echo "http://${RABBIT_HOST}:${RABBIT_PORT}/api"
}

# URL-encode vhost segment for API path
vhost_path_enc() {
  if [ "$RABBIT_VHOST" = "/" ]; then
    echo "%2F"
  else
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=''))" "$RABBIT_VHOST"
    else
      # Fallback (not fully generic): replace '/' with '%2F'
      printf '%s' "$RABBIT_VHOST" | sed 's/\//%2F/g'
    fi
  fi
}

publish_exchange() {
  local exchange="$1" routing_key="$2" payload_json="$3"
  local base; base=$(api_base)
  local vhost_path; vhost_path=$(vhost_path_enc)

  # RabbitMQ publish body expects payload as string
  local body
  if command -v jq >/dev/null 2>&1; then
    body=$(jq -n --arg rk "$routing_key" --arg payload "$payload_json" \
      '{properties:{content_type:"application/json"}, routing_key:$rk, payload:$payload, payload_encoding:"string", mandatory:false}')
  else
    # crude fallback: ensure payload is a single line
    local sanitized
    sanitized=$(printf '%s' "$payload_json" | tr -d '\n')
    body="{\"properties\":{\"content_type\":\"application/json\"},\"routing_key\":\"$routing_key\",\"payload\":\"$sanitized\",\"payload_encoding\":\"string\",\"mandatory\":false}"
  fi

  curl -sS -u "${RABBIT_USER}:${RABBIT_PASS}" \
    -H "content-type: application/json" \
    -X POST "${base}/exchanges/${vhost_path}/${exchange}/publish" \
    -d "$body" | (command -v jq >/dev/null 2>&1 && jq . || cat)
}

publish_to_queue_via_default_exchange() {
  local queue_name="$1" payload_json="$2"
  publish_exchange "amq.default" "$queue_name" "$payload_json"
}

poll_queue() {
  local queue="$1" count="${2:-5}"
  local base; base=$(api_base)
  local vhost_path; vhost_path=$(vhost_path_enc)

  curl -sS -u "${RABBIT_USER}:${RABBIT_PASS}" \
    -H "content-type: application/json" \
    -X POST "${base}/queues/${vhost_path}/${queue}/get" \
    -d "{\"count\": ${count}, \"ackmode\":\"ack_requeue_false\", \"encoding\":\"auto\", \"truncate\":50000}" \
    | (command -v jq >/dev/null 2>&1 && jq . || cat)
}

# Event payload builders
evt_orders_created() {
  local orderId="$1" customerId="$2" qty="$3" unitPrice="$4"
  local eid; eid=$(uuid)
  local corr="${5:-corr-$(uuid)}"
  local total; total=$(awk "BEGIN {printf \"%.2f\", $qty*$unitPrice}")
  cat <<EOF
{
  "eventId": "$eid",
  "type": "orders.created",
  "version": 1,
  "occurredAt": "$(iso_now)",
  "producer": "order-service",
  "correlationId": "$corr",
  "payload": {
    "orderId": "$orderId",
    "customerId": "$customerId",
    "items": [
      { "productId": "p1", "quantity": $qty, "unitPrice": $unitPrice }
    ],
    "total": $total
  }
}
EOF
}

evt_orders_cancelled() {
  local orderId="$1"
  local eid; eid=$(uuid)
  local corr="${2:-corr-$(uuid)}"
  cat <<EOF
{
  "eventId": "$eid",
  "type": "orders.cancelled",
  "version": 1,
  "occurredAt": "$(iso_now)",
  "producer": "order-service",
  "correlationId": "$corr",
  "payload": { "orderId": "$orderId", "reason": "user_request" }
}
EOF
}

evt_inventory_approved() {
  local orderId="$1" reservationId="$2"
  local eid; eid=$(uuid)
  local corr="${3:-corr-$(uuid)}"
  cat <<EOF
{
  "eventId": "$eid",
  "type": "inventory.reserve.approved",
  "version": 1,
  "occurredAt": "$(iso_now)",
  "producer": "inventory-service",
  "correlationId": "$corr",
  "payload": { "orderId": "$orderId", "reservationId": "$reservationId" }
}
EOF
}

evt_inventory_rejected() {
  local orderId="$1" reason="$2"
  local eid; eid=$(uuid)
  local corr="${3:-corr-$(uuid)}"
  cat <<EOF
{
  "eventId": "$eid",
  "type": "inventory.reserve.rejected",
  "version": 1,
  "occurredAt": "$(iso_now)",
  "producer": "inventory-service",
  "correlationId": "$corr",
  "payload": { "orderId": "$orderId", "reason": "$reason" }
}
EOF
}

cmd="${1:-}"
shift || true

case "$cmd" in
  orders.created)
    ORDER_ID="ord_${RANDOM}"
    CUSTOMER_ID="cust_${RANDOM}"
    QTY=1
    PRICE=100
    CORR="corr-$(uuid)"
    while [ $# -gt 0 ]; do
      case "$1" in
        --orderId) ORDER_ID="$2"; shift 2 ;;
        --customerId) CUSTOMER_ID="$2"; shift 2 ;;
        --qty) QTY="$2"; shift 2 ;;
        --unitPrice) PRICE="$2"; shift 2 ;;
        --correlationId) CORR="$2"; shift 2 ;;
        *) echo "Bilinmeyen arg: $1"; usage; exit 1 ;;
      esac
    done
    PAYLOAD=$(evt_orders_created "$ORDER_ID" "$CUSTOMER_ID" "$QTY" "$PRICE" "$CORR")
    publish_exchange "orders" "orders.created.v1" "$PAYLOAD"
    ;;

  orders.cancelled)
    ORDER_ID="${1:-ord_cancel_${RANDOM}}"
    CORR="${2:-corr-$(uuid)}"
    PAYLOAD=$(evt_orders_cancelled "$ORDER_ID" "$CORR")
    publish_exchange "orders" "orders.cancelled.v1" "$PAYLOAD"
    ;;

  inventory.approved)
    ORDER_ID="${1:-ord_${RANDOM}}"
    RES_ID="${2:-res_${RANDOM}}"
    CORR="${3:-corr-$(uuid)}"
    PAYLOAD=$(evt_inventory_approved "$ORDER_ID" "$RES_ID" "$CORR")
    publish_exchange "inventory" "inventory.reserve.approved.v1" "$PAYLOAD"
    ;;

  inventory.rejected)
    ORDER_ID="${1:-ord_${RANDOM}}"
    REASON="${2:-out_of_stock}"
    CORR="${3:-corr-$(uuid)}"
    PAYLOAD=$(evt_inventory_rejected "$ORDER_ID" "$REASON" "$CORR")
    publish_exchange "inventory" "inventory.reserve.rejected.v1" "$PAYLOAD"
    ;;

  retry.orders.created)
    ORDER_ID="${1:-ord_${RANDOM}}"
    CUSTOMER_ID="${2:-cust_${RANDOM}}"
    QTY="${3:-1}"
    PRICE="${4:-100}"
    CORR="${5:-corr-$(uuid)}"
    PAYLOAD=$(evt_orders_created "$ORDER_ID" "$CUSTOMER_ID" "$QTY" "$PRICE" "$CORR")
    publish_exchange "orders.retry" "orders.created.v1" "$PAYLOAD"
    ;;

  retry.inventory.approved)
    ORDER_ID="${1:-ord_${RANDOM}}"
    RES_ID="${2:-res_${RANDOM}}"
    CORR="${3:-corr-$(uuid)}"
    PAYLOAD=$(evt_inventory_approved "$ORDER_ID" "$RES_ID" "$CORR")
    publish_exchange "inventory.retry" "inventory.reserve.approved.v1" "$PAYLOAD"
    ;;

  dlq)
    QUEUE="${1:-}"
    if [ -z "$QUEUE" ]; then echo "Kullanım: dlq <queueName>"; exit 1; fi
    PAYLOAD="{\"note\":\"manual dlq publish\",\"at\":\"$(iso_now)\"}"
    publish_to_queue_via_default_exchange "$QUEUE" "$PAYLOAD"
    ;;

  poll)
    QUEUE="${1:-}"
    COUNT="${2:-5}"
    if [ -z "$QUEUE" ]; then echo "Kullanım: poll <queueName> [count]"; exit 1; fi
    poll_queue "$QUEUE" "$COUNT"
    ;;

  ""|-h|--help|help)
    usage
    ;;

  *)
    echo "Bilinmeyen komut: $cmd"
    usage
    exit 1
    ;;
 esac
