"use client";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Mail,
  Bell,
  Settings,
  ChevronRight,
  FlaskConical,
  RefreshCw,
  ArrowUpRight,
  LogOut,
} from "lucide-react";
import {
  initialState,
  STORAGE_KEY,
  parseState,
  emailsFor,
  notificationsFor,
  nextSyncEmail,
  completeSync,
  toggleCorrection,
} from "@/lib/state";
import { Dashboard } from "./dashboard";
import { EmailList } from "./email-list";
import { EmailReport } from "./report";
import { Notifications } from "./notifications";
import { SettingsView } from "./settings";
import { useDemoTools } from "./webmcp";
import type { DemoState, Email } from "@/lib/types";

export default function MailShield() {
  const [state, setState] = useState<DemoState>(initialState);
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState("dashboard");
  const [message, setMessage] = useState("");
  const [storageError, setStorageError] = useState("");
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState<Email>();
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // Hydrate the intentionally browser-local fictional demo after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setState(parseState(raw));
    } catch {
      setStorageError(
        "Saved demo data could not be loaded. Default fictional data is shown. Reset demo data to recover.",
      );
    }
    setReady(true);
    const change = () => setRoute(location.hash.slice(1) || "dashboard");
    change();
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Surface a browser storage failure to the user.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStorageError(
          "Browser storage is unavailable. Changes work for this session but will not be saved.",
        );
      }
  }, [state, ready]);
  const emails = emailsFor(state, processing);
  const alerts = notificationsFor(state, processing);
  const unread = alerts.filter((a) => !a.read).length;
  useDemoTools(emails);
  useEffect(() => {
    if (ready) {
      document.getElementById("main-content")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [route, ready]);
  function reset() {
    setState(initialState);
    setProcessing(undefined);
    setStorageError("");
    setMessage(
      "Demo data reset. The original 12 messages and unread notifications have been restored.",
    );
  }
  const correction = (id: string) => setState((s) => toggleCorrection(s, id));
  const view =
    route === "dashboard" ? (
      <Dashboard emails={emails} state={state} />
    ) : route === "emails" ? (
      <EmailList emails={emails} />
    ) : route.startsWith("report/") ? (
      <EmailReport
        email={emails.find((e) => e.id === route.slice(7))}
        corrected={state.correctedIds.includes(route.slice(7))}
        onCorrection={() => correction(route.slice(7))}
      />
    ) : route === "notifications" ? (
      <Notifications
        state={state}
        onRead={(id) =>
          setState((s) => ({ ...s, readIds: [...new Set([...s.readIds, id])] }))
        }
        onReadAll={() =>
          setState((s) => ({ ...s, readIds: alerts.map((a) => a.id) }))
        }
        onPreference={(v) => setState((s) => ({ ...s, emailAlerts: v }))}
      />
    ) : route === "settings" ? (
      <SettingsView
        state={state}
        busy={busy}
        remaining={3 - state.importedCount}
        onConnect={() => {
          setState((s) => ({ ...s, connected: true }));
          setMessage(
            "Fictional inbox connected. No Google authorization occurred.",
          );
        }}
        onDisconnect={() => {
          setState((s) => ({ ...s, connected: false }));
          setMessage("Demo inbox disconnected. No real account was affected.");
        }}
        onSync={sync}
        onReset={reset}
        onPreference={(v) => setState((s) => ({ ...s, emailAlerts: v }))}
      />
    ) : (
      <section className="empty-state panel">
        <h1>Page not found</h1>
        <a className="button" href="#dashboard">
          Back to overview
        </a>
      </section>
    );
  async function sync() {
    if (!state.connected || busy) return;
    const next = nextSyncEmail(state);
    if (!next) {
      setMessage(
        "No new demo emails. All predefined messages are already imported.",
      );
      return;
    }
    setBusy(true);
    setMessage(`Imported “${next.subject}”. Simulated analysis is processing…`);
    setProcessing({ ...next, status: "Processing", report: undefined });
    await new Promise((r) => setTimeout(r, 750));
    setProcessing(undefined);
    setState((s) => completeSync(s));
    setMessage(
      `1 fictional email added. ${next.report && next.report.score >= 40 ? "A new in-app notification is ready." : "No threat notification was created."}`,
    );
    setBusy(false);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="#dashboard" className="brand">
          <span className="brand-icon">
            <ShieldCheck size={27} />
          </span>
          <span>
            MailShield<span className="brand-ai"> AI</span>
            <small>EMAIL SECURITY WORKSPACE</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { id: "dashboard", label: "Overview", Icon: LayoutDashboard },
            { id: "emails", label: "All emails", Icon: Mail },
            { id: "notifications", label: "Notifications", Icon: Bell },
            { id: "settings", label: "Connection & settings", Icon: Settings },
          ].map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={
                route === id || (id === "emails" && route.startsWith("report/"))
                  ? "active"
                  : ""
              }
              aria-current={route === id ? "page" : undefined}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "notifications" && unread > 0 && (
                <span className="nav-count">{unread}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <FlaskConical size={21} />
            <strong>Built for learning.</strong>
            <p>A simulated inbox with transparent threat reports.</p>
            <span>PHASE 01 · UNIVERSITY DEMO</span>
          </div>
          <div className="profile">
            <span className="avatar">AM</span>
            <div>
              <strong>Alex Morgan</strong>
              <small>Personal demo workspace</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>
              {route === "dashboard"
                ? "Overview"
                : route === "emails"
                  ? "All emails"
                  : route === "settings"
                    ? "Settings"
                    : route === "notifications"
                      ? "Notifications"
                      : "Email report"}
            </strong>
          </div>
          <div className="top-actions">
            <span className="demo-pill">
              <FlaskConical size={14} />
              Demo mode
            </span>
            <a
              href="#notifications"
              aria-label={`Notifications, ${unread} unread`}
              className="bell-button"
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </a>
            <span className="avatar small">AM</span>
          </div>
        </header>
        <div className="demo-banner">
          <FlaskConical size={17} />
          <span>
            <strong>Demo mode</strong> — fictional emails and simulated
            analysis. No Gmail access or live security scanning.
          </span>
          <a href="#settings">
            About this demo <ArrowUpRight size={14} />
          </a>
        </div>
        <main id="main-content" tabIndex={-1}>
          <div className="inbox-toolbar">
            <span>
              <span
                className={`connection-dot ${state.connected ? "connected" : ""}`}
              />
              {state.connected
                ? "Demo inbox connected"
                : "Demo inbox disconnected"}
              <span className="toolbar-account">
                {" "}
                · alex.morgan@example.com
              </span>
            </span>
            <button
              className="button"
              onClick={sync}
              disabled={!state.connected || busy}
            >
              <RefreshCw size={15} className={busy ? "spinning" : ""} />
              {busy ? "Simulating analysis…" : "Sync demo emails"}
            </button>
          </div>
          {storageError && (
            <div className="notice error" role="alert">
              {storageError}
            </div>
          )}
          <div role="status" aria-live="polite">
            {message && <div className="notice">{message}</div>}
          </div>
          {!ready ? (
            <section className="empty-state">
              <RefreshCw />
              <h1>Loading your demo workspace…</h1>
            </section>
          ) : !state.connected && route !== "settings" ? (
            <section className="empty-state panel">
              <LogOut size={36} />
              <h1>Your demo inbox is disconnected</h1>
              <p>
                Connect the fictional inbox to explore emails and simulated
                reports.
              </p>
              <a className="button primary" href="#settings">
                Connection & settings
              </a>
            </section>
          ) : (
            view
          )}
        </main>
        <footer>
          MailShield AI <span>Phase 1 · Fictional data only</span>
        </footer>
      </div>
    </div>
  );
}
