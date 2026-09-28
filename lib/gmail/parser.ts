import { convert } from "html-to-text";
import type { gmail_v1 } from "googleapis";
import type { NormalizedLink } from "../analysis/types";

const BODY_LIMIT = 200_000;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
export interface ParsedGmailMessage {
  gmailMessageId: string;
  gmailThreadId: string | null;
  sender: string | null;
  replyTo: string | null;
  recipients: { to: string[]; cc: string[]; bcc: string[] };
  subject: string | null;
  receivedAt: Date | null;
  plainTextBody: string;
  extractedLinks: NormalizedLink[];
  selectedHeaders: Record<string, string | null>;
  contentTruncated: boolean;
  parseNote: string | null;
  attachments: { fileName: string; mimeType: string; sizeBytes: number }[];
}

export function decodeBase64Url(value: string) {
  return Buffer.from(
    value.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}
function header(
  headers: gmail_v1.Schema$MessagePartHeader[] | null | undefined,
  name: string,
) {
  return (
    headers
      ?.find((item) => item.name?.toLowerCase() === name.toLowerCase())
      ?.value?.trim() || null
  );
}
function addresses(value: string | null) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}
function htmlLinks(html: string) {
  return [
    ...html.matchAll(
      /<a\b[^>]*href\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ].map((match) => ({
    url: match[1],
    visibleText: convert(match[2], { wordwrap: false }).trim().slice(0, 500),
  }));
}
function walk(
  part: gmail_v1.Schema$MessagePart | undefined,
  plain: string[],
  html: string[],
  attachments: ParsedGmailMessage["attachments"],
  notes: string[],
) {
  if (!part) return;
  const mime = (part.mimeType || "").toLowerCase();
  const filename = part.filename?.trim();
  if (filename) {
    attachments.push({
      fileName: filename,
      mimeType: part.mimeType || "application/octet-stream",
      sizeBytes: part.body?.size || 0,
    });
    return;
  }
  if ((mime === "text/plain" || mime === "text/html") && part.body?.data) {
    try {
      const decoded = decodeBase64Url(part.body.data);
      (mime === "text/plain" ? plain : html).push(decoded);
    } catch {
      notes.push(`Could not decode a ${mime} part.`);
    }
  } else if (
    (mime === "text/plain" || mime === "text/html") &&
    part.body?.attachmentId
  ) {
    notes.push(`A ${mime} body part was not downloaded.`);
  }
  for (const child of part.parts || [])
    walk(child, plain, html, attachments, notes);
}
export function parseGmailMessage(
  message: gmail_v1.Schema$Message,
): ParsedGmailMessage {
  if (!message.id) throw new Error("Gmail message has no ID.");
  const plain: string[] = [];
  const html: string[] = [];
  const attachments: ParsedGmailMessage["attachments"] = [];
  const notes: string[] = [];
  walk(message.payload || undefined, plain, html, attachments, notes);
  const rawHtml = html.join("\n");
  let body = plain.join("\n").trim();
  if (!body && rawHtml)
    body = convert(rawHtml, {
      wordwrap: false,
      selectors: [{ selector: "img", format: "skip" }],
    }).trim();
  if (!body) {
    body = "[No supported text body was available.]";
    notes.push("No supported text body was available.");
  }
  const wasLong = body.length > BODY_LIMIT;
  if (wasLong) {
    body = body.slice(0, BODY_LIMIT);
    notes.push("Body text was truncated to 200,000 characters.");
  }
  const headers = message.payload?.headers;
  const dateValue = header(headers, "Date");
  const internal = message.internalDate
    ? new Date(Number(message.internalDate))
    : null;
  const parsedDate = dateValue ? new Date(dateValue) : internal;
  const textLinks: NormalizedLink[] = (body.match(URL_PATTERN) || []).map(
    (url) => ({ url }),
  );
  return {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId || null,
    sender: header(headers, "From"),
    replyTo: header(headers, "Reply-To"),
    recipients: {
      to: addresses(header(headers, "To")),
      cc: addresses(header(headers, "Cc")),
      bcc: addresses(header(headers, "Bcc")),
    },
    subject: header(headers, "Subject"),
    receivedAt:
      parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
    plainTextBody: body,
    extractedLinks: [...textLinks, ...htmlLinks(rawHtml)]
      .filter(
        (item, index, all) =>
          all.findIndex(
            (other) =>
              other.url === item.url && other.visibleText === item.visibleText,
          ) === index,
      )
      .slice(0, 200),
    selectedHeaders: {
      authenticationResults: header(headers, "Authentication-Results"),
      messageId: header(headers, "Message-ID"),
      returnPath: header(headers, "Return-Path"),
    },
    contentTruncated: wasLong || notes.length > 0,
    parseNote: notes.length ? notes.join(" ") : null,
    attachments,
  };
}
