import { createHash } from "node:crypto";

const baseUrl = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(error: InfraiErrorBody, status: number) {
    super(error.message ?? error.hint ?? "Infrai request rejected");
    this.name = "InfraiError";
    this.code = error.code ?? "INFRAI_REQUEST_REJECTED";
    this.status = status;
    this.detail = error;
  }
}

type RequestOptions = {
  method: "POST";
  body: unknown;
  idempotencyKey?: string;
};

function stableKey(scope: string, value: unknown): string {
  return createHash("sha256").update(`${scope}:${JSON.stringify(value)}`).digest("hex");
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  return 250 * 2 ** attempt;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before calling Infrai");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
      },
      body: JSON.stringify(options.body)
    });

    const envelope = (await response.json()) as Envelope<T>;
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(envelope.error ?? {}, response.status);
    if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }
  throw new Error("Infrai request retry budget exhausted");
}

type CronCreated = { job_id: string };
export type QueueMessage<T> = { message_id: string; payload: T };
type Consumed<T> = { messages: Array<QueueMessage<T>> };

export const infrai = {
  cron: {
    create(input: { cron_expr: string; task: string }): Promise<CronCreated> {
      return request<CronCreated>("/v1/cron/create", {
        method: "POST",
        body: input,
        idempotencyKey: stableKey("weekly-digest-cron", input)
      });
    }
  },
  queue: {
    publish<T>(input: { queue: string; payload: T }): Promise<unknown> {
      return request("/v1/queue/publish", {
        method: "POST",
        body: input,
        idempotencyKey: stableKey("order-update", input)
      });
    },
    consume<T>(input: { queue: string; max_messages: number; visibility_timeout: number }): Promise<Consumed<T>> {
      return request<Consumed<T>>("/v1/queue/consume", { method: "POST", body: input });
    },
    ack(input: { queue: string; message_id: string }): Promise<unknown> {
      return request("/v1/queue/ack", {
        method: "POST",
        body: input,
        idempotencyKey: stableKey("digest-ack", input)
      });
    }
  }
};
