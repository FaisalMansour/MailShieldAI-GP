import { z } from "zod";

export const evidenceSources = [
  "HEADER",
  "SENDER",
  "REPLY_TO",
  "SUBJECT",
  "BODY",
  "URL",
  "ATTACHMENT_METADATA",
  "AUTHENTICATION_RESULT",
  "DETERMINISTIC_CHECK",
] as const;

export const analysisResponseSchema = z.object({
  classification: z.enum([
    "LEGITIMATE",
    "SUSPICIOUS",
    "PHISHING",
    "IMPERSONATION",
    "SCAM",
    "MALWARE_RELATED",
    "SPAM",
    "UNCERTAIN",
  ]),
  estimatedRiskScore: z.number().int().min(0).max(100),
  severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  overview: z.string().min(1).max(1200),
  observedEvidence: z
    .array(
      z.object({
        source: z.enum(evidenceSources),
        label: z.string().min(1).max(120),
        exactValue: z.string().min(1).max(800),
      }),
    )
    .max(20),
  interpretations: z.array(z.string().min(1).max(600)).max(12),
  suspiciousLocations: z.array(z.string().min(1).max(300)).max(15),
  possibleAttackMethod: z.string().min(1).max(1000),
  recommendedActions: z.array(z.string().min(1).max(400)).min(1).max(10),
  limitations: z.array(z.string().min(1).max(400)).min(1).max(10),
  humanReviewRecommended: z.boolean(),
});

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
