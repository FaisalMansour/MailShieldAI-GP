export type Severity = "High" | "Medium" | "Low";
export type Category =
  | "Phishing"
  | "Impersonation"
  | "Invoice scam"
  | "Suspicious attachment"
  | "Analyzer manipulation"
  | "Needs caution"
  | "Normal correspondence"
  | "Newsletter";
export type AnalysisStatus =
  "Analyzed" | "Processing" | "Pending" | "Analysis failed";
export type AuthResult = "Pass" | "Fail" | "Unknown";
export interface Evidence {
  location: string;
  observed: string;
  interpretation: string;
}
export interface Report {
  score: number;
  confidence: number;
  overview: string;
  categories: Category[];
  evidence: Evidence[];
  mechanism: string;
  nextSteps: string[];
  limitations: string[];
}
export interface Email {
  id: string;
  senderName: string;
  sender: string;
  replyTo: string;
  recipient: string;
  subject: string;
  receivedAt: string;
  body: string;
  links: string[];
  attachments: { name: string; size: string; type: string }[];
  authentication: { spf: AuthResult; dkim: AuthResult; dmarc: AuthResult };
  status: AnalysisStatus;
  report?: Report;
  error?: string;
}
export interface InboxConnection {
  provider: "gmail";
  account: string;
  connected: boolean;
  lastSync: string | null;
}
export interface DemoState {
  version: 2;
  connected: boolean;
  importedCount: number;
  lastSync: string | null;
  readIds: string[];
  emailAlerts: boolean;
  correctedIds: string[];
}

// Future adapters have no live implementations or credentials in Phase 1.
export interface EmailRetrieval {
  connect(): Promise<InboxConnection>;
  disconnect(): Promise<void>;
  retrieveIncoming(
    cursor?: string,
  ): Promise<{ emails: Email[]; nextCursor?: string }>;
}
export interface ThreatAnalyzer {
  analyze(email: Readonly<Email>, signal?: AbortSignal): Promise<Report>;
}
export interface AlertDelivery {
  sendHighRiskAlert(
    email: Readonly<Email>,
    report: Readonly<Report>,
  ): Promise<{ deliveryId: string }>;
}
