import "server-only";
import { isDev } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type CapturedEmail = EmailMessage & { id: string; sentAt: Date };

const MAX_CAPTURED = 50;

// In development there is no email provider yet, so messages are captured in memory
// and shown at /dev/mailbox. globalThis keeps the list alive across hot reloads.
const store = globalThis as unknown as { trustbrickOutbox?: CapturedEmail[] };

export function capturedEmails(): CapturedEmail[] {
  return store.trustbrickOutbox ?? [];
}

/**
 * The single seam for outbound email. Swap the production branch for a provider
 * (Resend, SES, Postmark) without touching any caller.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (isDev) {
    const outbox = (store.trustbrickOutbox ??= []);
    outbox.unshift({ ...message, id: crypto.randomUUID(), sentAt: new Date() });
    outbox.length = Math.min(outbox.length, MAX_CAPTURED);
    console.info(`[email] to=${message.to} subject="${message.subject}" → open /dev/mailbox`);
    return;
  }

  // No provider is configured yet. Fail visibly in logs rather than pretend it was sent.
  console.error(`[email] NOT SENT — no email provider configured. subject="${message.subject}"`);
}
