 import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { customFetch } from "@auth/core";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/db";

process.env.AUTH_URL ??= process.env.APP_URL;

const googleCallbackUrl = process.env.APP_URL
  ? new URL("/api/auth/callback/google", process.env.APP_URL).toString()
  : undefined;
const appOrigin = process.env.APP_URL
  ? new URL(process.env.APP_URL).origin
  : undefined;
const googleOAuthFetch: typeof fetch = (input, init) => {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (
    requestUrl === "https://oauth2.googleapis.com/token" &&
    googleCallbackUrl &&
    init?.body instanceof URLSearchParams
  ) {
    const body = new URLSearchParams(init.body);
    body.set("redirect_uri", googleCallbackUrl);
    return fetch(input, { ...init, body });
  }
  return fetch(input, init);
};

const baseAdapter = PrismaAdapter(prisma);
const adapter: Adapter = {
  ...baseAdapter,
  linkAccount(account) {
    return baseAdapter.linkAccount!({
      ...account,
      access_token: undefined,
      refresh_token: undefined,
      id_token: undefined,
      expires_at: undefined,
      scope: undefined,
      token_type: undefined,
      session_state: undefined,
    });
  },
};
const googleReady = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
const localHttp = process.env.APP_URL?.startsWith("http://") ?? false;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  trustHost: true,
  useSecureCookies: !localHttp,
  cookies: localHttp
    ? {
        sessionToken: {
          name: "authjs.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: false,
          },
        },
      }
    : undefined,
  session: { strategy: "database" },
  providers: googleReady
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          authorization: { params: { scope: "openid email profile" } },
          [customFetch]: googleOAuthFetch,
        }),
      ]
    : [],
  callbacks: {
    redirect({ url }) {
      if (!appOrigin) return url;

      const destination = new URL(url, appOrigin);
      if (destination.origin !== appOrigin) return appOrigin;

      return new URL(
        `${destination.pathname}${destination.search}${destination.hash}`,
        appOrigin,
      ).toString();
    },
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  pages: { signIn: "/", error: "/auth-error" },
});
