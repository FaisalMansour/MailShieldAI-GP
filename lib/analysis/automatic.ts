import "server-only";
import { after } from "next/server";
import { analyzeUnprocessedBatch } from "./analyze";
import { syncPendingLabels } from "../gmail/labels";

const expectedAutomaticAnalysisStops = new Set([
  "ANALYSIS_CONSENT_REQUIRED",
  "AI_NOT_CONFIGURED",
  "DAILY_ANALYSIS_LIMIT_REACHED",
]);

export function scheduleAutomaticAnalysis(userId: string) {
  after(async () => {
    try {
      await analyzeUnprocessedBatch(userId);
      await syncPendingLabels(userId);
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      if (!expectedAutomaticAnalysisStops.has(code)) {
        console.error("Automatic email analysis failed", { code });
      }
    }
  });
}
