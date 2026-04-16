/**
 * Anthropic Batch API utilities, types + helper functions.
 * Used by cron batch poller for polling and result fetching.
 *
 * Batch API contract:
 *   POST /v1/messages/batches          , create batch
 *   GET  /v1/messages/batches/{id}     , poll status
 *   GET  /v1/messages/batches/{id}/results, fetch JSONL results
 */

// ── Types ──

export interface BatchRequestParams {
  model: string;
  max_tokens: number;
  thinking?: { type: "adaptive" };
  output_config?: { effort: string };
  temperature?: number;
  system:
    | string
    | Array<{
        type: "text";
        text: string;
        cache_control?: { type: "ephemeral"; ttl: string };
      }>;
  messages: Array<{ role: string; content: string }>;
}

export interface BatchRequest {
  custom_id: string;
  params: BatchRequestParams;
}

export interface BatchStatus {
  id: string;
  type: "message_batch";
  processing_status: "in_progress" | "canceling" | "ended";
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  ended_at: string | null;
  created_at: string;
  expires_at: string;
  results_url: string | null;
}

export interface BatchResultSucceeded {
  custom_id: string;
  result: {
    type: "succeeded";
    message: {
      content: Array<{ type: string; text?: string; thinking?: string }>;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
  };
}

export interface BatchResultErrored {
  custom_id: string;
  result: {
    type: "errored";
    error: { type: string; error: { type: string; message: string } };
  };
}

export interface BatchResultExpiredOrCanceled {
  custom_id: string;
  result: { type: "expired" | "canceled" };
}

export type BatchResultLine =
  | BatchResultSucceeded
  | BatchResultErrored
  | BatchResultExpiredOrCanceled;

// ── Helpers ──

const API_BASE = "https://api.anthropic.com";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY env var");
  return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
}

/** Poll a batch by ID. Returns current status. */
export async function pollBatch(batchId: string): Promise<BatchStatus> {
  const res = await fetch(`${API_BASE}/v1/messages/batches/${batchId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Batch poll failed (${res.status}): ${await res.text()}`);
  }
  return res.json() as Promise<BatchStatus>;
}

/** Fetch JSONL results. Only call after processing_status === "ended". */
export async function fetchBatchResults(
  batchId: string
): Promise<BatchResultLine[]> {
  const res = await fetch(
    `${API_BASE}/v1/messages/batches/${batchId}/results`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    throw new Error(
      `Batch results fetch failed (${res.status}): ${await res.text()}`
    );
  }
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as BatchResultLine);
}

/** Extract joined text content from a succeeded batch result. */
export function extractText(result: BatchResultSucceeded): string {
  return result.result.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}
