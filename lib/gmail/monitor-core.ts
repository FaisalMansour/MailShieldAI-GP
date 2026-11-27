export type MailboxChange = { emailAddress: string; historyId: string };

export function decodePush(body: unknown, expectedSubscription: string) {
  if (!body || typeof body !== "object") throw new Error("INVALID_PUSH");
  const wrapper = body as {
    subscription?: unknown;
    message?: { messageId?: unknown; data?: unknown };
  };
  if (
    wrapper.subscription !== expectedSubscription ||
    typeof wrapper.message?.messageId !== "string" ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(wrapper.message.messageId) ||
    typeof wrapper.message.data !== "string" ||
    !/^[A-Za-z0-9_+\/-]{1,2048}={0,2}$/.test(wrapper.message.data)
  )
    throw new Error("INVALID_PUSH");
  let decoded: unknown;
  try {
    decoded = JSON.parse(
      Buffer.from(wrapper.message.data, "base64url").toString("utf8"),
    );
  } catch {
    throw new Error("INVALID_PUSH");
  }
  const value = decoded as Partial<MailboxChange> | null;
  if (
    !value ||
    typeof value.emailAddress !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.emailAddress) ||
    value.emailAddress.length > 254 ||
    typeof value.historyId !== "string" ||
    !/^[1-9]\d{0,19}$/.test(value.historyId)
  )
    throw new Error("INVALID_PUSH");
  return {
    pubsubId: wrapper.message.messageId,
    mailbox: value.emailAddress.toLowerCase(),
    historyId: value.historyId,
  };
}

export function newerHistory(incoming: string, current: string | null) {
  return !current || BigInt(incoming) > BigInt(current);
}

export function notificationDisposition(
  status: string,
  attempts: number,
  incoming: string,
  current: string | null,
  hasContinuation: boolean,
) {
  if (status === "COMPLETED") return "DUPLICATE";
  if (status === "RETRY_EXHAUSTED" || (status === "FAILED" && attempts >= 5))
    return "RETRY_EXHAUSTED";
  if (!newerHistory(incoming, current) && !hasContinuation) return "OLD";
  return "SYNC";
}

export function addedMessageIds(
  history: Array<{
    messagesAdded?: Array<{ message?: { id?: string | null } | null }> | null;
  }>,
) {
  return [
    ...new Set(
      history
        .flatMap((entry) =>
          (entry.messagesAdded || []).map((item) => item.message?.id || ""),
        )
        .filter(Boolean),
    ),
  ];
}

export function hasModifyScope(scopes: string) {
  return scopes
    .split(/\s+/)
    .includes("https://www.googleapis.com/auth/gmail.modify");
}

export function desiredLabel(
  severity: "LOW" | "MEDIUM" | "HIGH",
  corrected: boolean,
) {
  return corrected || severity === "LOW" ? null : severity;
}

export function labelChanges(
  current: string[],
  mediumId: string,
  highId: string,
  desired: string | null,
) {
  const ours = [mediumId, highId];
  return {
    addLabelIds: desired && !current.includes(desired) ? [desired] : [],
    removeLabelIds: ours.filter((id) => id !== desired && current.includes(id)),
  };
}

export function watchNeedsRenewal(expiresAt: Date | null, now = new Date()) {
  return !expiresAt || expiresAt.getTime() < now.getTime() + 48 * 3600_000;
}

export function recoveryDue(
  lastAt: Date | null,
  intervalMinutes: number,
  hasContinuation: boolean,
  now = new Date(),
) {
  return (
    hasContinuation ||
    !lastAt ||
    lastAt.getTime() < now.getTime() - intervalMinutes * 60_000
  );
}

export async function resolveMailShieldLabels(
  list: () => Promise<
    Array<{ id?: string | null; name?: string | null; type?: string | null }>
  >,
  create: (name: string) => Promise<string>,
) {
  let labels = await list();
  async function one(name: string) {
    const existing = labels.find(
      (label) => label.name === name && label.type === "user" && label.id,
    );
    if (existing?.id) return existing.id;
    try {
      return await create(name);
    } catch (error) {
      labels = await list();
      const concurrent = labels.find(
        (label) => label.name === name && label.type === "user" && label.id,
      );
      if (concurrent?.id) return concurrent.id;
      throw error;
    }
  }
  return {
    mediumLabelId: await one("MailShield - Medium Risk"),
    highLabelId: await one("MailShield - High Risk"),
  };
}
