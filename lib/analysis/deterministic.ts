import {
  CHECK_VERSION,
  type AnalysisEmail,
  type AuthenticationEvidence,
  type DeterministicFindingData,
  type DeterministicResult,
  type FindingSeverity,
} from "./types";

const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
]);
const EXECUTABLE_EXTENSIONS = new Set([
  "exe",
  "com",
  "scr",
  "msi",
  "bat",
  "cmd",
  "ps1",
  "vbs",
  "js",
  "jse",
  "wsf",
  "hta",
  "jar",
  "lnk",
]);
const UNUSUAL_EXTENSIONS = new Set([
  ...EXECUTABLE_EXTENSIONS,
  "iso",
  "img",
  "dll",
  "reg",
  "chm",
  "xlsm",
  "docm",
]);

function finding(
  checkId: string,
  severity: FindingSeverity,
  explanation: string,
  supportingValue: string,
  sourceField: string,
): DeterministicFindingData {
  return {
    checkId,
    severity,
    explanation,
    supportingValue: supportingValue.slice(0, 1000),
    sourceField,
    checkVersion: CHECK_VERSION,
  };
}

function mailbox(value: string | null) {
  if (!value) return null;
  const bracketed = value.match(/<\s*([^<>\s]+@[^<>\s]+)\s*>/);
  const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (bracketed?.[1] || plain?.[0] || "").toLowerCase() || null;
}

function displayName(value: string | null) {
  if (!value) return null;
  const match = value.match(/^\s*"?([^"<]+?)"?\s*</);
  return match?.[1]?.trim() || null;
}

function domain(address: string | null) {
  const parsed = mailbox(address);
  return parsed?.split("@")[1] || null;
}

function authValue(raw: string, name: string) {
  const match = raw.match(
    new RegExp(`(?:^|[;\\s])${name}\\s*=\\s*([a-z_-]+)`, "i"),
  );
  if (!match) return "UNKNOWN" as const;
  return match[1].toLowerCase() === "pass"
    ? ("PASS" as const)
    : ("FAIL" as const);
}

export function parseAuthenticationResults(
  raw: string | null | undefined,
): AuthenticationEvidence {
  const value = raw || "";
  return {
    spf: authValue(value, "spf"),
    dkim: authValue(value, "dkim"),
    dmarc: authValue(value, "dmarc"),
    raw: raw || null,
    trustLimitation:
      "Authentication-Results is unverified message-header evidence. MailShield did not independently query DNS or validate the header chain.",
  };
}

function hostnameFromUrl(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function isIp(host: string) {
  const ipv4 = host.match(/^(\d{1,3}\.){3}\d{1,3}$/);
  if (ipv4)
    return host
      .split(".")
      .every((part) => Number(part) >= 0 && Number(part) <= 255);
  return host.includes(":") && /^[0-9a-f:]+$/i.test(host);
}

function visibleDestination(value?: string) {
  if (!value) return null;
  const candidate = value.match(/https?:\/\/[^\s]+/i)?.[0];
  return candidate ? hostnameFromUrl(candidate) : null;
}

function likelyLookalike(host: string) {
  return (
    /xn--/i.test(host) ||
    /(?:paypa[1l]|micr[o0]soft|g[o0]{2}gle|app1e|amaz[o0]n|netf1ix)/i.test(
      host,
    ) ||
    /[^\x00-\x7F]/.test(host)
  );
}

export function runDeterministicChecks(
  email: AnalysisEmail,
): DeterministicResult {
  const findings: DeterministicFindingData[] = [];
  const senderMailbox = mailbox(email.sender);
  const senderDomain = domain(email.sender);
  const replyDomain = domain(email.replyTo);
  const name = displayName(email.sender);

  if (!senderMailbox) {
    findings.push(
      finding(
        "sender.missing_or_malformed",
        "HIGH",
        "The From field is missing or does not contain a valid-looking mailbox.",
        email.sender || "[missing]",
        "sender",
      ),
    );
  }
  const emailInName = mailbox(name);
  if (emailInName && emailInName !== senderMailbox) {
    findings.push(
      finding(
        "sender.display_address_mismatch",
        "HIGH",
        "The display name contains an email address different from the actual sender address.",
        `${name} -> ${senderMailbox}`,
        "sender",
      ),
    );
  }
  if (senderDomain && replyDomain && senderDomain !== replyDomain) {
    findings.push(
      finding(
        "sender.reply_to_domain_mismatch",
        "MEDIUM",
        "Replies would be sent to a different domain than the From address.",
        `${senderDomain} -> ${replyDomain}`,
        "replyTo",
      ),
    );
  }

  const combined = `${email.subject || ""}\n${email.body}`;
  const urgency = combined.match(
    /\b(urgent|immediately|act now|final warning|within \d+ hours?|account (?:will be )?(?:closed|suspended)|verify (?:your )?(?:account|password)|login credentials?)\b/i,
  );
  if (urgency)
    findings.push(
      finding(
        "content.urgency_or_credentials",
        "MEDIUM",
        "The message uses urgency, account pressure, or a credential request.",
        urgency[0],
        urgency.index! < (email.subject || "").length ? "subject" : "body",
      ),
    );
  const payment = combined.match(
    /\b(gift cards?|wire transfer|bank details?|change (?:the )?(?:bank|payment)|invoice attached|overdue invoice|crypto(?:currency)?|payment (?:is )?due)\b/i,
  );
  if (payment)
    findings.push(
      finding(
        "content.payment_request",
        "HIGH",
        "The message contains language commonly associated with payment or invoice fraud.",
        payment[0],
        payment.index! < (email.subject || "").length ? "subject" : "body",
      ),
    );

  const hosts = new Set<string>();
  const ips = new Set<string>();
  for (const link of email.links) {
    const host = hostnameFromUrl(link.url);
    if (!host) continue;
    hosts.add(host);
    if (isIp(host)) {
      ips.add(host);
      findings.push(
        finding(
          "url.ip_address",
          "HIGH",
          "The URL uses a numeric IP address instead of a domain name.",
          link.url,
          "url",
        ),
      );
    }
    if (SHORTENERS.has(host))
      findings.push(
        finding(
          "url.shortener",
          "MEDIUM",
          "The destination uses a URL-shortening service that conceals the final host.",
          link.url,
          "url",
        ),
      );
    if (likelyLookalike(host))
      findings.push(
        finding(
          "url.lookalike_or_punycode",
          "HIGH",
          "The URL hostname contains punycode or a likely brand look-alike pattern.",
          host,
          "url",
        ),
      );
    const visibleHost = visibleDestination(link.visibleText);
    if (visibleHost && visibleHost !== host)
      findings.push(
        finding(
          "url.visible_destination_mismatch",
          "HIGH",
          "The visible link text names a different destination than the actual URL.",
          `${visibleHost} -> ${host}`,
          "url",
        ),
      );
  }

  for (const attachment of email.attachments) {
    const nameValue = attachment.fileName.trim();
    const parts = nameValue.toLowerCase().split(".").filter(Boolean);
    const extension = parts.at(-1) || "";
    if (parts.length >= 3 && UNUSUAL_EXTENSIONS.has(extension))
      findings.push(
        finding(
          "attachment.double_extension",
          "HIGH",
          "The attachment has multiple extensions ending in an unusual or executable type.",
          nameValue,
          "attachment metadata",
        ),
      );
    if (EXECUTABLE_EXTENSIONS.has(extension))
      findings.push(
        finding(
          "attachment.executable_or_script",
          "HIGH",
          "The attachment filename has an executable or script extension. Its contents were not scanned.",
          nameValue,
          "attachment metadata",
        ),
      );
    else if (UNUSUAL_EXTENSIONS.has(extension))
      findings.push(
        finding(
          "attachment.unusual_extension",
          "MEDIUM",
          "The attachment filename has an extension that deserves additional review.",
          nameValue,
          "attachment metadata",
        ),
      );
  }

  const authentication = parseAuthenticationResults(
    email.headers.authenticationResults,
  );
  for (const method of ["spf", "dkim", "dmarc"] as const) {
    if (authentication[method] === "FAIL")
      findings.push(
        finding(
          `authentication.${method}_failure`,
          "MEDIUM",
          `${method.toUpperCase()} is reported as failing in the available Authentication-Results header. The header itself was not independently verified.`,
          authentication.raw || `${method}=fail`,
          "authentication result",
        ),
      );
  }

  return {
    findings,
    urlHostnames: [...hosts],
    ipAddresses: [...ips],
    authentication,
  };
}
