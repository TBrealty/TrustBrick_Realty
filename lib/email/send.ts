import "server-only";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { isDev } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type CapturedEmail = EmailMessage & { id: string; sentAt: Date };

const MAX_CAPTURED = 50;

// In development there is no email provider, so messages are captured in memory and shown at
// /dev/mailbox. globalThis keeps the list alive across hot reloads.
const store = globalThis as unknown as { trustbrickOutbox?: CapturedEmail[]; trustbrickSes?: SESv2Client };

export function capturedEmails(): CapturedEmail[] {
  return store.trustbrickOutbox ?? [];
}

/**
 * The single seam for outbound email.
 *
 * Production sends through Amazon SES when EMAIL_DRIVER=ses: EMAIL_FROM is the sender (an
 * address on a domain verified in SES, e.g. `Trustbrick <no-reply@trustbrick.org>`) and
 * SES_REGION the SES region. On EC2 the server's IAM role supplies the credentials; elsewhere
 * the usual AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY work.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (isDev) {
    const outbox = (store.trustbrickOutbox ??= []);
    outbox.unshift({ ...message, id: crypto.randomUUID(), sentAt: new Date() });
    outbox.length = Math.min(outbox.length, MAX_CAPTURED);
    console.info(`[email] to=${message.to} subject="${message.subject}" → open /dev/mailbox`);
    return;
  }

  const from = process.env.EMAIL_FROM;
  if (process.env.EMAIL_DRIVER !== "ses" || !from) {
    // No provider configured. Fail visibly in logs rather than pretend it was sent.
    console.error(`[email] NOT SENT — set EMAIL_DRIVER=ses and EMAIL_FROM. subject="${message.subject}"`);
    return;
  }

  const ses = (store.trustbrickSes ??= new SESv2Client({ region: process.env.SES_REGION ?? process.env.AWS_REGION ?? "ap-south-1" }));
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: { Text: { Data: message.text, Charset: "UTF-8" }, Html: { Data: message.html, Charset: "UTF-8" } },
          },
        },
      }),
    );
  } catch (error) {
    // Callers (sign-up, notifications) shouldn't fail because a message couldn't go out.
    console.error(`[email] SES refused subject="${message.subject}":`, error instanceof Error ? error.message : error);
  }
}
