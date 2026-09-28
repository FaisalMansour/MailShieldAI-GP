export const CHECK_VERSION = "checks-1.0.0";
export const PROMPT_VERSION = "email-security-1.0.0";
export const SCORING_VERSION = "hybrid-1.0.0";
export const ANALYSIS_BODY_LIMIT = 24_000;
export const ANALYSIS_BATCH_LIMIT = 10;

export type FindingSeverity = "LOW" | "MEDIUM" | "HIGH";

export type NormalizedLink = {
  url: string;
  visibleText?: string;
};

export type AnalysisEmail = {
  sender: string | null;
  replyTo: string | null;
  subject: string | null;
  body: string;
  links: NormalizedLink[];
  attachments: { fileName: string; mimeType: string; sizeBytes: number }[];
  headers: Record<string, string | null>;
};

export type DeterministicFindingData = {
  checkId: string;
  severity: FindingSeverity;
  explanation: string;
  supportingValue: string;
  sourceField: string;
  checkVersion: string;
};

export type AuthenticationEvidence = {
  spf: "PASS" | "FAIL" | "UNKNOWN";
  dkim: "PASS" | "FAIL" | "UNKNOWN";
  dmarc: "PASS" | "FAIL" | "UNKNOWN";
  raw: string | null;
  trustLimitation: string;
};

export type DeterministicResult = {
  findings: DeterministicFindingData[];
  urlHostnames: string[];
  ipAddresses: string[];
  authentication: AuthenticationEvidence;
};

export function normalizeStoredLinks(value: unknown): NormalizedLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [{ url: item }];
    if (
      item &&
      typeof item === "object" &&
      "url" in item &&
      typeof item.url === "string"
    ) {
      return [
        {
          url: item.url,
          visibleText:
            "visibleText" in item && typeof item.visibleText === "string"
              ? item.visibleText
              : undefined,
        },
      ];
    }
    return [];
  });
}
