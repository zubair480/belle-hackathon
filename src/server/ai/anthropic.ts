import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { DomainError, type AlertExtractRequest } from "@/contracts/recall";
import {
  EXTRACTION_SYSTEM_PROMPT,
  ModelAlertOutputSchema,
  buildUserMessage,
  type AlertExtractionProvider,
  type ProviderCallOptions,
} from "./provider";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

/**
 * Live structured-output provider backed by the Claude API through the official SDK.
 * Requires an explicitly configured, funded credential (RECALL_AI_API_KEY). Qoder IDE credits and
 * Claude subscriptions do not fund these calls. No tools are exposed to the model; it can only
 * return the schema below. Errors are translated to contract codes without leaking the key.
 */
export class AnthropicAlertProvider implements AlertExtractionProvider {
  readonly name = "anthropic";
  readonly mode = "live" as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(options: { apiKey: string; model?: string }) {
    if (!options.apiKey) throw new DomainError("AI_UNAVAILABLE", "RECALL_AI_API_KEY is not configured.");
    this.model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 1 });
  }

  async extract(request: AlertExtractRequest, options: ProviderCallOptions): Promise<unknown> {
    try {
      const response = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: 4096,
          system: EXTRACTION_SYSTEM_PROMPT,
          output_config: { effort: "medium", format: zodOutputFormat(ModelAlertOutputSchema) },
          messages: [{ role: "user", content: buildUserMessage(request) }],
        },
        { timeout: options.timeoutMs },
      );
      if (response.stop_reason === "refusal") {
        throw new DomainError("AI_OUTPUT_REJECTED", "The model declined to process this text.");
      }
      if (response.stop_reason === "max_tokens") {
        throw new DomainError("AI_OUTPUT_REJECTED", "The model output was truncated.");
      }
      if (!response.parsed_output) {
        throw new DomainError("AI_OUTPUT_REJECTED", "The model returned output that did not match the schema.");
      }
      return response.parsed_output;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new DomainError("AI_UNAVAILABLE", "The configured AI credential was rejected by the provider.");
      }
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new DomainError("TIMEOUT", "The model request timed out.");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new DomainError("AI_UNAVAILABLE", "The model provider is rate limiting requests; try again shortly.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new DomainError("AI_UNAVAILABLE", `Model provider error (${error.status ?? "unknown status"}).`);
      }
      throw new DomainError("AI_UNAVAILABLE", "The model request failed.");
    }
  }
}
