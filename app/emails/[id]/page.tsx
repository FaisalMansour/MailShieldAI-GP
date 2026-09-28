import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Paperclip,
  Link2,
  ShieldAlert,
  BrainCircuit,
  Trash2,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { normalizeStoredLinks, type AnalysisEmail } from "@/lib/analysis/types";
import { runDeterministicChecks } from "@/lib/analysis/deterministic";
import Link from "next/link";
import { analysisProviderConfigured } from "@/lib/analysis/provider-config";

export const dynamic = "force-dynamic";

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default async function RealEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await auth();
  if (!session?.user.id) redirect("/");
  const { id } = await params;
  const [email, user] = await Promise.all([
    prisma.storedEmail.findFirst({
      where: { id, userId: session.user.id, expiresAt: { gt: new Date() } },
      include: {
        attachments: true,
        reports: {
          orderBy: { version: "desc" },
          include: {
            evidence: true,
            findings: true,
            corrections: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { analysisEnabled: true },
    }),
  ]);
  if (!email) notFound();
  const recipients = email.recipients as {
    to?: string[];
    cc?: string[];
    bcc?: string[];
  };
  const links = normalizeStoredLinks(email.extractedLinks);
  const headers = email.selectedHeaders as Record<string, string | null>;
  const normalized: AnalysisEmail = {
    sender: email.sender,
    replyTo: email.replyTo,
    subject: email.subject,
    body: email.plainTextBody,
    links,
    attachments: email.attachments.map((item) => ({
      fileName: item.fileName,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
    })),
    headers,
  };
  const deterministic = runDeterministicChecks(normalized);
  const report = email.reports[0];
  const displayedFindings = report?.findings || deterministic.findings;
  const correction = report?.corrections.find((item) => !item.revertedAt);
  const notice = (await searchParams).notice;
  const statusLabel = email.processingStatus.replaceAll("_", " ").toLowerCase();
  const aiConfigured = analysisProviderConfigured();
  return (
    <main className="email-detail-shell">
      <Link className="back-link" href="/#emails">
        <ArrowLeft size={16} />
        All emails
      </Link>
      <div className="page-heading report-heading">
        <div>
          <p className="eyebrow">
            {email.source === "EML_UPLOAD" ? "EML UPLOAD" : "REAL GMAIL IMPORT"}{" "}
            · PHASE 3
          </p>
          <h1>{email.subject || "(No subject)"}</h1>
          <p>
            {email.receivedAt?.toLocaleString("en-GB", { timeZone: "UTC" }) ||
              "Received time unavailable"}{" "}
            UTC
          </p>
        </div>
        {report ? (
          <span className={`badge ${report.severity.toLowerCase()}`}>
            {report.finalScore} / 100 · {report.severity}
          </span>
        ) : (
          <span className="badge unknown">{statusLabel}</span>
        )}
      </div>
      {notice === "analysis-complete" && (
        <div className="notice" role="status">
          Analysis completed and version {report?.version} was stored.
        </div>
      )}
      {notice === "correction-saved" && (
        <div className="notice" role="status">
          Marked as not a threat. The original report remains unchanged.
        </div>
      )}
      {notice === "correction-undone" && (
        <div className="notice" role="status">
          The user correction was undone.
        </div>
      )}
      {email.contentTruncated && (
        <div className="notice error">
          This message was only partially stored. {email.parseNote}
        </div>
      )}

      <div className="action-row report-actions">
        {!report ? (
          <form action={`/api/analysis/${email.id}`} method="post">
            <button
              className="button primary"
              type="submit"
              disabled={!user?.analysisEnabled || !aiConfigured}
            >
              <BrainCircuit size={16} />
              {email.processingStatus === "FAILED"
                ? "Retry analysis"
                : "Analyze email"}
            </button>
          </form>
        ) : (
          <form action={`/api/analysis/${email.id}`} method="post">
            <input type="hidden" name="mode" value="reanalyze" />
            <button
              className="button"
              type="submit"
              disabled={!user?.analysisEnabled || !aiConfigured}
            >
              Reanalyze with current version
            </button>
          </form>
        )}
        {report && (
          <>
            <form action={`/api/reports/${report.id}/correction`} method="post">
              <button className="button" type="submit">
                {correction
                  ? "Undo not-a-threat correction"
                  : "Mark as not a threat"}
              </button>
            </form>
            <form action={`/api/reports/${report.id}/delete`} method="post">
              <button className="button danger" type="submit">
                <Trash2 size={15} />
                Delete stored report
              </button>
            </form>
          </>
        )}
        {email.source === "EML_UPLOAD" && (
          <form action={`/api/eml/${email.id}/delete`} method="post">
            <button className="button danger" type="submit">
              <Trash2 size={15} />
              Delete uploaded email
            </button>
          </form>
        )}
      </div>
      {!aiConfigured && (
        <div className="notice error">
          AI analysis is not configured. The deterministic findings below are
          available without an API call.
        </div>
      )}
      {!user?.analysisEnabled && (
        <div className="notice error">
          Enable explicit AI analysis consent on the workspace before analyzing
          this message.
        </div>
      )}
      {correction && (
        <div className="notice">
          User correction: marked as not a threat. This annotation does not
          overwrite the original report and did not retrain the model.
        </div>
      )}

      {report && (
        <>
          <section className="panel report-section report-overview">
            <div className="report-topline">
              <div>
                <p className="eyebrow">STORED ANALYSIS REPORT</p>
                <h2>{report.classification.replaceAll("_", " ")}</h2>
              </div>
              <span className={`badge ${report.severity.toLowerCase()}`}>
                {report.severity}
              </span>
            </div>
            <p>{report.overview}</p>
            <dl className="metadata">
              <dt>Confidence</dt>
              <dd>{report.confidence}</dd>
              <dt>AI assessment</dt>
              <dd>{report.aiScore} / 100</dd>
              <dt>Deterministic contribution</dt>
              <dd>{report.deterministicContribution} points</dd>
              <dt>Final displayed score</dt>
              <dd>{report.finalScore} / 100</dd>
              <dt>Status</dt>
              <dd>
                {report.humanReviewRecommended
                  ? "Human review recommended"
                  : "Completed"}
              </dd>
              <dt>Report history</dt>
              <dd>
                Version {report.version} of {email.reports.length}
              </dd>
            </dl>
            <p className="section-caption">
              The score is an estimated risk indicator, not a verified
              probability or guarantee of safety.
            </p>
          </section>
          <div className="report-grid">
            <div>
              <section className="panel report-section">
                <h2>Observed evidence</h2>
                {report.evidence.length ? (
                  report.evidence.map((item) => (
                    <div className="evidence-card" key={item.id}>
                      <strong>
                        {item.source.replaceAll("_", " ")} · {item.label}
                      </strong>
                      <code className="url-text">{item.exactValue}</code>
                    </div>
                  ))
                ) : (
                  <p>No evidence items were returned.</p>
                )}
              </section>
              <section className="panel report-section">
                <h2>AI interpretations</h2>
                {stringList(report.interpretations).map((item) => (
                  <p key={item}>• {item}</p>
                ))}
                <h3>Possible attack method</h3>
                <p>{report.attackMethod}</p>
              </section>
              <section className="panel report-section">
                <h2>Suspicious locations</h2>
                {stringList(report.suspiciousLocations).length ? (
                  stringList(report.suspiciousLocations).map((item) => (
                    <p key={item}>• {item}</p>
                  ))
                ) : (
                  <p>No specific suspicious location was identified.</p>
                )}
              </section>
            </div>
            <div>
              <section className="panel report-section">
                <h2>Recommended actions</h2>
                {stringList(report.recommendedActions).map((item) => (
                  <p key={item}>• {item}</p>
                ))}
              </section>
              <section className="panel report-section limitations">
                <h2>Limitations</h2>
                {stringList(report.limitations).map((item) => (
                  <p key={item}>• {item}</p>
                ))}
              </section>
              <section className="panel report-section">
                <h2>Technical details</h2>
                <dl className="metadata">
                  <dt>Model</dt>
                  <dd>{report.modelIdentifier}</dd>
                  <dt>Prompt</dt>
                  <dd>{report.promptVersion}</dd>
                  <dt>Checks</dt>
                  <dd>{report.checkVersion}</dd>
                  <dt>Scoring</dt>
                  <dd>{report.scoringVersion}</dd>
                  <dt>Analyzed</dt>
                  <dd>
                    {report.analyzedAt.toLocaleString("en-GB", {
                      timeZone: "UTC",
                    })}{" "}
                    UTC
                  </dd>
                  <dt>Token usage</dt>
                  <dd>
                    {report.inputTokens ?? "Unknown"} input ·{" "}
                    {report.outputTokens ?? "Unknown"} output
                  </dd>
                </dl>
              </section>
            </div>
          </div>
        </>
      )}

      <div className="report-grid">
        <div>
          <section className="panel report-section">
            <h2>Message details</h2>
            <dl className="metadata">
              <dt>From</dt>
              <dd>{email.sender || "Unknown"}</dd>
              <dt>Reply-to</dt>
              <dd>{email.replyTo || "Not provided"}</dd>
              <dt>To</dt>
              <dd>{recipients.to?.join(", ") || "Not provided"}</dd>
              <dt>Cc</dt>
              <dd>{recipients.cc?.join(", ") || "None"}</dd>
              <dt>Subject</dt>
              <dd>{email.subject || "(No subject)"}</dd>
            </dl>
            <div className="safe-label">
              <ShieldAlert size={14} />
              Server-converted plain text · remote content never loaded
            </div>
            <pre className="email-body">{email.plainTextBody}</pre>
          </section>
        </div>
        <div>
          <section className="panel report-section">
            <h2>Deterministic security findings</h2>
            <p className="section-caption">
              Explainable local checks, version{" "}
              {report?.checkVersion || "checks-1.0.0"}. These do not require the
              AI provider.
            </p>
            {displayedFindings.length ? (
              displayedFindings.map((item, index) => (
                <div className="evidence-card" key={`${item.checkId}-${index}`}>
                  <span className={`badge ${item.severity.toLowerCase()}`}>
                    {item.severity}
                  </span>
                  <strong>{item.checkId}</strong>
                  <p>{item.explanation}</p>
                  <code className="url-text">{item.supportingValue}</code>
                  <small>Source: {item.sourceField}</small>
                </div>
              ))
            ) : (
              <p>
                No deterministic indicator fired. This is not a guarantee that
                the message is safe.
              </p>
            )}
          </section>
          <section className="panel report-section">
            <h2>
              <Link2 size={18} /> Extracted URLs and hosts
            </h2>
            <p className="section-caption">
              Non-clickable text. MailShield did not visit these destinations.
            </p>
            {links.length ? (
              links.map((link, index) => (
                <div className="evidence-card" key={`${link.url}-${index}`}>
                  <code className="url-text">{link.url}</code>
                  {link.visibleText && (
                    <small>Visible text: {link.visibleText}</small>
                  )}
                </div>
              ))
            ) : (
              <p>No URLs extracted.</p>
            )}
            <h3>Hostnames</h3>
            {deterministic.urlHostnames.length ? (
              deterministic.urlHostnames.map((host) => (
                <code className="url-text" key={host}>
                  {host}
                </code>
              ))
            ) : (
              <p>None.</p>
            )}
            <h2 className="section-gap">
              <Paperclip size={18} /> Attachment metadata
            </h2>
            {email.attachments.length ? (
              email.attachments.map((item) => (
                <div className="attachment" key={item.id}>
                  <Paperclip size={18} />
                  <div>
                    <strong>{item.fileName}</strong>
                    <small>
                      {item.mimeType} · {item.sizeBytes.toLocaleString()} bytes
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p>No attachments.</p>
            )}
            <p className="section-caption">
              Attachment contents were not stored, opened, executed, or
              malware-scanned.
            </p>
          </section>
          <section className="panel report-section">
            <h2>Authentication-result evidence</h2>
            <dl className="metadata">
              <dt>SPF</dt>
              <dd>{deterministic.authentication.spf}</dd>
              <dt>DKIM</dt>
              <dd>{deterministic.authentication.dkim}</dd>
              <dt>DMARC</dt>
              <dd>{deterministic.authentication.dmarc}</dd>
              <dt>Message-ID</dt>
              <dd>{headers.messageId || "Unknown"}</dd>
              <dt>Return-Path</dt>
              <dd>{headers.returnPath || "Unknown"}</dd>
            </dl>
            <p className="section-caption">
              {deterministic.authentication.trustLimitation}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
