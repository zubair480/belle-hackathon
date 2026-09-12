type Env = Record<string, string | undefined>;
import { DomainError } from "@/contracts/common";
import { AnthropicProvider } from "./anthropic";
import type { StructuredOutputProvider } from "./provider";
import { StubProvider } from "./stub";

export type AiProviderSetting = "none" | "stub" | "anthropic";

export function configuredAiProvider(env: Env = process.env): AiProviderSetting {
  const v = (env.RECALL_AI_PROVIDER ?? "none").toLowerCase();
  return v === "stub" || v === "anthropic" ? v : "none";
}

/**
 * Resolves the single configured provider. Returns null for "none" (manual entry only).
 * A live provider without a credential throws AI_UNAVAILABLE; it never degrades to the stub.
 */
export function resolveProvider(env: Env = process.env): StructuredOutputProvider | null {
  switch (configuredAiProvider(env)) {
    case "none":
      return null;
    case "stub":
      return new StubProvider();
    case "anthropic": {
      const apiKey = env.RECALL_AI_API_KEY ?? "";
      if (!apiKey || apiKey.startsWith("<")) {
        throw new DomainError("AI_UNAVAILABLE", "RECALL_AI_PROVIDER=anthropic requires RECALL_AI_API_KEY. Manual entry remains available.");
      }
      const model = env.RECALL_AI_MODEL && !env.RECALL_AI_MODEL.startsWith("<") ? env.RECALL_AI_MODEL : undefined;
      return new AnthropicProvider({ apiKey, model });
    }
  }
}

export function aiTimeoutMs(env: Env = process.env): number {
  const n = Number(env.RECALL_AI_TIMEOUT_MS ?? "15000");
  return Number.isFinite(n) && n > 0 ? n : 15000;
}
