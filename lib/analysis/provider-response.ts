import { analysisResponseSchema, type AnalysisResponse } from "./schema";

export function parseProviderAnalysisResponse(
  outputParsed: unknown,
  outputText: string,
): AnalysisResponse {
  if (outputParsed) return analysisResponseSchema.parse(outputParsed);
  const trimmed = outputText.trim();
  if (!trimmed) throw new Error("AI_INVALID_OUTPUT");

  const jsonText = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;

  try {
    return analysisResponseSchema.parse(JSON.parse(jsonText));
  } catch {
    throw new Error("AI_INVALID_OUTPUT");
  }
}
