import { ShieldCheck, Database, KeyRound, ExternalLink } from "lucide-react";
export function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <main className="entry-shell">
      <section className="entry-card setup-card">
        <span className="setup-icon">
          <ShieldCheck />
        </span>
        <p className="eyebrow">PHASE 2 SETUP REQUIRED</p>
        <h1>Connect the server before using real accounts</h1>
        <p>
          The real workspace is implemented, but MailShield will not pretend to
          authenticate or access Gmail without your own server configuration.
        </p>
        <div className="setup-steps">
          <article>
            <Database />
            <div>
              <strong>1. Start PostgreSQL</strong>
              <p>
                Use local PostgreSQL or a free hosted PostgreSQL database, then
                apply the committed Prisma migration.
              </p>
            </div>
          </article>
          <article>
            <KeyRound />
            <div>
              <strong>2. Configure server secrets</strong>
              <p>
                Copy <code>.env.example</code> to <code>.env.local</code> and
                replace placeholders locally. Never paste secrets into chat.
              </p>
            </div>
          </article>
          <article>
            <ExternalLink />
            <div>
              <strong>3. Configure Google Cloud</strong>
              <p>
                Enable Gmail API and add the two callback URLs documented in the
                README.
              </p>
            </div>
          </article>
        </div>
        <div className="missing-config">
          <strong>Missing values</strong>
          <code>{missing.join(", ")}</code>
        </div>
        <div className="action-row">
          <a className="button primary" href="/demo">
            Open fictional demo
          </a>
        </div>
        <p className="section-caption">
          No Gmail data, credentials, or tokens are stored in demo mode.
        </p>
      </section>
    </main>
  );
}
