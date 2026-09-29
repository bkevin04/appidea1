import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { Config } from "../config.js";
import { GenerationError, type ContentGenerator, type TeachBackInput, type UnitInput } from "./generator.js";
import { GAME_DESIGNER_SYSTEM, TEACH_BACK_SYSTEM, teachBackPrompt, unitPrompt } from "./prompts.js";
import { TeachBackGradeSchema, UnitContentSchema, type TeachBackGrade, type UnitContent } from "./schemas.js";

export class ClaudeGenerator implements ContentGenerator {
  readonly name = "anthropic";
  private client = new Anthropic();

  constructor(private config: Config) {}

  async generateUnit(input: UnitInput): Promise<UnitContent> {
    return this.structured(UnitContentSchema, {
      system: GAME_DESIGNER_SYSTEM,
      user: unitPrompt(input),
      effort: this.config.generationEffort,
      maxTokens: 16000,
    });
  }

  async gradeTeachBack(input: TeachBackInput): Promise<TeachBackGrade> {
    return this.structured(TeachBackGradeSchema, {
      system: TEACH_BACK_SYSTEM,
      user: teachBackPrompt(input),
      effort: this.config.gradingEffort,
      maxTokens: 4000,
    });
  }

  private async structured<T extends z.ZodType>(
    schema: T,
    opts: { system: string; user: string; effort: Config["generationEffort"]; maxTokens: number },
  ): Promise<z.infer<T>> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.config.claudeModel,
        max_tokens: opts.maxTokens,
        // If a safety classifier declines, the API retries on its recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: opts.user }],
        output_config: { effort: opts.effort, format: betaZodOutputFormat(schema) },
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new GenerationError("Anthropic API key is missing or invalid");
      } else if (error instanceof Anthropic.RateLimitError) {
        throw new GenerationError("Rate limited by the Anthropic API; try again shortly");
      } else if (error instanceof Anthropic.APIError) {
        throw new GenerationError(`Anthropic API error ${error.status}: ${error.message}`);
      }
      throw error;
    }

    if (response.stop_reason === "refusal") {
      throw new GenerationError("The model declined to process this content");
    }
    if (response.stop_reason === "max_tokens") {
      throw new GenerationError("The model ran out of output space; try a shorter section");
    }
    if (response.parsed_output == null) {
      throw new GenerationError("The model returned output that did not match the schema");
    }
    return response.parsed_output as z.infer<T>;
  }
}
