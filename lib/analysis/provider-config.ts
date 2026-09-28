export type AnalysisProviderName = "openai" | "deepseek";

type ProviderEnvironment = Record<string, string | undefined>;

export function selectedAnalysisProvider(
  env: ProviderEnvironment = process.env,
): AnalysisProviderName | null {
  const requested = env.AI_PROVIDER?.trim().toLowerCase();
  if (requested === "openai" || requested === "deepseek") return requested;
  if (requested) return null;
  if (env.DEEPSEEK_API_KEY?.trim()) return "deepseek";
  return "openai";
}

export function analysisProviderConfigured(
  env: ProviderEnvironment = process.env,
) {
  const provider = selectedAnalysisProvider(env);
  if (provider === "deepseek")
    return Boolean(env.DEEPSEEK_API_KEY?.trim() && env.DEEPSEEK_MODEL?.trim());
  if (provider === "openai")
    return Boolean(env.OPENAI_API_KEY?.trim() && env.OPENAI_MODEL?.trim());
  return false;
}

export function configuredModelIdentifier(
  env: ProviderEnvironment = process.env,
) {
  const provider = selectedAnalysisProvider(env);
  if (provider === "deepseek" && env.DEEPSEEK_MODEL?.trim())
    return `deepseek/${env.DEEPSEEK_MODEL.trim()}`;
  if (provider === "openai" && env.OPENAI_MODEL?.trim())
    return `openai/${env.OPENAI_MODEL.trim()}`;
  return null;
}
