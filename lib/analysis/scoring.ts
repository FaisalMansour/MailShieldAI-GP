import type { DeterministicFindingData, FindingSeverity } from "./types";

const POINTS: Record<FindingSeverity, number> = { LOW: 4, MEDIUM: 9, HIGH: 16 };

export function deterministicContribution(
  findings: DeterministicFindingData[],
) {
  return Math.min(
    40,
    findings.reduce((sum, item) => sum + POINTS[item.severity], 0),
  );
}

export function finalRiskScore(aiScore: number, deterministicPoints: number) {
  const boundedAi = Math.max(0, Math.min(100, Math.round(aiScore)));
  const boundedDeterministic = Math.max(
    0,
    Math.min(40, Math.round(deterministicPoints)),
  );
  return Math.max(
    0,
    Math.min(100, Math.round(boundedAi * 0.75 + boundedDeterministic)),
  );
}

export function severityForScore(score: number) {
  if (score >= 70) return "HIGH" as const;
  if (score >= 40) return "MEDIUM" as const;
  return "LOW" as const;
}

export function isThreatClassification(value: string) {
  return !["LEGITIMATE", "SPAM"].includes(value);
}
