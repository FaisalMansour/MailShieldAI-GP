import { useEffect } from "react";
import type { Email } from "@/lib/types";
interface Context {
  registerTool(
    tool: {
      name: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ): void | Promise<void>;
}
export function useDemoTools(emails: Email[]) {
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "read_demo_inbox",
            description:
              "Read fictional emails and simulated scores from the currently connected MailShield demo inbox. Does not retrieve real email or change state.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute(input) {
              if (
                typeof input !== "object" ||
                input === null ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw new Error("Expected an empty object.");
              return {
                mode: "demo",
                emails: emails.map((e) => ({
                  id: e.id,
                  sender: e.sender,
                  subject: e.subject,
                  status: e.status,
                  estimatedRisk: e.report?.score ?? null,
                })),
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability; core interface remains available. */
    }
    return () => lifecycle.abort();
  }, [emails]);
}
