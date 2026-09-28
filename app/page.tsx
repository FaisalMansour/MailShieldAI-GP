import { auth, signIn } from "@/auth";
import { missingConfiguration } from "@/lib/server-env";
import { prisma } from "@/lib/db";
import { SetupRequired } from "@/components/setup-required";
import { RealWorkspace } from "@/components/real-workspace";
import { analysisProviderConfigured } from "@/lib/analysis/provider-config";

export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const missing = missingConfiguration();
  if (missing.length) return <SetupRequired missing={missing} />;
  const session = await auth();
  if (!session?.user.id)
    return (
      <main className="entry-shell">
        <section className="entry-card">
          <span className="brand-mark">MS</span>
          <p className="eyebrow">MAILSHIELD AI · PHASE 3</p>
          <h1>Private email security workspace</h1>
          <p>
            Sign in with Google to create your private MailShield account. Gmail
            access is requested separately after sign-in.
          </p>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className="button primary" type="submit">
              Sign in with Google
            </button>
          </form>
          <a className="text-link" href="/demo">
            Explore the fictional demo instead
          </a>
          <p className="section-caption">
            Signing in shares only your basic Google identity. It does not grant
            access to Gmail.
          </p>
        </section>
      </main>
    );
  const [
    connection,
    emails,
    total,
    userSettings,
    analyzed,
    pending,
    failed,
    flagged,
    notifications,
    dailyUsage,
    totalUsage,
  ] = await Promise.all([
    prisma.gmailConnection.findUnique({ where: { userId: session.user.id } }),
    prisma.storedEmail.findMany({
      where: { userId: session.user.id, expiresAt: { gt: new Date() } },
      orderBy: { receivedAt: "desc" },
      take: 50,
      include: {
        attachments: true,
        reports: { orderBy: { version: "desc" }, take: 1 },
      },
    }),
    prisma.storedEmail.count({
      where: { userId: session.user.id, expiresAt: { gt: new Date() } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { analysisEnabled: true, dailyAnalysisLimit: true },
    }),
    prisma.storedEmail.count({
      where: {
        userId: session.user.id,
        expiresAt: { gt: new Date() },
        processingStatus: { in: ["COMPLETED", "NEEDS_REVIEW"] },
      },
    }),
    prisma.storedEmail.count({
      where: {
        userId: session.user.id,
        expiresAt: { gt: new Date() },
        processingStatus: { in: ["QUEUED", "ANALYZING"] },
      },
    }),
    prisma.storedEmail.count({
      where: {
        userId: session.user.id,
        expiresAt: { gt: new Date() },
        processingStatus: "FAILED",
      },
    }),
    prisma.storedEmail.count({
      where: {
        userId: session.user.id,
        expiresAt: { gt: new Date() },
        reports: { some: { severity: { in: ["MEDIUM", "HIGH"] } } },
      },
    }),
    prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { storedEmail: { select: { subject: true } } },
    }),
    prisma.analysisUsage.aggregate({
      where: {
        userId: session.user.id,
        usageDate: {
          gte: new Date(new Date().setUTCHours(0, 0, 0, 0)),
        },
      },
      _sum: {
        analyzedMessages: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCostMicros: true,
      },
    }),
    prisma.analysisUsage.aggregate({
      where: { userId: session.user.id },
      _sum: {
        analyzedMessages: true,
        inputTokens: true,
        outputTokens: true,
        estimatedCostMicros: true,
      },
    }),
  ]);
  return (
    <RealWorkspace
      session={session}
      connection={connection}
      emails={emails}
      total={total}
      userSettings={userSettings!}
      stats={{ analyzed, pending, failed, flagged }}
      notifications={notifications}
      usage={{ daily: dailyUsage._sum, total: totalUsage._sum }}
      aiConfigured={analysisProviderConfigured()}
      notice={(await searchParams).notice}
    />
  );
}
