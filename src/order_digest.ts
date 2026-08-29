import { z } from "zod";

export const orderUpdateSchema = z.object({
  orderId: z.string().min(1),
  customerEmail: z.string().email(),
  checkoutTotal: z.number().nonnegative(),
  currency: z.string().length(3),
  fulfillment: z.enum(["pending", "shipped", "delivered"]),
  receiptSent: z.boolean(),
  updatedAt: z.string().datetime()
});

export type OrderUpdate = z.infer<typeof orderUpdateSchema>;

export type CustomerDigest = {
  customerEmail: string;
  subject: string;
  lines: string[];
};

export function buildCustomerDigests(updates: OrderUpdate[]): CustomerDigest[] {
  const latestByOrder = new Map<string, OrderUpdate>();
  for (const update of updates) {
    const current = latestByOrder.get(update.orderId);
    if (!current || update.updatedAt > current.updatedAt) latestByOrder.set(update.orderId, update);
  }

  const byCustomer = new Map<string, OrderUpdate[]>();
  for (const update of latestByOrder.values()) {
    const customerOrders = byCustomer.get(update.customerEmail) ?? [];
    customerOrders.push(update);
    byCustomer.set(update.customerEmail, customerOrders);
  }

  return [...byCustomer.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([customerEmail, orders]) => ({
      customerEmail,
      subject: `Your weekly order update (${orders.length})`,
      lines: orders
        .sort((left, right) => left.orderId.localeCompare(right.orderId))
        .map((order) =>
          `${order.orderId}: ${order.fulfillment}; ${order.receiptSent ? "receipt sent" : "receipt pending"}; ${order.checkoutTotal.toFixed(2)} ${order.currency.toUpperCase()}`
        )
    }));
}
