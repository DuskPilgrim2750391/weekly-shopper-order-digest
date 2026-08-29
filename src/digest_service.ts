import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai.ts";
import { buildCustomerDigests, orderUpdateSchema, type OrderUpdate } from "./order_digest.ts";

const port = Number(process.env.PORT ?? 3000);
const orderUpdatesQueue = "weekly-shopper-digest-order-updates";

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/orders/update") {
      const update = orderUpdateSchema.parse(await readJson(request));
      await infrai.queue.publish({ queue: orderUpdatesQueue, payload: update });
      json(response, 202, { queued: true, orderId: update.orderId });
      return;
    }

    if (request.method === "POST" && request.url === "/digests/weekly") {
      const batch = await infrai.queue.consume<OrderUpdate>({
        queue: orderUpdatesQueue,
        max_messages: 100,
        visibility_timeout: 120
      });
      const validMessages = batch.messages.map((message) => ({
        message,
        update: orderUpdateSchema.parse(message.payload)
      }));
      const digests = buildCustomerDigests(validMessages.map(({ update }) => update));
      await Promise.all(
        validMessages.map(({ message }) =>
          infrai.queue.ack({ queue: orderUpdatesQueue, message_id: message.message_id })
        )
      );
      json(response, 200, { digestCount: digests.length, digests });
      return;
    }

    json(response, 404, { message: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) {
      json(response, 400, { message: "Invalid order update", issues: error.issues });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { message: error.message, code: error.code });
      return;
    }
    json(response, 500, { message: error instanceof Error ? error.message : "Unexpected error" });
  }
});

server.listen(port, () => {
  console.log(`Digest service listening on http://localhost:${port}`);
});
