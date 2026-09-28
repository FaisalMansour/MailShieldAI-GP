export function analysisPolicyError(input: {
  consentEnabled: boolean;
  providerConfigured: boolean;
  usedToday: number;
  dailyLimit: number;
}) {
  if (!input.consentEnabled) return "ANALYSIS_CONSENT_REQUIRED";
  if (!input.providerConfigured) return "AI_NOT_CONFIGURED";
  if (input.usedToday >= input.dailyLimit)
    return "DAILY_ANALYSIS_LIMIT_REACHED";
  return null;
}

export function analysisLockEligible(
  status: string,
  hasExistingReport: boolean,
  reanalyze: boolean,
) {
  if (status === "ANALYZING" || status === "QUEUED") return false;
  if (hasExistingReport && !reanalyze) return false;
  return [
    "NOT_ANALYZED",
    "FAILED",
    "NEEDS_REVIEW",
    "COMPLETED",
    "PARSE_PARTIAL",
  ].includes(status);
}
