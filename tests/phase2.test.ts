import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sealWithKey, openWithKey } from "../lib/crypto-core";
import {
  assertMailboxMatches,
  assertOwner,
  OwnershipError,
  requireSameOrigin,
} from "../lib/authorization";
import { parseGmailMessage } from "../lib/gmail/parser";
import { cursorAfterPage, uniqueMessageIds } from "../lib/gmail/sync-core";
import {
  disconnectedCredentialState,
  validDeletionConfirmation,
} from "../lib/data-controls";

function encoded(value: string) {
  return Buffer.from(value).toString("base64url");
}

test("AES-GCM token encryption round-trips and rejects tampering", () => {
  const key = randomBytes(32);
  const sealed = sealWithKey("refresh-token-value", key);
  assert.notEqual(sealed, "refresh-token-value");
  assert.equal(openWithKey(sealed, key), "refresh-token-value");
  const [version, iv, tag, payload] = sealed.split(".");
  const tagBytes = Buffer.from(tag, "base64url");
  tagBytes[0] ^= 1;
  const tampered = [version, iv, tagBytes.toString("base64url"), payload].join(
    ".",
  );
  assert.throws(() => openWithKey(tampered, key));
});

test("ownership and OAuth mailbox binding reject cross-user access", () => {
  assert.doesNotThrow(() => assertOwner("user-a", "user-a"));
  assert.throws(() => assertOwner("user-a", "user-b"), OwnershipError);
  assert.doesNotThrow(() =>
    assertMailboxMatches("Student@Example.com", "student@example.com"),
  );
  assert.throws(
    () => assertMailboxMatches("one@example.com", "two@example.com"),
    /MAILBOX_MISMATCH/,
  );
});

test("mutation origin checks use the configured public origin", () => {
  const request = new Request("http://localhost:3000/api/gmail/sync", {
    headers: { origin: "http://127.0.0.1:3000" },
  });
  assert.doesNotThrow(() =>
    requireSameOrigin(request, "http://127.0.0.1:3000"),
  );
  assert.throws(
    () => requireSameOrigin(request, "http://localhost:3000"),
    /INVALID_ORIGIN/,
  );
});

test("nested Gmail MIME parsing prefers plain text and stores attachment metadata only", () => {
  const parsed = parseGmailMessage({
    id: "m-1",
    threadId: "t-1",
    internalDate: "1700000000000",
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: "Sender <sender@example.com>" },
        { name: "To", value: "student@example.com" },
        { name: "Subject", value: "Nested test" },
        { name: "Authentication-Results", value: "mx.example; spf=pass" },
      ],
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [
            {
              mimeType: "text/plain",
              body: {
                data: encoded("Hello. Review https://safe.example/path"),
              },
            },
            {
              mimeType: "text/html",
              body: {
                data: encoded(
                  '<p>HTML copy <a href="https://html.example/read">read</a></p>',
                ),
              },
            },
          ],
        },
        {
          mimeType: "application/pdf",
          filename: "notes.pdf",
          body: { attachmentId: "a-1", size: 1234 },
        },
      ],
    },
  });
  assert.equal(parsed.plainTextBody, "Hello. Review https://safe.example/path");
  assert.deepEqual(parsed.extractedLinks, [
    { url: "https://safe.example/path" },
    { url: "https://html.example/read", visibleText: "read" },
  ]);
  assert.deepEqual(parsed.attachments, [
    { fileName: "notes.pdf", mimeType: "application/pdf", sizeBytes: 1234 },
  ]);
  assert.equal(
    parsed.selectedHeaders.authenticationResults,
    "mx.example; spf=pass",
  );
});

test("duplicate IDs and cursor transitions are retry-safe", () => {
  assert.deepEqual(uniqueMessageIds(["m1", "m1", "", "m2"]), ["m1", "m2"]);
  assert.deepEqual(
    cursorAfterPage("100", { historyId: "200", nextPageToken: "next" }, true),
    { historyId: "100", continuationPageToken: "next" },
  );
  assert.deepEqual(cursorAfterPage("100", { historyId: "200" }, true), {
    historyId: "200",
    continuationPageToken: null,
  });
  assert.deepEqual(cursorAfterPage("100", { historyId: "200" }, false), {
    historyId: "100",
    continuationPageToken: null,
  });
});

test("disconnect removes credentials while deletion controls require exact confirmation", () => {
  const state = disconnectedCredentialState();
  assert.equal(state.accessTokenEncrypted, null);
  assert.equal(state.refreshTokenEncrypted, null);
  assert.equal(state.status, "DISCONNECTED");
  assert.equal(validDeletionConfirmation("DELETE"), true);
  assert.equal(validDeletionConfirmation("delete"), false);
  assert.equal(validDeletionConfirmation("DELETE MY ACCOUNT", true), true);
});
