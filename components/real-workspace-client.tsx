"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BrainCircuit,
  CheckCheck,
  Clock3,
  FileUp,
  Inbox,
  LayoutDashboard,
  Mail,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";

type WorkspaceRoute = "overview" | "emails" | "notifications" | "settings";
type Severity = "LOW" | "MEDIUM" | "HIGH";

export type RealEmail = {
  id: string;
  subject: string | null;
  sender: string | null;
  source: "GMAIL" | "EML_UPLOAD";
  processingStatus: string;
  contentTruncated: boolean;
  receivedAt: string | null;
  attachmentCount: number;
  report: {
    finalScore: number;
    severity: Severity;
    classification: string;
  } | null;
};

export type RealNotification = {
  id: string;
  storedEmailId: string;
  severity: Severity;
  title: string;
  message: string;
  subject: string | null;
  createdAt: string;
  readAt: string | null;
};

type Connection = {
  status: "CONNECTED" | "RECONNECT_REQUIRED" | "DISCONNECTED";
  mailboxEmail: string;
  lastSyncAt: string | null;
  lastErrorMessage: string | null;
  hasMore: boolean;
} | null;

type Usage = {
  analyzedMessages: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
};

type Props = {
  user: { name: string; email: string };
  connection: Connection;
  emails: RealEmail[];
  total: number;
  userSettings: { analysisEnabled: boolean; dailyAnalysisLimit: number };
  stats: { analyzed: number; pending: number; failed: number; flagged: number };
  notifications: RealNotification[];
  usage: { daily: Usage; total: Usage };
  aiConfigured: boolean;
  notice: string | null;
  signOutControl: ReactNode;
};

const routeLabels: Record<WorkspaceRoute, string> = {
  overview: "Overview",
  emails: "All emails",
  notifications: "Notifications",
  settings: "Connection & settings",
};

function displayStatus(email: RealEmail) {
  if (email.report)
    return {
      label: `${email.report.finalScore} / 100 · ${email.report.severity.toLowerCase()}`,
      className: email.report.severity.toLowerCase(),
    };
  const labels: Record<string, string> = {
    NOT_ANALYZED: "Not analyzed",
    QUEUED: "Queued",
    ANALYZING: "Analyzing",
    FAILED: "Analysis failed",
    NEEDS_REVIEW: "Needs review",
    PARSE_PARTIAL: "Not analyzed",
    PARSE_FAILED: "Parse failed",
  };
  return {
    label: labels[email.processingStatus] || email.processingStatus,
    className: "unknown",
  };
}

function dateLabel(value: string | null, detailed = false) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(detailed ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(new Date(value));
}

function RealEmailTable({ emails }: { emails: RealEmail[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Email / sender</th>
            <th>Category</th>
            <th>Risk indicator</th>
            <th>Source</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((email) => {
            const status = displayStatus(email);
            return (
              <tr key={email.id}>
                <td>
                  <Link className="email-link" href={`/emails/${email.id}`}>
                    {email.subject || "(No subject)"}
                  </Link>
                  <span className="sender">
                    {email.sender || "Unknown sender"}
                  </span>
                </td>
                <td data-label="Category">
                  {email.report?.classification
                    .replaceAll("_", " ")
                    .toLowerCase() || "Unassessed"}
                </td>
                <td data-label="Risk indicator">
                  <span className={`badge ${status.className}`}>
                    {status.label}
                  </span>
                  {email.contentTruncated && (
                    <span className="score-mini">Partial content</span>
                  )}
                </td>
                <td data-label="Source">
                  {email.source === "GMAIL" ? "Gmail" : "EML upload"}
                </td>
                <td className="date-cell" data-label="Received">
                  {dateLabel(email.receivedAt, true)} UTC
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Overview({
  emails,
  total,
  stats,
}: Pick<Props, "emails" | "total" | "stats">) {
  const analyzed = emails.filter((email) => email.report);
  const high = analyzed.filter((email) => email.report?.severity === "HIGH").length;
  const medium = analyzed.filter(
    (email) => email.report?.severity === "MEDIUM",
  ).length;
  const low = analyzed.filter((email) => email.report?.severity === "LOW").length;
  const unassessed = Math.max(0, emails.length - analyzed.length);
  const flagged = emails
    .filter(
      (email) =>
        email.report?.severity === "HIGH" || email.report?.severity === "MEDIUM",
    )
    .slice(0, 5);
  const days = Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (4 - index));
    return date;
  });
  const counts = days.map((day) => {
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    const daily = emails.filter((email) => {
      const value = email.receivedAt ? new Date(email.receivedAt) : null;
      return value && value >= day && value < next;
    });
    return {
      received: daily.length,
      flagged: daily.filter(
        (email) =>
          email.report?.severity === "HIGH" ||
          email.report?.severity === "MEDIUM",
      ).length,
    };
  });
  const max = Math.max(1, ...counts.map((item) => item.received));
  const severityTotal = Math.max(1, high + medium + low + unassessed);

  return (
    <>
      <PageHeading
        eyebrow="PRIVATE EMAIL SECURITY WORKSPACE"
        title="Inbox overview"
        description="A clear view of your imported email, analysis progress, and findings that need attention."
        action={<span className="date-range">Latest 50 stored messages</span>}
      />
      <section className="metrics" aria-label="Workspace metrics">
        {[
          ["Stored emails", total, "Gmail and EML uploads", Mail],
          ["Analyzed", stats.analyzed, `${stats.pending} pending · ${stats.failed} failed`, BrainCircuit],
          ["Flagged emails", stats.flagged, "Medium or high findings", ShieldAlert],
          ["Retention", "30d", "Automatic storage window", Clock3],
        ].map(([title, value, detail, Icon], index) => {
          const MetricIcon = Icon as typeof Mail;
          return (
            <article className={`metric metric-${index}`} key={String(title)}>
              <div className="metric-top">
                <span>{String(title)}</span>
                <MetricIcon size={20} />
              </div>
              <strong>{String(value)}</strong>
              <span className="muted">{String(detail)}</span>
            </article>
          );
        })}
      </section>
      <div className="charts">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Email activity</h2>
              <p>Messages received during the last five days</p>
            </div>
            <span className="legend">
              <i /> Received <i className="flagged-dot" /> Flagged
            </span>
          </div>
          <div className="bar-chart" role="img" aria-label="Five-day email activity">
            {counts.map((item, index) => (
              <div className="bar-group" key={days[index].toISOString()}>
                <div className="bar-space">
                  <span
                    className="bar received"
                    style={{ height: `${(item.received / max) * 100}%` }}
                  >
                    <b>{item.received}</b>
                  </span>
                  <span
                    className="bar flagged"
                    style={{ height: `${(item.flagged / max) * 100}%` }}
                  />
                </div>
                <span>
                  {days[index].toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Threat severity</h2>
              <p>Latest stored report per message</p>
            </div>
          </div>
          <div className="severity-chart">
            <div
              className="donut"
              style={{
                background: `conic-gradient(#e76055 0 ${(high / severityTotal) * 100}%, #f0b94f ${(high / severityTotal) * 100}% ${((high + medium) / severityTotal) * 100}%, #348fd1 ${((high + medium) / severityTotal) * 100}% ${((high + medium + low) / severityTotal) * 100}%, #dfe5ec ${((high + medium + low) / severityTotal) * 100}% 100%)`,
              }}
              role="img"
              aria-label={`${high} high, ${medium} medium, ${low} low, ${unassessed} unassessed`}
            >
              <div>
                <strong>{stats.flagged}</strong>
                <span>flagged</span>
              </div>
            </div>
            <div className="severity-legend">
              {[
                ["High risk", high, "#e76055"],
                ["Medium risk", medium, "#f0b94f"],
                ["Low risk", low, "#348fd1"],
                ["Unassessed", unassessed, "#dfe5ec"],
              ].map(([label, count, color]) => (
                <div key={String(label)}>
                  <i style={{ background: String(color) }} />
                  <span>{String(label)}</span>
                  <b>{String(count)}</b>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>
              Needs your attention <span className="count">{stats.flagged}</span>
            </h2>
            <p>Recent medium- and high-risk reports.</p>
          </div>
          <a className="text-link" href="#emails">
            View all emails <ArrowUpRight size={16} />
          </a>
        </div>
        {flagged.length ? (
          <RealEmailTable emails={flagged} />
        ) : (
          <div className="empty-state">
            <ShieldCheck size={36} />
            <h2>No reviewed emails need attention</h2>
            <p>Medium- and high-risk results will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}

function EmailBrowser({ emails }: { emails: RealEmail[] }) {
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("All");
  const [source, setSource] = useState("All");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState("newest");
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return emails
      .filter((email) => {
        const searchable = `${email.subject || ""} ${email.sender || ""}`.toLowerCase();
        const emailStatus = email.report
          ? "Analyzed"
          : ["QUEUED", "ANALYZING"].includes(email.processingStatus)
            ? "Processing"
            : email.processingStatus === "FAILED"
              ? "Failed"
              : "Not analyzed";
        return (
          (!query || searchable.includes(query)) &&
          (severity === "All" || email.report?.severity === severity) &&
          (source === "All" || email.source === source) &&
          (status === "All" || emailStatus === status)
        );
      })
      .sort((a, b) => {
        if (sort === "risk")
          return (b.report?.finalScore || -1) - (a.report?.finalScore || -1);
        const aTime = a.receivedAt ? Date.parse(a.receivedAt) : 0;
        const bTime = b.receivedAt ? Date.parse(b.receivedAt) : 0;
        return sort === "oldest" ? aTime - bTime : bTime - aTime;
      });
  }, [emails, search, severity, source, status, sort]);
  const clear = () => {
    setSearch("");
    setSeverity("All");
    setSource("All");
    setStatus("All");
    setSort("newest");
  };

  return (
    <>
      <PageHeading
        eyebrow="REAL INBOX"
        title="All emails"
        description="Search imported messages and review the evidence one message at a time."
        action={<span className="date-range">{emails.length} stored messages</span>}
      />
      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            <Search size={18} />
            <span className="sr-only">Search sender or subject</span>
            <input
              type="search"
              placeholder="Search sender or subject…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="filter-fields">
            <SlidersHorizontal size={17} />
            <label>
              Severity
              <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
                <option>All</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </label>
            <label>
              Source
              <select value={source} onChange={(event) => setSource(event.target.value)}>
                <option>All</option>
                <option value="GMAIL">Gmail</option>
                <option value="EML_UPLOAD">EML upload</option>
              </select>
            </label>
            <label>
              Analysis status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option>All</option>
                <option>Analyzed</option>
                <option>Processing</option>
                <option>Failed</option>
                <option>Not analyzed</option>
              </select>
            </label>
            <label>
              Sort by
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="risk">Highest risk first</option>
              </select>
            </label>
          </div>
          <div className="results-line">
            <span role="status">Showing {shown.length} of {emails.length} emails</span>
            <button className="text-link" type="button" onClick={clear}>
              Clear filters
            </button>
          </div>
        </div>
        {shown.length ? (
          <RealEmailTable emails={shown} />
        ) : (
          <div className="empty-state">
            <Inbox size={36} />
            <h2>No matching emails</h2>
            <p>Try another sender, subject, or filter combination.</p>
            <button className="button" type="button" onClick={clear}>
              Clear all filters
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function NotificationsView({
  notifications,
  onRead,
  onReadAll,
  busy,
}: {
  notifications: RealNotification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
  busy: boolean;
}) {
  const unread = notifications.filter((item) => !item.readAt).length;
  return (
    <>
      <PageHeading
        eyebrow="IN-APP ALERTS"
        title="Notifications"
        description={`${unread} unread · Medium- and high-risk findings from real stored reports.`}
        action={
          <button className="button" type="button" onClick={onReadAll} disabled={!unread || busy}>
            <CheckCheck size={17} /> Mark all as read
          </button>
        }
      />
      <section className="panel notification-list">
        {notifications.length ? (
          notifications.map((item) => (
            <article className={`notification ${item.readAt ? "read" : "unread"}`} key={item.id}>
              <span className="notification-icon"><Bell size={19} /></span>
              <div className="notification-content">
                <div className="notification-title">
                  <h2>{item.title}</h2>
                  {!item.readAt && <span className="unread-label">Unread</span>}
                </div>
                <p>{item.subject || item.message}</p>
                <span className="notification-date">{dateLabel(item.createdAt, true)} UTC</span>
                <div className="notification-actions">
                  <Link className="text-link" href={`/emails/${item.storedEmailId}`}>
                    View report <ArrowUpRight size={15} />
                  </Link>
                  {!item.readAt ? (
                    <button className="text-link" type="button" disabled={busy} onClick={() => onRead(item.id)}>
                      Mark as read
                    </button>
                  ) : (
                    <span className="muted">Read</span>
                  )}
                </div>
              </div>
              <span className={`badge ${item.severity.toLowerCase()}`}>{item.severity}</span>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <Bell size={35} />
            <h2>No notifications yet</h2>
            <p>Medium- and high-risk analysis results will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}

function SettingsView({
  connection,
  userSettings,
  aiConfigured,
  usage,
}: Pick<Props, "connection" | "userSettings" | "aiConfigured" | "usage">) {
  const connected = connection?.status === "CONNECTED";
  const reconnect = connection?.status === "RECONNECT_REQUIRED";
  return (
    <>
      <PageHeading
        eyebrow="YOUR WORKSPACE"
        title="Connection & settings"
        description="Manage Gmail, uploads, analysis consent, usage, retention, and account data."
      />
      <div className="settings-grid real-settings-grid">
        <div>
          <section className="panel report-section">
            <div className="connection-header">
              <span className="provider-icon"><Mail size={28} /></span>
              <div>
                <h2>Gmail connection</h2>
                <p>{connection?.mailboxEmail || "No mailbox connected"}</p>
              </div>
              <span className={`badge ${connected ? "low" : "unknown"}`}>
                {connected ? "Read-only connected" : reconnect ? "Reconnect required" : "Disconnected"}
              </span>
            </div>
            <dl className="settings-meta">
              <dt>Connection</dt><dd>{connected ? "Google Gmail · read-only" : "Not active"}</dd>
              <dt>Last successful sync</dt><dd>{connection?.lastSyncAt ? `${dateLabel(connection.lastSyncAt, true)} UTC` : "Never synced"}</dd>
              <dt>Import model</dt><dd>Manual, bounded, and deduplicated</dd>
              <dt>Background monitoring</dt><dd>Disabled</dd>
            </dl>
            <div className="action-row">
              {!connected ? (
                <a className="button primary" href="/api/gmail/connect"><PlugZap size={16} />{reconnect ? "Reconnect Gmail" : "Connect Gmail"}</a>
              ) : (
                <>
                  <form action="/api/gmail/import" method="post"><button className="button" type="submit">Import latest 20</button></form>
                  <form action="/api/gmail/sync" method="post"><button className="button primary" type="submit"><RefreshCw size={15} />{connection.hasMore ? "Continue sync" : "Sync now"}</button></form>
                  <form action="/api/gmail/disconnect" method="post"><button className="button" type="submit">Disconnect Gmail</button></form>
                </>
              )}
            </div>
          </section>
          <section className="panel report-section" id="upload">
            <div className="connection-header">
              <span className="provider-icon"><FileUp size={28} /></span>
              <div><h2>Upload an EML message</h2><p>Safe parsing without executing remote content.</p></div>
            </div>
            <form className="upload-form" action="/api/eml/upload" method="post" encType="multipart/form-data">
              <input type="file" name="eml" accept=".eml,message/rfc822" required />
              <button className="button primary" type="submit"><Upload size={16} />Parse and store EML</button>
            </form>
            <p className="section-caption">EML only, maximum 5 MB. The original upload is discarded after safe text and metadata extraction.</p>
          </section>
          <section className="panel report-section">
            <div className="connection-header">
              <span className="provider-icon"><BrainCircuit size={28} /></span>
              <div><h2>AI analysis consent</h2><p>Explicit, reversible, and limited to messages you choose.</p></div>
              <span className={`badge ${aiConfigured && userSettings.analysisEnabled ? "low" : "unknown"}`}>
                {!aiConfigured ? "AI not configured" : userSettings.analysisEnabled ? "Enabled" : "Consent required"}
              </span>
            </div>
            <p>Analysis sends the selected message&apos;s safe text, relevant headers, URL metadata, attachment metadata, and deterministic findings. Tokens, session data, unrelated messages, raw HTML, and attachment bodies are excluded.</p>
            <form className="settings-form" action="/api/analysis/consent" method="post">
              <label className="toggle-row"><input type="checkbox" name="analysisEnabled" defaultChecked={userSettings.analysisEnabled} /> Enable real AI analysis</label>
              <label>Daily message limit <input type="number" name="dailyAnalysisLimit" min="1" max="25" defaultValue={userSettings.dailyAnalysisLimit} /></label>
              <button className="button primary" type="submit">Save analysis settings</button>
            </form>
            <div className="action-row">
              <form action="/api/analysis/batch" method="post"><button className="button" type="submit" disabled={!aiConfigured || !userSettings.analysisEnabled}>Analyze all unprocessed emails (max 10)</button></form>
            </div>
          </section>
        </div>
        <aside>
          <section className="panel report-section usage-card" id="usage">
            <BarChart3 size={28} />
            <h2>Analysis usage</h2>
            <dl className="settings-meta usage-list">
              <dt>Today</dt><dd>{usage.daily.analyzedMessages} / {userSettings.dailyAnalysisLimit} messages</dd>
              <dt>All time</dt><dd>{usage.total.analyzedMessages} model calls</dd>
              <dt>Tokens</dt><dd>{(usage.total.inputTokens + usage.total.outputTokens).toLocaleString()}</dd>
              <dt>Estimated cost</dt><dd>${(usage.total.estimatedCostMicros / 1_000_000).toFixed(4)}</dd>
            </dl>
            <p className="section-caption">Cost is an estimate, not a billing record.</p>
          </section>
          <section className="panel report-section roadmap">
            <ShieldCheck size={28} />
            <h2>Privacy by design</h2>
            <ul>
              <li>One Gmail connection per signed-in user</li>
              <li>Read-only Gmail access and manual sync</li>
              <li>30-day email and report retention</li>
              <li>No background mailbox monitoring</li>
            </ul>
          </section>
        </aside>
      </div>
      <section className="data-controls real-data-controls">
        <article className="panel report-section"><Clock3 /><h2>Retention and cleanup</h2><p>Emails and dependent reports expire after 30 days. Physical cleanup remains an explicit protected operation.</p></article>
        <article className="panel report-section danger-zone"><Trash2 /><h2>Delete stored emails</h2><p>Removes imported messages and dependent reports, findings, corrections, notifications, and usage records.</p><form action="/api/data/emails" method="post"><input name="confirmation" aria-label="Type DELETE to confirm" placeholder="Type DELETE" /><button className="button danger" type="submit">Delete stored emails</button></form></article>
        <article className="panel report-section danger-zone"><Trash2 /><h2>Delete account</h2><p>Revokes Gmail access when possible and removes your account and all stored data.</p><form action="/api/account/delete" method="post"><input name="confirmation" aria-label="Type DELETE MY ACCOUNT to confirm" placeholder="Type DELETE MY ACCOUNT" /><button className="button danger" type="submit">Delete account</button></form></article>
      </section>
    </>
  );
}

export function RealWorkspaceClient(props: Props) {
  const [route, setRoute] = useState<WorkspaceRoute>("overview");
  const [notifications, setNotifications] = useState(props.notifications);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const unread = notifications.filter((item) => !item.readAt).length;
  const connected = props.connection?.status === "CONNECTED";
  const initials = props.user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    const update = () => {
      const hash = window.location.hash.slice(1) as WorkspaceRoute;
      setRoute(routeLabels[hash] ? hash : "overview");
      document.getElementById("real-main-content")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  async function markNotifications(id?: string) {
    setNotificationBusy(true);
    setNotificationError("");
    try {
      const response = await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(id ? { id } : { all: true }),
      });
      if (!response.ok) throw new Error("Unable to update notifications.");
      const now = new Date().toISOString();
      setNotifications((items) =>
        items.map((item) =>
          !id || item.id === id ? { ...item, readAt: item.readAt || now } : item,
        ),
      );
    } catch {
      setNotificationError("Notification status could not be saved. Please retry.");
    } finally {
      setNotificationBusy(false);
    }
  }

  return (
    <div className="real-app real-workspace-shell">
      <a className="skip-link" href="#real-main-content">Skip to content</a>
      <aside className="real-sidebar">
        <a className="brand" href="#overview">
          <span className="brand-icon"><ShieldCheck /></span>
          <span>MailShield<span className="brand-ai"> AI</span><small>PRIVATE SECURITY WORKSPACE</small></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {[
            ["overview", "Overview", LayoutDashboard],
            ["emails", "All emails", Mail],
            ["notifications", "Notifications", Bell],
            ["settings", "Connection & settings", Settings],
          ].map(([id, label, Icon]) => {
            const NavIcon = Icon as typeof Mail;
            return (
              <a key={String(id)} href={`#${id}`} className={route === id ? "active" : ""} aria-current={route === id ? "page" : undefined}>
                <NavIcon size={19} /><span>{String(label)}</span>
                {id === "notifications" && unread > 0 && <span className="nav-count">{unread}</span>}
              </a>
            );
          })}
        </nav>
        <div className="real-profile">
          <span className="avatar">{initials || "MS"}</span>
          <div><strong>{props.user.name}</strong><span>{props.user.email}</span></div>
          {props.signOutControl}
        </div>
      </aside>
      <div className="real-shell-main">
        <header className="topbar real-topbar">
          <div className="breadcrumb">Workspace <span>›</span><strong>{routeLabels[route]}</strong></div>
          <div className="top-actions">
            <span className={`demo-pill real-status-pill ${connected ? "connected" : ""}`}><span className="connection-dot connected" />{connected ? "Gmail connected" : "Private workspace"}</span>
            <a href="#notifications" className="bell-button" aria-label={`Notifications, ${unread} unread`}><Bell size={20} />{unread > 0 && <i />}</a>
            <span className="avatar small">{initials || "MS"}</span>
          </div>
        </header>
        <main className="real-main" id="real-main-content" tabIndex={-1}>
          {props.notice && <div className="notice" role="status">{props.notice}</div>}
          {!props.aiConfigured && <div className="notice error" role="status">AI analysis is not configured. Deterministic checks and EML parsing remain available.</div>}
          {props.connection?.lastErrorMessage && <div className="notice error" role="alert">{props.connection.lastErrorMessage}</div>}
          {notificationError && <div className="notice error" role="alert">{notificationError}</div>}
          {route === "overview" ? (
            <Overview emails={props.emails} total={props.total} stats={props.stats} />
          ) : route === "emails" ? (
            <EmailBrowser emails={props.emails} />
          ) : route === "notifications" ? (
            <NotificationsView notifications={notifications} onRead={(id) => markNotifications(id)} onReadAll={() => markNotifications()} busy={notificationBusy} />
          ) : (
            <SettingsView connection={props.connection} userSettings={props.userSettings} aiConfigured={props.aiConfigured} usage={props.usage} />
          )}
        </main>
        <footer>MailShield AI <span>Private workspace · User-initiated analysis</span></footer>
      </div>
    </div>
  );
}
