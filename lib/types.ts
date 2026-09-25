export type Severity = 'High' | 'Medium' | 'Low';
export type Category = 'Phishing' | 'Impersonation' | 'Invoice scam' | 'Suspicious attachment' | 'Analyzer manipulation' | 'Needs caution' | 'Normal correspondence' | 'Newsletter';
export type AnalysisStatus = 'Analyzed' | 'Not analyzed' | 'Analysis failed';
export interface Evidence { location: string; observed: string; interpretation: string }
export interface Report { score: number; confidence: number; overview: string; categories: Category[]; evidence: Evidence[]; mechanism: string; nextSteps: string[]; limitations: string[] }
export interface Email { id: string; senderName: string; sender: string; replyTo: string; recipient: string; subject: string; receivedAt: string; body: string; links: string[]; attachments: {name: string; size: string; type: string}[]; status: AnalysisStatus; report?: Report; error?: string }
export interface InboxConnection { provider: 'gmail'; account: string; connected: boolean; lastSync: string | null }
export interface DemoState { version: 1; connected: boolean; synced: boolean; lastSync: string | null; readIds: string[]; emailAlerts: boolean }
// Future adapters must implement these contracts. No live implementations or credentials exist in Phase 1.
export interface GmailRetrieval { connect(): Promise<InboxConnection>; disconnect(): Promise<void>; retrieveIncoming(cursor?: string): Promise<{emails: Email[]; nextCursor?: string}> }
export interface ThreatAnalyzer { analyze(email: Readonly<Email>, signal?: AbortSignal): Promise<Report> }
