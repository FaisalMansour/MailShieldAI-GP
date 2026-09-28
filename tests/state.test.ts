import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  completeSync,
  emailsFor,
  notificationsFor,
  statsFor,
  filterEmails,
  parseState,
  severity,
  nextSyncEmail,
  toggleCorrection,
  DEMO_THRESHOLDS,
} from "../lib/state";
import { demoEmails, syncQueue } from "../lib/demo-data";

test("counts and deterministic syncs share one dataset without duplicates", () => {
  assert.deepEqual(statsFor(emailsFor(initialState), initialState), {
    total: 12,
    analyzed: 10,
    flagged: 6,
    pending: 1,
    failed: 1,
  });
  let state = initialState;
  for (const expected of syncQueue) {
    assert.equal(nextSyncEmail(state)?.id, expected.id);
    state = completeSync(state);
  }
  assert.equal(emailsFor(state).length, 15);
  assert.equal(new Set(emailsFor(state).map((e) => e.id)).size, 15);
  assert.deepEqual(completeSync(state), state);
  assert.equal(nextSyncEmail(state), undefined);
  assert.equal(emailsFor({ ...state, connected: false }).length, 0);
});
test("thresholds, search, filters, and non-scored states are honest", () => {
  assert.deepEqual(DEMO_THRESHOLDS, {
    Low: [0, 39],
    Medium: [40, 69],
    High: [70, 100],
  });
  const f = {
    search: "",
    severity: "All",
    category: "All",
    status: "All",
    sort: "newest",
  };
  assert.equal(filterEmails(demoEmails, { ...f, search: "MAYA" }).length, 1);
  assert.equal(
    filterEmails(demoEmails, {
      ...f,
      severity: "High",
      category: "Phishing",
      status: "Analyzed",
    }).length,
    1,
  );
  assert.equal(
    filterEmails(demoEmails, { ...f, status: "Analysis failed" })[0].id,
    "email-12",
  );
  assert.equal(
    filterEmails(demoEmails, { ...f, sort: "risk" })[0].report?.score,
    94,
  );
  for (const e of demoEmails.filter((e) => e.status !== "Analyzed")) {
    assert.equal(e.report, undefined);
    assert.equal(severity(e), undefined);
  }
});
test("report evidence exists verbatim and all links use reserved domains", () => {
  for (const e of [...demoEmails, ...syncQueue]) {
    assert.ok(
      e.sender.endsWith(".example") || e.sender.endsWith("@example.com"),
    );
    for (const evidence of e.report?.evidence ?? [])
      assert.ok(e.body.includes(evidence.observed), e.id);
    for (const link of e.links)
      assert.ok(new URL(link).hostname.endsWith(".example"));
    assert.ok(!e.report || (e.report.score >= 0 && e.report.score <= 100));
  }
  assert.match(
    demoEmails.find((e) => e.id === "email-8")!.report!.mechanism,
    /untrusted evidence/,
  );
});
test("notifications, corrections, serialization, and reset stay consistent", () => {
  assert.equal(notificationsFor(initialState).length, 6);
  const corrected = toggleCorrection(initialState, "email-1");
  assert.ok(corrected.correctedIds.includes("email-1"));
  assert.ok(corrected.readIds.includes("alert-email-1"));
  assert.equal(statsFor(emailsFor(corrected), corrected).flagged, 5);
  assert.equal(
    notificationsFor(corrected).find((n) => n.email.id === "email-1")
      ?.corrected,
    true,
  );
  assert.deepEqual(toggleCorrection(corrected, "email-1").correctedIds, []);
  const saved = parseState(JSON.stringify(corrected));
  assert.deepEqual(saved, corrected);
  assert.throws(() => parseState("{broken"));
  assert.throws(() => parseState('{"version":1}'));
});
