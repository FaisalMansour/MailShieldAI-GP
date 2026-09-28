import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserForMutation } from "@/lib/route-helpers";

export async function POST(request: Request) {
  try {
    const user = await requireUserForMutation(request);
    const body = (await request.json()) as { id?: unknown; all?: unknown };
    const now = new Date();

    if (body.all === true) {
      const result = await prisma.notification.updateMany({
        where: { userId: user.id, readAt: null },
        data: { readAt: now },
      });
      return NextResponse.json({ updated: result.count });
    }

    if (typeof body.id !== "string" || !body.id) {
      return NextResponse.json(
        { error: "A notification ID is required." },
        { status: 400 },
      );
    }

    const result = await prisma.notification.updateMany({
      where: { id: body.id, userId: user.id, readAt: null },
      data: { readAt: now },
    });
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json(
      { error: code === "AUTH_REQUIRED" ? "Authentication required." : "Unable to update notification." },
      { status: code === "AUTH_REQUIRED" ? 401 : 400 },
    );
  }
}
