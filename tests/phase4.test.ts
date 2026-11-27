import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePush,
  desiredLabel,
  hasModifyScope,
  labelChanges,
  newerHistory,
  notificationDisposition,
  addedMessageIds,
  recoveryDue,
  resolveMailShieldLabels,
  watchNeedsRenewal,
} from "../lib/gmail/monitor-core";
import { verifyPushAuth } from "../lib/gmail/push-auth";

const subscription = "projects/demo/subscriptions/mailshield";
function wrapped(payload: unknown, messageId = "123") {
  return {
    subscription,
    message: {
      messageId,
      data: Buffer.from(JSON.stringify(payload)).toString("base64url"),
    },
  };
}

test("Pub/Sub payload validates subscription, mailbox, history, and duplicate ID format", () => {
  assert.deepEqual(
    decodePush(
      wrapped({ emailAddress: "STUDENT@example.com", historyId: "42" }),
      subscription,
    ),
    { pubsubId: "123", mailbox: "student@example.com", historyId: "42" },
  );
  assert.throws(() =>
    decodePush(wrapped({ emailAddress: "bad", historyId: "42" }), subscription),
  );
  assert.throws(() =>
    decodePush(
      wrapped({ emailAddress: "a@example.com", historyId: "-1" }),
      subscription,
    ),
  );
  assert.throws(() =>
    decodePush(
      wrapped({ emailAddress: "a@example.com", historyId: "42" }),
      "wrong",
    ),
  );
  assert.throws(() =>
    decodePush(
      { subscription, message: { messageId: "123", data: "***" } },
      subscription,
    ),
  );
});

test("history comparison ignores out-of-order and duplicate notifications", () => {
  assert.equal(newerHistory("100", "99"), true);
  assert.equal(newerHistory("99", "100"), false);
  assert.equal(newerHistory("100", "100"), false);
  assert.equal(newerHistory("99999999999999999999", "100"), true);
});

test("notification receipts skip duplicates, old history, and exhausted retries", () => {
  assert.equal(
    notificationDisposition("COMPLETED", 1, "20", "10", false),
    "DUPLICATE",
  );
  assert.equal(
    notificationDisposition("FAILED", 5, "20", "10", false),
    "RETRY_EXHAUSTED",
  );
  assert.equal(notificationDisposition("RECEIVED", 0, "9", "10", false), "OLD");
  assert.equal(notificationDisposition("RECEIVED", 0, "9", "10", true), "SYNC");
  assert.equal(
    notificationDisposition("RECEIVED", 0, "11", "10", false),
    "SYNC",
  );
});

test("history import selects only messageAdded entries and deduplicates pages", () => {
  assert.deepEqual(
    addedMessageIds([
      {
        messagesAdded: [
          { message: { id: "new-1" } },
          { message: { id: "new-2" } },
        ],
      },
      { messagesAdded: [{ message: { id: "new-1" } }] },
      {},
    ]),
    ["new-1", "new-2"],
  );
});

test("daily watch renewal and scheduled continuation use bounded times", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  assert.equal(watchNeedsRenewal(new Date("2026-10-01T12:00:00Z"), now), true);
  assert.equal(watchNeedsRenewal(new Date("2026-10-04T12:00:00Z"), now), false);
  assert.equal(
    recoveryDue(new Date("2026-09-30T11:40:00Z"), 15, false, now),
    true,
  );
  assert.equal(
    recoveryDue(new Date("2026-09-30T11:55:00Z"), 15, false, now),
    false,
  );
  assert.equal(
    recoveryDue(new Date("2026-09-30T11:55:00Z"), 15, true, now),
    true,
  );
});

test("MailShield labels reuse existing user labels and create only missing labels", async () => {
  const labels = [
    { id: "medium", name: "MailShield - Medium Risk", type: "user" },
  ];
  const created: string[] = [];
  const result = await resolveMailShieldLabels(
    async () => labels,
    async (name) => {
      created.push(name);
      return "high";
    },
  );
  assert.deepEqual(result, { mediumLabelId: "medium", highLabelId: "high" });
  assert.deepEqual(created, ["MailShield - High Risk"]);
});

test("only Gmail modify enables labels and correction removes only MailShield labels", () => {
  assert.equal(
    hasModifyScope("https://www.googleapis.com/auth/gmail.readonly"),
    false,
  );
  assert.equal(
    hasModifyScope(
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify",
    ),
    true,
  );
  assert.equal(desiredLabel("LOW", false), null);
  assert.equal(desiredLabel("MEDIUM", false), "MEDIUM");
  assert.equal(desiredLabel("HIGH", false), "HIGH");
  assert.equal(desiredLabel("HIGH", true), null);
  assert.deepEqual(
    labelChanges(["INBOX", "user-other", "medium"], "medium", "high", "high"),
    { addLabelIds: ["high"], removeLabelIds: ["medium"] },
  );
  assert.deepEqual(
    labelChanges(["INBOX", "user-other", "high"], "medium", "high", null),
    { addLabelIds: [], removeLabelIds: ["high"] },
  );
});

test("authenticated push validates signed audience, issuer, and service identity", async () => {
  const makeVerify = (payload: Record<string, unknown>) => async () => ({
    getPayload: () => payload,
  });
  const base = {
    email: "push@demo.iam.gserviceaccount.com",
    email_verified: true,
    iss: "https://accounts.google.com",
  };
  await assert.doesNotReject(
    verifyPushAuth(
      "Bearer mock.token",
      "https://demo.example/api/gmail/pubsub",
      base.email,
      makeVerify(base) as never,
    ),
  );
  await assert.rejects(
    verifyPushAuth(
      null,
      "https://demo.example/api/gmail/pubsub",
      base.email,
      makeVerify(base) as never,
    ),
  );
  await assert.rejects(
    verifyPushAuth(
      "Bearer mock.token",
      "https://demo.example/api/gmail/pubsub",
      base.email,
      makeVerify({ ...base, email: "other@example.com" }) as never,
    ),
  );
  await assert.rejects(
    verifyPushAuth(
      "Bearer mock.token",
      "https://demo.example/api/gmail/pubsub",
      base.email,
      makeVerify({ ...base, iss: "https://attacker.example" }) as never,
    ),
  );
});
