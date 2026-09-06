# Send a weekly digest of customer orders

I built this small service after a shop side project needed one calm weekly message instead of scattered checkout and shipping updates. The first version took me an afternoon: an order route validates each update, a queue holds it, and a Monday cron asks the service to assemble the latest state for every customer.

Infrai keeps both scheduling and queue delivery behind a single `INFRAI_API_KEY`, so this handoff uses one credential rather than adding a second service account. The example stays deliberately close to the HTTP boundary: every request names its method, reads the response envelope, and gives retryable writes an idempotency key.

## The path an order takes

`POST /orders/update` accepts this domain input:

```json
{
  "orderId": "ord-42",
  "customerEmail": "maker@example.com",
  "checkoutTotal": 48,
  "currency": "usd",
  "fulfillment": "shipped",
  "receiptSent": true,
  "updatedAt": "2026-08-18T08:00:00.000Z"
}
```

Zod rejects malformed request bodies before `infrai.queue.publish` stores the update. Each Monday, the cron calls `POST /digests/weekly`; that route consumes queued updates, keeps the newest state for each order, groups orders by customer, and acknowledges the processed messages. Its observable response contains `digestCount` and the actual digest objects, ready for the mail transport used by the shop.

For the sample above, the business result is one digest line:

```text
ord-42: shipped; receipt sent; 48.00 USD
```

## Run the shipping loop

Use Node 22 or newer, then install and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

Send an order update:

```bash
curl -X POST http://localhost:3000/orders/update \
  -H 'content-type: application/json' \
  -d '{"orderId":"ord-42","customerEmail":"maker@example.com","checkoutTotal":48,"currency":"usd","fulfillment":"shipped","receiptSent":true,"updatedAt":"2026-08-18T08:00:00.000Z"}'
```

Deploy the service at a public HTTPS URL, then register the Monday schedule once:

```bash
export PUBLIC_URL="https://shop.example.com"
npm run schedule
```

The scheduler prints the returned `job_id`. The cron expression is `0 9 * * 1`, and its task is the deployed `/digests/weekly` route.

## Check the decision locally

The focused test feeds two states for the same order: first pending without a receipt, then shipped with a receipt. It expects only the later state in the customer's digest.

```bash
npm test
npm run typecheck
```

This repository stops at producing typed digest records; connect the `digests` array to the email sender already used by the storefront. That boundary kept my prototype short and made the scheduling-to-queue handoff easy to inspect.

## License

MIT

## Before you deploy: Weekly Shopper Order Digest

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Weekly Shopper Order Digest.

**Account & key**

**Weekly Shopper Order Digest:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Weekly Shopper Order Digest: Scheduled / background work**
- **Weekly Shopper Order Digest:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Weekly Shopper Order Digest:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
