import { NextResponse } from "next/server";
import { monitoringConfig, processNotification } from "@/lib/gmail/monitor";
import { decodePush } from "@/lib/gmail/monitor-core";
import { verifyPushAuth } from "@/lib/gmail/push-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const config = monitoringConfig();
  if (!config.configured) return new NextResponse(null, { status: 503 });
  if (
    process.env.NODE_ENV === "production" &&
    new URL(request.url).protocol !== "https:"
  )
    return new NextResponse(null, { status: 403 });
  try {
    await verifyPushAuth(
      request.headers.get("authorization"),
      config.audience,
      config.serviceAccount,
    );
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  let notification;
  try {
    const body = await request.json();
    notification = decodePush(body, config.subscription);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  try {
    const status = await processNotification(
      notification.pubsubId,
      notification.mailbox,
      notification.historyId,
    );
    if (status === "UNKNOWN_MAILBOX")
      return new NextResponse(null, { status: 404 });
    return NextResponse.json({ status });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
