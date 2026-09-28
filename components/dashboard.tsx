import {
  ArrowUpRight,
  Mail,
  ScanLine,
  ShieldAlert,
  Clock3,
  Info,
} from "lucide-react";
import { severity, statsFor, isFlagged, DEMO_THRESHOLDS } from "@/lib/state";
import type { DemoState, Email } from "@/lib/types";
import { EmailTable } from "./ui";
export function Dashboard({
  emails,
  state,
}: {
  emails: Email[];
  state: DemoState;
}) {
  const stats = statsFor(emails, state);
  const days = ["21", "22", "23", "24", "25"];
  const counts = days.map((day) =>
    emails.filter((e) => e.receivedAt.slice(8, 10) === day),
  );
  const high = emails.filter((e) => severity(e) === "High").length;
  const medium = emails.filter((e) => severity(e) === "Medium").length;
  const low = emails.filter((e) => severity(e) === "Low").length;
  const unassessed = emails.length - high - medium - low;
  const max = Math.max(4, ...counts.map((c) => c.length));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR EMAIL WORKSPACE</p>
          <h1>Inbox overview</h1>
          <p>A clearer view of what needs your attention.</p>
        </div>
        <span className="date-range">21–25 September 2026 · Demo</span>
      </div>
      <div className="metrics">
        {[
          {
            title: "Total emails",
            value: stats.total,
            sub: "In your demo inbox",
            Icon: Mail,
          },
          {
            title: "Analyzed emails",
            value: stats.analyzed,
            sub: "Simulated reports available",
            Icon: ScanLine,
          },
          {
            title: "Flagged emails",
            value: stats.flagged,
            sub: "Recommended for review",
            Icon: ShieldAlert,
          },
          {
            title: "Awaiting analysis",
            value: stats.pending,
            sub: `${stats.failed} additional analysis failed`,
            Icon: Clock3,
          },
        ].map(({ title, value, sub, Icon }, i) => (
          <div className={`metric metric-${i}`} key={title}>
            <div className="metric-top">
              <span>{title}</span>
              <Icon size={20} />
            </div>
            <strong>{value.toString().padStart(2, "0")}</strong>
            <span className="muted">{sub}</span>
          </div>
        ))}
      </div>
      <div className="charts">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Email activity</h2>
              <p>Messages received in the demo period</p>
            </div>
            <span className="legend">
              <i />
              Received <i className="flagged-dot" />
              Flagged
            </span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={counts
              .map(
                (es, i) =>
                  `${days[i]} September: ${es.length} received, ${es.filter((e) => isFlagged(e, state)).length} flagged`,
              )
              .join("; ")}
          >
            {counts.map((es, i) => (
              <div className="bar-group" key={days[i]}>
                <div className="bar-space">
                  <span
                    className="bar received"
                    style={{ height: `${(es.length / max) * 100}%` }}
                  >
                    <b>{es.length}</b>
                  </span>
                  <span
                    className="bar flagged"
                    style={{
                      height: `${(es.filter((e) => isFlagged(e, state)).length / max) * 100}%`,
                    }}
                  />
                </div>
                <span>{days[i]} Sep</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Threat severity</h2>
              <p>
                Provisional demo thresholds: Low {DEMO_THRESHOLDS.Low[0]}–
                {DEMO_THRESHOLDS.Low[1]}, Medium {DEMO_THRESHOLDS.Medium[0]}–
                {DEMO_THRESHOLDS.Medium[1]}, High {DEMO_THRESHOLDS.High[0]}–
                {DEMO_THRESHOLDS.High[1]}
              </p>
            </div>
          </div>
          <div className="severity-chart">
            <div
              className="donut"
              style={{
                background: emails.length
                  ? `conic-gradient(#df685b 0 ${(high / emails.length) * 100}%, #e9b75f ${(high / emails.length) * 100}% ${((high + medium) / emails.length) * 100}%, #2e8bce ${((high + medium) / emails.length) * 100}% ${((high + medium + low) / emails.length) * 100}%, #dfe5ec ${((high + medium + low) / emails.length) * 100}% 100%)`
                  : "#dfe5ec",
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
                ["High risk", high, "#df685b"],
                ["Medium risk", medium, "#e9b75f"],
                ["Low risk", low, "#2e8bce"],
                ["Unassessed", unassessed, "#dfe5ec"],
              ].map(([label, n, color]) => (
                <div key={label}>
                  <i style={{ background: String(color) }} />
                  <span>{label}</span>
                  <b>{n}</b>
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
              Needs your attention{" "}
              <span className="count">{stats.flagged}</span>
            </h2>
            <p>Recent suspicious emails, with evidence you can inspect.</p>
          </div>
          <a className="text-link" href="#emails">
            View all emails <ArrowUpRight size={16} />
          </a>
        </div>
        {stats.flagged ? (
          <EmailTable
            emails={emails.filter((e) => isFlagged(e, state)).slice(0, 5)}
          />
        ) : (
          <div className="empty-state">
            <h2>No emails need review</h2>
            <p>Medium- and high-risk demo results will appear here.</p>
          </div>
        )}
      </section>
      <p className="footnote">
        <Info size={15} /> Thresholds are provisional and must be evaluated in
        Phase 3. Scores are not verified probabilities.
      </p>
    </>
  );
}
