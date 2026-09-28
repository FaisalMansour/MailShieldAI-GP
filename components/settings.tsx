import { useRef } from "react";
import {
  Mail,
  Link2,
  Unplug,
  RotateCcw,
  ShieldCheck,
  Info,
} from "lucide-react";
import type { DemoState } from "@/lib/types";
import { DateLabel } from "./ui";
import { AlertPreference } from "./notifications";
export function SettingsView({
  state,
  busy,
  remaining,
  onConnect,
  onDisconnect,
  onSync,
  onReset,
  onPreference,
}: {
  state: DemoState;
  busy: boolean;
  remaining: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  onReset: () => void;
  onPreference: (v: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Connection & settings</h1>
          <p>Explore a connected inbox, without connecting a real account.</p>
        </div>
      </div>
      <div className="settings-grid">
        <div>
          <section className="panel report-section">
            <div className="connection-header">
              <span className="provider-icon">
                <Mail size={28} />
              </span>
              <div>
                <h2>Gmail demo inbox</h2>
                <p>alex.morgan@example.com</p>
              </div>
              <span className={`badge ${state.connected ? "low" : "unknown"}`}>
                {state.connected ? "Demo connected" : "Disconnected"}
              </span>
            </div>
            <p>
              This is Alex Morgan’s fictional personal workspace. Only this
              browser’s demo state is stored. Connecting does not open Google
              authorization or access Gmail.
            </p>
            <dl className="settings-meta">
              <dt>Connection</dt>
              <dd>
                {state.connected
                  ? "Simulated · no Gmail access"
                  : "Disconnected"}
              </dd>
              <dt>Last successful demo sync</dt>
              <dd>
                {state.lastSync ? (
                  <DateLabel value={state.lastSync} />
                ) : (
                  "Never synced"
                )}
              </dd>
              <dt>Predefined messages left</dt>
              <dd>{remaining}</dd>
              <dt>Background monitoring</dt>
              <dd>Not available in Phase 1</dd>
            </dl>
            <div className="action-row">
              {state.connected ? (
                <>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={onSync}
                  >
                    {busy ? "Simulating analysis…" : "Sync demo emails"}
                  </button>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={onDisconnect}
                  >
                    <Unplug size={15} />
                    Disconnect demo inbox
                  </button>
                </>
              ) : (
                <button className="button primary" onClick={onConnect}>
                  <Link2 size={16} />
                  Connect demo inbox
                </button>
              )}
            </div>
            <p className="section-caption">
              Each sync imports the next predefined message, briefly shows
              processing, and never creates duplicates. After all messages are
              imported, sync reports “No new demo emails.”
            </p>
          </section>
          <section className="panel report-section">
            <h2>High-risk email alerts — preview only</h2>
            <AlertPreference
              enabled={state.emailAlerts}
              onChange={onPreference}
            />
          </section>
          <section className="panel report-section">
            <h2>Reset this demo</h2>
            <p>
              Restore the original 12 emails, connected status, unread
              notifications, corrections, and disabled alert preference.
            </p>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => dialog.current?.showModal()}
            >
              <RotateCcw size={15} />
              Reset demo data
            </button>
          </section>
        </div>
        <aside className="panel report-section roadmap">
          <ShieldCheck size={28} />
          <h2>A transparent demo</h2>
          <p>
            Every message and report is fictional. No emails leave this
            workspace, and no real scanning or background monitoring takes
            place.
          </p>
          <hr />
          <h3>Coming in later phases</h3>
          <ul>
            <li>One real Gmail connection per user</li>
            <li>Automatic scanning and custom Gmail warning labels</li>
            <li>A Gmail sidebar add-on linking to full reports</li>
            <li>High-risk alerts delivered with Resend</li>
          </ul>
          <div className="safe-label">
            <Info size={16} />
            None of these integrations is active in Phase 1.
          </div>
        </aside>
      </div>
      <dialog
        ref={dialog}
        className="reset-dialog"
        aria-labelledby="reset-title"
      >
        <h2 id="reset-title">Reset fictional demo data?</h2>
        <p>
          This restores the starting inbox and clears imported messages, read
          states, corrections, and preferences.
        </p>
        <div className="action-row">
          <button
            className="button"
            autoFocus
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => {
              onReset();
              dialog.current?.close();
            }}
          >
            Reset demo
          </button>
        </div>
      </dialog>
    </>
  );
}
