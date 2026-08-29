import assert from "node:assert/strict";
import test from "node:test";
import { buildCustomerDigests, type OrderUpdate } from "../src/order_digest.ts";

test("keeps the latest state per order and groups customer updates", () => {
  const updates: OrderUpdate[] = [
    {
      orderId: "ord-42",
      customerEmail: "maker@example.com",
      checkoutTotal: 48,
      currency: "usd",
      fulfillment: "pending",
      receiptSent: false,
      updatedAt: "2026-08-17T08:00:00.000Z"
    },
    {
      orderId: "ord-42",
      customerEmail: "maker@example.com",
      checkoutTotal: 48,
      currency: "usd",
      fulfillment: "shipped",
      receiptSent: true,
      updatedAt: "2026-08-18T08:00:00.000Z"
    }
  ];

  assert.deepEqual(buildCustomerDigests(updates), [
    {
      customerEmail: "maker@example.com",
      subject: "Your weekly order update (1)",
      lines: ["ord-42: shipped; receipt sent; 48.00 USD"]
    }
  ]);
});
