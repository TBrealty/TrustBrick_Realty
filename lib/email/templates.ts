import "server-only";
import type { EmailMessage } from "./send";

const brand = "Trustbrick";

function layout(heading: string, paragraphs: string[], action?: { label: string; url: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#3b404b">${p}</p>`).join("");
  const button = action
    ? `<p style="margin:28px 0"><a href="${action.url}" style="background:#0d1119;color:#f8f6f1;padding:14px 22px;text-decoration:none;font-weight:600;display:inline-block">${action.label}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#6b655a;line-height:1.5">If the button does not work, paste this link into your browser:<br><span style="word-break:break-all">${action.url}</span></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f2eee6;font-family:-apple-system,Segoe UI,sans-serif">
    <div style="max-width:520px;margin:0 auto;padding:40px 24px">
      <p style="margin:0 0 32px;font-weight:700;font-size:18px;color:#0d1119">Trust<span style="color:#de6a3d">brick</span></p>
      <h1 style="margin:0 0 20px;font-size:26px;font-weight:600;color:#0d1119">${heading}</h1>
      ${body}${button}
      <p style="margin:32px 0 0;font-size:12px;color:#6b655a">Trustbrick Realty and Fintech Company Pvt. Ltd.</p>
    </div></body></html>`;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function verifyEmailMessage(to: string, name: string, url: string): EmailMessage {
  const first = escape(name.split(" ")[0] || "there");
  return {
    to,
    subject: `Confirm your email for ${brand}`,
    text: `Hi ${name},\n\nConfirm your email to finish creating your ${brand} account:\n${url}\n\nThis link expires in 24 hours. If you did not sign up, you can ignore this email.`,
    html: layout(
      `Confirm your email, ${first}`,
      [`Confirm your email address to finish creating your ${brand} account.`, "This link expires in 24 hours. If you did not sign up, you can safely ignore this email."],
      { label: "Confirm email", url },
    ),
  };
}

export function resetPasswordMessage(to: string, url: string): EmailMessage {
  return {
    to,
    subject: `Reset your ${brand} password`,
    text: `Someone asked to reset the password for your ${brand} account.\n\nReset it here:\n${url}\n\nThis link expires in 30 minutes and works once. If this was not you, ignore this email — your password has not changed.`,
    html: layout(
      "Reset your password",
      [
        `Someone asked to reset the password for your ${brand} account.`,
        "This link expires in 30 minutes and can be used once. If this was not you, ignore this email — your password has not changed.",
      ],
      { label: "Choose a new password", url },
    ),
  };
}

/**
 * Sent to the real owner when someone tries to sign up with an email that already
 * has an account. The person signing up sees the same "check your email" screen
 * either way, so the form never reveals which emails are registered.
 */
export function existingAccountMessage(to: string, loginUrl: string, resetUrl: string): EmailMessage {
  return {
    to,
    subject: `Someone tried to sign up with your ${brand} email`,
    text: `Someone tried to create a new ${brand} account with this email, but you already have one.\n\nIf it was you, log in instead: ${loginUrl}\nForgotten your password? ${resetUrl}\n\nIf it was not you, no action is needed. No new account was created.`,
    html: layout(
      "You already have an account",
      [
        `Someone tried to create a new ${brand} account with this email address, but you already have one.`,
        `If this was you, log in instead. Forgotten your password? <a href="${resetUrl}" style="color:#b0502c">Reset it here</a>.`,
        "If it was not you, no action is needed. No new account was created.",
      ],
      { label: "Log in", url: loginUrl },
    ),
  };
}

export function adminInvitationMessage(to: string, inviterName: string, url: string, expiresHours: number): EmailMessage {
  const inviter = escape(inviterName);
  return {
    to,
    subject: `You're invited to administer ${brand}`,
    text: `${inviterName} invited you to become a ${brand} administrator.\n\nAccept the invitation here:\n${url}\n\nThe link expires in ${expiresHours} hours and works once. If you weren't expecting this, ignore this email.`,
    html: layout(
      "You're invited to administer Trustbrick",
      [
        `${inviter} invited you to become a ${brand} administrator.`,
        `The link expires in ${expiresHours} hours and works once. If you weren't expecting this, you can ignore this email.`,
      ],
      { label: "Accept invitation", url },
    ),
  };
}

export function agentInvitationMessage(to: string, inviterName: string, organization: string | null, url: string, expiresHours: number): EmailMessage {
  const inviter = escape(inviterName);
  const where = organization ? ` with ${organization}` : "";
  return {
    to,
    subject: `Your ${brand} agent account is ready to set up`,
    text: `${inviterName} created a ${brand} agent account for you${where}.\n\nAccept and set it up here:\n${url}\n\nThe link expires in ${expiresHours} hours and works once. If you weren't expecting this, ignore this email.`,
    html: layout(
      "Your agent account is ready to set up",
      [
        `${inviter} created a ${brand} agent account for you${escape(where)}. Accept to open your agent workspace, where you can onboard properties and manage your leads.`,
        `The link expires in ${expiresHours} hours and works once. If you weren't expecting this, you can ignore this email.`,
      ],
      { label: "Accept and set up", url },
    ),
  };
}

/** Booking emails: one layout, the wording varies by event. Values are escaped here. */
export function bookingMessage(to: string, input: { subject: string; heading: string; lines: string[]; action?: { label: string; url: string } }): EmailMessage {
  return {
    to,
    subject: input.subject,
    text: `${input.lines.join("\n\n")}${input.action ? `\n\n${input.action.label}: ${input.action.url}` : ""}`,
    html: layout(escape(input.heading), input.lines.map(escape), input.action),
  };
}

/** An agent application approved: the workspace is ready (and, for a new organization, it's live). */
export function agentApprovedMessage(to: string, input: { name: string; organization: { name: string; referenceId: string; isNew: boolean } | null; url: string }): EmailMessage {
  const first = input.name.split(" ")[0] || "there";
  const org = input.organization;
  const lines = org?.isNew
    ? [
        `${org.name} is now live on ${brand}, and you're its admin. Your workspace is ready: onboard properties, and handle your leads and visits.`,
        `Agents who work with you can join by applying as an agent and choosing "Join an organization" with your reference, ${org.referenceId}.`,
      ]
    : [
        `Your agent workspace is ready${org ? ` with ${org.name}` : ""}. Onboard properties, and handle your leads and visits from one place.`,
        "Every listing is reviewed before it goes live.",
      ];
  return {
    to,
    subject: `You're approved as an agent on ${brand}`,
    text: `Hi ${first},\n\n${lines.join("\n\n")}\n\nOpen your workspace: ${input.url}`,
    html: layout(`You're approved, ${escape(first)}`, lines.map(escape), { label: "Open your workspace", url: input.url }),
  };
}

/** An agent application not approved, with the reviewer's reason. */
export function agentRejectedMessage(to: string, input: { name: string; reason: string | null; organizationName: string | null; url: string }): EmailMessage {
  const first = input.name.split(" ")[0] || "there";
  const what = input.organizationName ? `your agent application for ${input.organizationName}` : "your agent application";
  const lines = [
    `We've reviewed ${what} and couldn't approve it this time.`,
    input.reason ? `The reviewer's reason: "${input.reason}"` : "",
    "You can correct the details and apply again from the same page.",
  ].filter(Boolean);
  return {
    to,
    subject: `Your ${brand} agent application`,
    text: `Hi ${first},\n\n${lines.join("\n\n")}\n\n${input.url}`,
    html: layout(`About your application, ${escape(first)}`, lines.map(escape), { label: "Review and apply again", url: input.url }),
  };
}
