import type {
  AnalysisReport,
  EmailAttachment,
  GmailConnection,
  Notification,
  StoredEmail,
} from "@/lib/generated/prisma/client";
import type { Session } from "next-auth";
import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { monitoringConfig } from "@/lib/gmail/monitor";
import { hasModifyScope } from "@/lib/gmail/monitor-core";
import {
  RealWorkspaceClient,
  type RealNotification,
} from "./real-workspace-client";

type EmailRow = StoredEmail & {
  attachments: EmailAttachment[];
  reports: AnalysisReport[];
};

type NotificationRow = Notification & {
  storedEmail?: { subject: string | null };
};

type UsageSums = {
  analyzedMessages?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostMicros?: number | null;
};

const notices: Record<string, string> = {
  "gmail-upgraded":
    "Gmail permission upgraded. MailShield can now apply its warning labels after reports are stored.",
  "monitoring-enabled":
    "Near-real-time Gmail monitoring enabled. Notifications and analysis may be delayed.",
  "monitoring-renewed": "Gmail watch renewed.",
  "monitoring-disabled":
    "Automatic monitoring disabled. Sync now remains available.",
  "gmail-connected":
    "Gmail connected. No historical email was imported automatically.",
  "gmail-reconnect-required":
    "Gmail connected, but offline access was not returned. Reconnect before the access token expires.",
  "gmail-disconnected":
    "Gmail disconnected. Imported emails remain until deletion or their 30-day expiry.",
  "mailbox-mismatch":
    "The Gmail mailbox did not match your signed-in Google account, so it was not connected.",
  "gmail-consent-denied":
    "Gmail access was not granted. Your MailShield account remains signed in.",
  "gmail-oauth-failed":
    "The Gmail connection could not be completed. Check Google OAuth configuration and try again.",
  "sync-already-running":
    "A synchronization is already running for this mailbox.",
  "sync-baseline-missing":
    "The Gmail synchronization baseline is unavailable. Reconnect Gmail to establish a new baseline.",
  "gmail-not-connected": "Connect or reconnect Gmail before syncing.",
  "analysis-enabled":
    "AI analysis is enabled. New and pending messages are analyzed automatically within your daily limit.",
  "analysis-disabled":
    "Future AI analysis is disabled. Stored reports remain until you delete them.",
  "analysis-consent-required":
    "Enable the AI analysis consent setting before analyzing real email.",
  "ai-not-configured":
    "AI analysis is not configured. Add the selected server-side provider settings to enable it.",
  "daily-analysis-limit-reached":
    "Your daily analysis limit has been reached. No paid overage was attempted.",
  "analysis-already-running":
    "This message is already queued or being analyzed.",
  "already-analyzed":
    "This version was already analyzed. Use Reanalyze from its report page if needed.",
  "ai-analysis-failed":
    "The AI provider did not return a valid report. The message is marked failed and can be retried.",
  "eml-uploaded":
    "The EML file was parsed and stored. Automatic analysis has started, and the original upload was discarded.",
  "invalid-eml-file": "The upload was not a valid supported EML message.",
  "eml-too-large": "The EML file exceeds the 5 MB upload limit.",
  "duplicate-eml": "That exact EML file has already been uploaded.",
  "eml-deleted": "The uploaded email and its dependent reports were deleted.",
  "report-deleted": "The stored analysis report was deleted.",
  "correction-saved":
    "Marked as not a threat. The original report remains unchanged.",
  "correction-undone": "The user correction was undone.",
  "delete-confirmation-required":
    "Type DELETE to confirm removal of imported emails.",
  "account-delete-confirmation-required":
    "Type DELETE MY ACCOUNT exactly to confirm account deletion.",
  "operation-failed":
    "The operation did not finish. Check the configuration and retry.",
};

function noticeText(value?: string) {
  if (!value) return null;
  if (notices[value]) return notices[value];
  const imported = value.match(/^imported-(\d+)-duplicates-(\d+)$/);
  if (imported)
    return `Import finished: ${imported[1]} new emails stored and ${imported[2]} duplicates skipped. New messages are being analyzed automatically.`;
  const deleted = value.match(/^emails-deleted-(\d+)$/);
  if (deleted)
    return `Deleted ${deleted[1]} stored email${deleted[1] === "1" ? "" : "s"} from MailShield.`;
  const sync = value.match(
    /^sync-(complete|partial)-(\d+)-(\d+)(-recovered)?$/,
  );
  if (sync)
    return `${sync[1] === "partial" ? "This bounded sync has more changes; choose Continue sync." : "Sync finished."} ${sync[2]} new emails stored and ${sync[3]} duplicates skipped.${Number(sync[2]) ? " New messages are being analyzed automatically." : ""}${sync[4] ? " Gmail history had expired, so MailShield recovered from the latest 50 inbox messages." : ""}`;
  const batch = value.match(/^analysis-batch-(\d+)-(\d+)$/);
  if (batch)
    return `Analysis batch finished: ${batch[1]} completed and ${batch[2]} failed.`;
  if (/^analysis-complete-/.test(value))
    return "Analysis completed and the versioned report was stored.";
  return null;
}

export function RealWorkspace({
  session,
  connection,
  emails,
  total,
  userSettings,
  stats,
  notifications,
  usage,
  aiConfigured,
  monitoringActivity,
  notice,
}: {
  session: Session;
  connection: GmailConnection | null;
  emails: EmailRow[];
  total: number;
  userSettings: { analysisEnabled: boolean; dailyAnalysisLimit: number };
  stats: { analyzed: number; pending: number; failed: number; flagged: number };
  notifications: NotificationRow[];
  usage: { daily: UsageSums; total: UsageSums };
  aiConfigured: boolean;
  monitoringActivity: {
    run: { status: string; source: string; at: string } | null;
    push: { status: string; at: string } | null;
  };
  notice?: string;
}) {
  const serializedEmails = emails.map((email) => ({
    id: email.id,
    subject: email.subject,
    sender: email.sender,
    source: email.source,
    processingStatus: email.processingStatus,
    contentTruncated: email.contentTruncated,
    gmailLabelStatus: email.gmailLabelStatus,
    receivedAt: email.receivedAt?.toISOString() ?? null,
    attachmentCount: email.attachments.length,
    report: email.reports[0]
      ? {
          finalScore: email.reports[0].finalScore,
          severity: email.reports[0].severity,
          classification: email.reports[0].classification,
        }
      : null,
  }));
  const serializedNotifications: RealNotification[] = notifications.map(
    (item) => ({
      id: item.id,
      storedEmailId: item.storedEmailId,
      severity: item.severity,
      title: item.title,
      message: item.message,
      subject: item.storedEmail?.subject ?? null,
      createdAt: item.createdAt.toISOString(),
      readAt: item.readAt?.toISOString() ?? null,
    }),
  );
  const hasMore =
    Boolean(connection?.continuationPageToken) ||
    (Array.isArray(connection?.pendingMessageIds) &&
      connection.pendingMessageIds.length > 0);

  return (
    <RealWorkspaceClient
      user={{
        name: session.user.name || "MailShield user",
        email: session.user.email || "",
      }}
      connection={
        connection
          ? {
              status: connection.status,
              mailboxEmail: connection.mailboxEmail,
              lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
              lastErrorMessage: connection.lastErrorMessage,
              hasMore,
              labelPermission: hasModifyScope(connection.grantedScopes),
              monitoringEnabled: connection.monitoringEnabled,
              watchExpiresAt: connection.watchExpiresAt?.toISOString() ?? null,
              watchRenewedAt: connection.watchRenewedAt?.toISOString() ?? null,
              lastNotificationAt:
                connection.lastNotificationAt?.toISOString() ?? null,
              lastAutomaticSyncAt:
                connection.lastAutomaticSyncAt?.toISOString() ?? null,
              lastAnalysisAt: connection.lastAnalysisAt?.toISOString() ?? null,
              lastLabelAt: connection.lastLabelAt?.toISOString() ?? null,
              monitoringError: connection.monitoringError,
            }
          : null
      }
      emails={serializedEmails}
      total={total}
      userSettings={userSettings}
      stats={stats}
      notifications={serializedNotifications}
      usage={{
        daily: {
          analyzedMessages: usage.daily.analyzedMessages || 0,
          inputTokens: usage.daily.inputTokens || 0,
          outputTokens: usage.daily.outputTokens || 0,
          estimatedCostMicros: usage.daily.estimatedCostMicros || 0,
        },
        total: {
          analyzedMessages: usage.total.analyzedMessages || 0,
          inputTokens: usage.total.inputTokens || 0,
          outputTokens: usage.total.outputTokens || 0,
          estimatedCostMicros: usage.total.estimatedCostMicros || 0,
        },
      }}
      aiConfigured={aiConfigured}
      monitoringActivity={monitoringActivity}
      pubsubConfigured={monitoringConfig().configured}
      notice={noticeText(notice)}
      signOutControl={
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="button" type="submit">
            <LogOut size={15} />
            Sign out
          </button>
        </form>
      }
    />
  );
}
