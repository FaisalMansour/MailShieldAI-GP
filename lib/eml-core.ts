import { createHash } from "node:crypto";
import PostalMime from "postal-mime";
import { convert } from "html-to-text";
import type { NormalizedLink } from "./analysis/types";

export const EML_FILE_SIZE_LIMIT = 5 * 1024 * 1024;
const STORED_BODY_LIMIT = 200_000;
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
type Address =
  | { name: string; address: string; group?: undefined }
  | {
      name: string;
      group: { name: string; address: string }[];
      address?: undefined;
    };

function formatAddress(address?: Address) {
  if (!address || !("address" in address) || !address.address) return null;
  return address.name
    ? `${address.name.replace(/[<>]/g, "")} <${address.address}>`
    : address.address;
}
function flattenAddresses(addresses?: Address[]) {
  return (addresses || []).flatMap((item) =>
    "address" in item && item.address
      ? [formatAddress(item)!]
      : (item.group || []).map((member) => formatAddress(member as Address)!),
  );
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
function byteLength(content: ArrayBuffer | Uint8Array | string) {
  return typeof content === "string"
    ? Buffer.byteLength(content)
    : content.byteLength;
}

export async function parseEml(buffer: Buffer, fileName: string) {
  if (!fileName.toLowerCase().endsWith(".eml"))
    throw new Error("INVALID_EML_FILE");
  if (!buffer.length || buffer.length > EML_FILE_SIZE_LIMIT)
    throw new Error(
      buffer.length > EML_FILE_SIZE_LIMIT
        ? "EML_TOO_LARGE"
        : "INVALID_EML_FILE",
    );
  const beginning = buffer
    .subarray(0, Math.min(buffer.length, 64_000))
    .toString("utf8");
  if (
    !/^(?:from|sender|return-path|subject|date|message-id|mime-version|content-type):/im.test(
      beginning,
    ) ||
    !/\r?\n\r?\n/.test(beginning)
  )
    throw new Error("INVALID_EML_FILE");
  let parsed;
  try {
    parsed = await PostalMime.parse(buffer, {
      maxNestingDepth: 40,
      maxRfc822NestingDepth: 3,
      maxHeadersSize: 512 * 1024,
    });
  } catch {
    throw new Error("INVALID_EML_FILE");
  }
  const rawHtml = parsed.html || "";
  let body = (parsed.text || "").trim();
  if (!body && rawHtml)
    body = convert(rawHtml, {
      wordwrap: false,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
      ],
    }).trim();
  if (!body) body = "[No supported text body was available.]";
  const contentTruncated = body.length > STORED_BODY_LIMIT;
  body = body.slice(0, STORED_BODY_LIMIT);
  const textLinks: NormalizedLink[] = (body.match(URL_PATTERN) || []).map(
    (url) => ({ url }),
  );
  const links = [...textLinks, ...htmlLinks(rawHtml)]
    .filter(
      (item, index, all) =>
        all.findIndex(
          (other) =>
            other.url === item.url && other.visibleText === item.visibleText,
        ) === index,
    )
    .slice(0, 200);
  const authenticationResults =
    parsed.headers
      .filter((item) => item.key === "authentication-results")
      .map((item) => item.value)
      .join("; ") || null;
  const date = parsed.date ? new Date(parsed.date) : null;
  return {
    contentHash: createHash("sha256").update(buffer).digest("hex"),
    sender: formatAddress(parsed.from as Address | undefined),
    replyTo: formatAddress(parsed.replyTo?.[0] as Address | undefined),
    recipients: {
      to: flattenAddresses(parsed.to as Address[] | undefined),
      cc: flattenAddresses(parsed.cc as Address[] | undefined),
      bcc: flattenAddresses(parsed.bcc as Address[] | undefined),
    },
    subject: parsed.subject || null,
    receivedAt: date && !Number.isNaN(date.getTime()) ? date : null,
    plainTextBody: body,
    extractedLinks: links,
    selectedHeaders: {
      authenticationResults,
      messageId: parsed.messageId || null,
      returnPath: parsed.returnPath || null,
    },
    contentTruncated,
    parseNote: contentTruncated
      ? "Body text was truncated to 200,000 characters."
      : null,
    attachments: parsed.attachments.map((item, index) => ({
      fileName: item.filename || `unnamed-attachment-${index + 1}`,
      mimeType: item.mimeType || "application/octet-stream",
      sizeBytes: byteLength(item.content),
    })),
  };
}
