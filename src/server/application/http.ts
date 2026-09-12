import { z } from "zod";
import {
  ERROR_HTTP_STATUS,
  LIMITS,
  apiFail,
  apiOk,
  isDomainError,
  type ApiResponse,
  type ErrorCode,
} from "@/contracts/recall";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export function jsonOk<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(apiOk(data)), { status, headers: JSON_HEADERS });
}

export function jsonFail(code: ErrorCode, message: string, details?: unknown): Response {
  const body: ApiResponse<never> = apiFail(code, message, details);
  return new Response(JSON.stringify(body), { status: ERROR_HTTP_STATUS[code], headers: JSON_HEADERS });
}

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Reads and parses a bounded JSON body. Rejects oversized or malformed payloads with a stable code. */
export async function readJsonBody(req: Request, maxBytes = LIMITS.maxJsonBodyBytes): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError("PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes.`);
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError("PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes.`);
  }
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError("VALIDATION_FAILED", "Request body is not valid JSON.");
  }
}

/** Validates with a Zod schema, converting failures into VALIDATION_FAILED with flattened issues. */
export function validate<T extends z.ZodTypeAny>(schema: T, value: unknown, what = "request"): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message }));
    throw new HttpError("VALIDATION_FAILED", `Invalid ${what}.`, { issues });
  }
  return r.data;
}

/** Runs a promise with a timeout. On expiry rejects with TIMEOUT; the underlying work is not cancelled. */
export function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HttpError("TIMEOUT", `${label} exceeded ${ms} ms.`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const CREDENTIAL_PATTERN =
  /(password|passwd|secret|token|api[-_ ]?key|authorization|neo4j\+s?:\/\/\S+|bolt:\/\/\S+|sk-[A-Za-z0-9_-]{8,})/i;

/** Credential-free message for unexpected errors. Anything that smells like a secret is replaced. */
export function safeMessage(e: unknown, fallback = "Unexpected server error."): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!raw || CREDENTIAL_PATTERN.test(raw)) return fallback;
  return raw.length > 300 ? `${raw.slice(0, 300)}...` : raw;
}

/** Translates any thrown value into the single ApiResponse error envelope. */
export function toErrorResponse(e: unknown): Response {
  if (e instanceof HttpError) return jsonFail(e.code, e.message, e.details);
  if (isDomainError(e)) return jsonFail(e.code, safeMessage(e, "Domain operation failed."), e.details);
  const message = safeMessage(e);
  if (/ECONNREFUSED|ServiceUnavailable|SessionExpired|Neo4jError|routing/i.test(message)) {
    return jsonFail("BACKEND_UNAVAILABLE", "A required backend is unavailable.");
  }
  return jsonFail("INTERNAL", message);
}

/**
 * Prevents concurrent duplicate mutations (double-click accept / trace) per workspace+key.
 * A second identical in-flight action receives DUPLICATE_ACTION instead of running twice.
 */
export class InFlightGuard {
  private readonly keys = new Set<string>();
  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (this.keys.has(key)) {
      throw new HttpError("DUPLICATE_ACTION", "The same action is already in progress.", { key });
    }
    this.keys.add(key);
    try {
      return await work();
    } finally {
      this.keys.delete(key);
    }
  }
}
