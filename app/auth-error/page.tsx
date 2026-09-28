import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AuthErrorPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  return (
    <main className="entry-shell">
      <section className="entry-card">
        <span className="brand-mark">MS</span>
        <p className="eyebrow">MAILSHIELD AI</p>
        <h1>Sign-in session expired</h1>
        <p>
          The Google sign-in window was reused or expired. Start a fresh sign-in
          from MailShield to continue.
        </p>
        <Link className="button primary" href="/">
          Return to MailShield
        </Link>
      </section>
    </main>
  );
}
