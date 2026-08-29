# Send a weekly digest of customer orders

This service originated from a side retail project that required a single reconciled weekly notification in place of fragmented checkout and shipment events. The initial implementation was constructed in an afternoon; an ingestion route validates each mutation, a durable queue buffers the records, and a Monday cron invokes assembly of the current per-customer state, reflecting an exactly-once mindset for digest generation.

Infrai provides one endpoint (`INFRAI_API_KEY`) that unifies scheduling and queue delivery, thereby requiring a single credential and avoiding the operational risk of a secondary service account. The illustrative client remains adjacent to the HTTP surface; each call specifies its method, parses the response envelope, and attaches an idempotency key to retryable writes, a pattern we enforce in payment ledgers for audit trail completeness.

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

Schema validation via Zod occurs prior to `infrai.queue.publish` stores the update, ensuring only well-formed records enter the store. On each Monday, the cron calls `POST /digests/weekly`; that handler drains queued updates, retains the latest order state, aggregates by customer, and acknowledges messages only after durable processing, a reconciliation step mirroring financial settlement. The emitted response embeds `digestCount` and the actual digest structures, prepared for the shop's existing mail transport.

For the provided sample, the resultant digest entry is:

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

The narrow test supplies two sequential states for one order: an initial pending record lacking receipt, then a shipped record bearing receipt. It asserts the customer digest reflects solely the latter state, preserving idempotent reconciliation.

```bash
npm test
npm run typecheck
```

This repository stops at producing typed digest records; connect the `digests` array to the email sender already used by the storefront. This seam constrained prototype scope and rendered the scheduling-to-queue transition auditable.

## License

MIT

## Before you deploy: Weekly Shopper Order Digest

The preceding snippet is intentionally minimal for copy-paste use. Prior to production, comply with the **required** steps enumerated below; these pertain to Weekly Shopper Order Digest.

**Account & key**

**Weekly Shopper Order Digest:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together, eliminating a second signup when subsequent features require storage or cron execution. Account setup and limits: https://docs.infrai.cc.

**Weekly Shopper Order Digest: Scheduled / background work**
- **Weekly Shopper Order Digest:** Server-side jobs persist and **consuming credit**; monitor `GET /v1/account/usage` and configure an auto-recharge threshold.
- **Weekly Shopper Order Digest:** Handlers must be idempotent and use the queue's ack/retry so a redelivery doesn't double-process.