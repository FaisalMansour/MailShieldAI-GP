import {
  ArrowLeft,
  ShieldAlert,
  Info,
  Paperclip,
  Link2,
  FileText,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import type { Email } from "@/lib/types";
import { DateLabel, RiskBadge } from "./ui";

export function EmailReport({
  email,
  corrected,
  onCorrection,
}: {
  email: Email | undefined;
  corrected: boolean;
  onCorrection: () => void;
}) {
  if (!email)
    return (
      <div className="empty-state panel">
        <h1>Report not found</h1>
        <p>This message is not in the connected demo inbox.</p>
        <a className="button" href="#emails">
          Back to all emails
        </a>
      </div>
    );
  const r = email.report;
  return (
    <>
      <a href="#emails" className="back-link">
        <ArrowLeft size={16} />
        All emails
      </a>
      <div className="page-heading report-heading">
        <div>
          <p className="eyebrow">EMAIL DETAILS & THREAT REPORT</p>
          <h1>{email.subject}</h1>
          <p>
            <DateLabel value={email.receivedAt} />
          </p>
        </div>
        <RiskBadge email={email} />
      </div>
      {r && r.score >= 40 && (
        <section className={`correction-card ${corrected ? "corrected" : ""}`}>
          <div>
            <strong>
              {corrected
                ? "User correction recorded"
                : "Simulated Gmail label: MailShield risk label applied"}
            </strong>
            <p>
              {corrected
                ? "Marked as not a threat. The original analysis remains visible, and the simulated Gmail risk label is removed. This feedback does not retrain a model."
                : "If you know this message is legitimate, record a correction separately from the original report."}
            </p>
          </div>
          <button className="button" onClick={onCorrection}>
            {corrected ? (
              <>
                <Undo2 size={16} />
                Undo correction
              </>
            ) : (
              <>Mark as not a threat</>
            )}
          </button>
        </section>
      )}
      <div className="report-grid">
        <div>
          <section className="panel report-section">
            <h2>
              <FileText size={18} />
              Original message
            </h2>
            <dl className="metadata">
              <dt>From</dt>
              <dd>
                {email.senderName} &lt;{email.sender}&gt;
              </dd>
              <dt>Reply-to</dt>
              <dd>{email.replyTo}</dd>
              <dt>To</dt>
              <dd>{email.recipient}</dd>
              <dt>Received</dt>
              <dd>
                <DateLabel value={email.receivedAt} />
              </dd>
              <dt>Subject</dt>
              <dd>{email.subject}</dd>
            </dl>
            <div className="safe-label">
              <ShieldAlert size={14} />
              Plain-text view · remote content never loaded
            </div>
            <pre className="email-body">{email.body}</pre>
          </section>
          <section className="panel report-section">
            <h2>Demo sender authentication</h2>
            <p className="section-caption">
              Fictional header results for interface demonstration. Unknown
              means information is missing, not failed.
            </p>
            <div className="auth-grid">
              {Object.entries(email.authentication).map(([name, result]) => (
                <div key={name}>
                  <span>{name.toUpperCase()}</span>
                  <strong className={`auth-${result.toLowerCase()}`}>
                    {result}
                  </strong>
                </div>
              ))}
            </div>
            <h2 className="section-gap">
              <Link2 size={18} />
              Extracted links
            </h2>
            <p className="section-caption">
              Shown as non-clickable text. Destinations have not been checked.
            </p>
            {email.links.length ? (
              email.links.map((url) => (
                <code className="url-text" key={url}>
                  {url}
                </code>
              ))
            ) : (
              <p>No links in this message.</p>
            )}
            <h2 className="section-gap">
              <Paperclip size={18} />
              Attachment metadata
            </h2>
            {email.attachments.length ? (
              email.attachments.map((a) => (
                <div className="attachment" key={a.name}>
                  <FileText size={20} />
                  <div>
                    <strong>{a.name}</strong>
                    <small>
                      {a.size} · {a.type}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p>No attachments in this message.</p>
            )}
            <p className="section-caption">
              Fictional metadata only. No file contents are included. Metadata
              alone cannot prove malware.
            </p>
          </section>
        </div>
        <div>
          {r ? (
            <>
              <section className="panel report-section risk-summary">
                <div className="report-topline">
                  <h2>Simulated analysis</h2>
                  <span className="demo-pill">Predefined report</span>
                </div>
                <div className="risk-numbers">
                  <div>
                    <span>Estimated risk indicator</span>
                    <strong>
                      {r.score}
                      <small> / 100</small>
                    </strong>
                    <RiskBadge email={email} />
                  </div>
                  <div>
                    <span>Qualitative analysis confidence</span>
                    <strong>
                      {r.confidence}
                      <small>%</small>
                    </strong>
                    <span className="section-caption">Estimate only</span>
                  </div>
                </div>
                <p className="section-caption">
                  Risk is an estimated indicator, not a verified probability.
                  Confidence describes the assessment, not a guarantee of
                  safety.
                </p>
                <div className="report-overview">
                  <h3>
                    {r.score < 40
                      ? "No obvious threat detected"
                      : "Plain-English overview"}
                  </h3>
                  <p>{r.overview}</p>
                </div>
                <h3>
                  {r.score < 40
                    ? "Message category"
                    : "Suspected threat categories"}
                </h3>
                <div className="category-tags">
                  {r.categories.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </section>
              <section className="panel report-section">
                <h2>
                  {r.score < 40
                    ? "Evidence reviewed"
                    : "Why this email was flagged"}
                </h2>
                {r.evidence.map((ev, i) => (
                  <article className="evidence" key={i}>
                    <span className="evidence-label">
                      OBSERVATION · {ev.location}
                    </span>
                    <blockquote>“{ev.observed}”</blockquote>
                    <span className="evidence-label interpretation">
                      INTERPRETATION
                    </span>
                    <p>{ev.interpretation}</p>
                  </article>
                ))}
                <h3>How the suspected attack could work</h3>
                <p>{r.mechanism}</p>
                <h3>Recommended actions</h3>
                <ul className="next-steps">
                  {r.nextSteps.map((step) => (
                    <li key={step}>
                      <CheckCircle2 size={16} />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="panel report-section limitations">
                <h2>
                  <Info size={18} />
                  Limitations & checks not performed
                </h2>
                <ul>
                  {r.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </section>
            </>
          ) : (
            <section className="panel report-section">
              <h2>{email.status}</h2>
              <div className="notice error">
                {email.error ??
                  (email.status === "Processing"
                    ? "Simulated analysis is in progress."
                    : "This fictional message is waiting for analysis. No assessment has been generated.")}
              </div>
              <p>
                No risk score or confidence is available. This status does not
                mean the email is low risk.
              </p>
              <p className="section-caption">
                Running or retrying real analysis is unavailable in Phase 1.
                Resetting demo data restores the same predefined statuses.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
