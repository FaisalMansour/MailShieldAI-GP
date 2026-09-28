import { analysisResponseSchema, type AnalysisResponse } from "./schema";

export function parseProviderAnalysisResponse(
  outputParsed: unknown,
  outputText: string,
): AnalysisResponse {
  if (outputParsed) return analysisResponseSchema.parse(outputParsed);
  if (!outputText.trim()) throw new Error("AI_INVALID_OUTPUT");

  try {
    return analysisResponseSchema.parse(JSON.parse(outputText));
  } catch {
    throw new Error("AI_INVALID_OUTPUT");
  }
}
