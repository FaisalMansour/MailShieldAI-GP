export const THREAT_CLASSES = new Set([
  "SUSPICIOUS",
  "PHISHING",
  "IMPERSONATION",
  "SCAM",
  "MALWARE_RELATED",
  "UNCERTAIN",
]);

export type EvaluationPrediction = {
  expected: string;
  predicted: string | null;
  durationMs: number;
  status: "COMPLETED" | "FAILED";
};

export function calculateEvaluationMetrics(rows: EvaluationPrediction[]) {
  let tp = 0,
    tn = 0,
    fp = 0,
    fn = 0;
  const byCategory: Record<string, { total: number; correct: number }> = {};
  for (const row of rows) {
    const expectedThreat = THREAT_CLASSES.has(row.expected);
    const predictedThreat = row.predicted
      ? THREAT_CLASSES.has(row.predicted)
      : false;
    if (row.status === "COMPLETED") {
      if (expectedThreat && predictedThreat) tp++;
      else if (!expectedThreat && !predictedThreat) tn++;
      else if (!expectedThreat && predictedThreat) fp++;
      else fn++;
    }
    byCategory[row.expected] ||= { total: 0, correct: 0 };
    byCategory[row.expected].total++;
    if (row.predicted === row.expected) byCategory[row.expected].correct++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 =
    precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    confusionMatrix: {
      truePositive: tp,
      trueNegative: tn,
      falsePositive: fp,
      falseNegative: fn,
    },
    precision,
    recall,
    f1,
    falsePositiveRate: fp + tn ? fp / (fp + tn) : 0,
    falseNegativeCount: fn,
    failedOrInvalid: rows.filter((row) => row.status === "FAILED").length,
    averageProcessingMs: rows.length
      ? rows.reduce((sum, row) => sum + row.durationMs, 0) / rows.length
      : 0,
    byCategory,
  };
}
