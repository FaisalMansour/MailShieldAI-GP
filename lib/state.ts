import { demoEmails, syncQueue } from "./demo-data";
import type { DemoState, Email, Severity } from "./types";

export const DEMO_THRESHOLDS = {
  Low: [0, 39],
  Medium: [40, 69],
  High: [70, 100],
} as const;
export const initialState: DemoState = {
  version: 2,
  connected: true,
  importedCount: 0,
  lastSync: "2026-09-25T14:45:00Z",
  readIds: [],
  emailAlerts: false,
  correctedIds: [],
};
export const STORAGE_KEY = "mailshield-fictional-demo-v2";
export function severity(email: Email): Severity | undefined {
  if (!email.report) return undefined;
  return email.report.score >= 70
    ? "High"
    : email.report.score >= 40
      ? "Medium"
      : "Low";
}
export function emailsFor(state: DemoState, processing?: Email) {
  if (!state.connected) return [];
  const imported = syncQueue.slice(0, state.importedCount);
  return processing
    ? [processing, ...imported, ...demoEmails]
    : [...imported, ...demoEmails];
}
export function notificationsFor(state: DemoState, processing?: Email) {
  return emailsFor(state, processing)
    .filter(
      (e) => e.report && (severity(e) === "Medium" || severity(e) === "High"),
    )
    .map((e) => ({
      id: `alert-${e.id}`,
      email: e,
      read: state.readIds.includes(`alert-${e.id}`),
      corrected: state.correctedIds.includes(e.id),
    }));
}
export function nextSyncEmail(state: DemoState) {
  return syncQueue[state.importedCount];
}
export function completeSync(state: DemoState): DemoState {
  if (!state.connected || state.importedCount >= syncQueue.length) return state;
  const importedCount = state.importedCount + 1;
  return {
    ...state,
    importedCount,
    lastSync: syncQueue[importedCount - 1].receivedAt,
  };
}
export function toggleCorrection(state: DemoState, emailId: string): DemoState {
  const corrected = state.correctedIds.includes(emailId);
  return {
    ...state,
    correctedIds: corrected
      ? state.correctedIds.filter((id) => id !== emailId)
      : [...state.correctedIds, emailId],
    readIds: corrected
      ? state.readIds
      : [...new Set([...state.readIds, `alert-${emailId}`])],
  };
}
export function isFlagged(email: Email, state?: DemoState) {
  return Boolean(
    email.report &&
    severity(email) !== "Low" &&
    !state?.correctedIds.includes(email.id),
  );
}
export function statsFor(emails: Email[], state?: DemoState) {
  return {
    total: emails.length,
    analyzed: emails.filter((e) => e.status === "Analyzed").length,
    flagged: emails.filter((e) => isFlagged(e, state)).length,
    pending: emails.filter(
      (e) => e.status === "Pending" || e.status === "Processing",
    ).length,
    failed: emails.filter((e) => e.status === "Analysis failed").length,
  };
}
export interface Filters {
  search: string;
  severity: string;
  category: string;
  status: string;
  sort: string;
}
export function filterEmails(emails: Email[], f: Filters) {
  return [...emails]
    .filter(
      (e) =>
        `${e.senderName} ${e.sender} ${e.subject}`
          .toLowerCase()
          .includes(f.search.toLowerCase()) &&
        (f.severity === "All" || severity(e) === f.severity) &&
        (f.category === "All" ||
          e.report?.categories.includes(f.category as never)) &&
        (f.status === "All" || e.status === f.status),
    )
    .sort((a, b) =>
      f.sort === "risk"
        ? (b.report?.score ?? -1) - (a.report?.score ?? -1)
        : f.sort === "oldest"
          ? a.receivedAt.localeCompare(b.receivedAt)
          : b.receivedAt.localeCompare(a.receivedAt),
    );
}
export function parseState(raw: string): DemoState {
  const s = JSON.parse(raw);
  if (
    s?.version !== 2 ||
    typeof s.connected !== "boolean" ||
    !Number.isInteger(s.importedCount) ||
    s.importedCount < 0 ||
    s.importedCount > syncQueue.length ||
    typeof s.emailAlerts !== "boolean" ||
    !Array.isArray(s.readIds) ||
    !Array.isArray(s.correctedIds) ||
    ![...s.readIds, ...s.correctedIds].every(
      (x: unknown) => typeof x === "string",
    ) ||
    (s.lastSync !== null &&
      (typeof s.lastSync !== "string" || Number.isNaN(Date.parse(s.lastSync))))
  )
    throw new Error("Invalid demo state");
  return {
    version: 2,
    connected: s.connected,
    importedCount: s.importedCount,
    emailAlerts: s.emailAlerts,
    readIds: s.readIds.filter((x: string) => /^alert-email-\d+$/.test(x)),
    correctedIds: s.correctedIds.filter((x: string) => /^email-\d+$/.test(x)),
    lastSync: s.lastSync,
  };
}
