/**
 * Email notification utility using Resend.
 *
 * All public send functions are designed for fire-and-forget usage:
 *   sendInviteEmail({ ... }).catch(console.error);
 * so HTTP responses are never delayed by email delivery.
 */

import { Resend } from 'resend';
import { prisma } from '@/lib/db/prisma';

// ── Singleton client ────────────────────────────────────────

let _resend: Resend | null = null;

function getResendClient(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not set');
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@koda.app';

// ── Helpers ─────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEventDate(date: Date, timezone?: string): string {
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone || 'UTC',
  });
}

function eventUrl(eventId: string): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3002';
  return `${base}/app/events/${eventId}`;
}

function buttonHtml(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a>`;
}

function footer(): string {
  return `<p style="color:#94a3b8;font-size:12px;margin-top:32px;">You can manage your email preferences in your <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3002'}/app/settings/notifications" style="color:#64748b;">Koda settings</a>.</p>`;
}

// ── Settings check ──────────────────────────────────────────

/**
 * Returns true when the global EMAIL_ENABLED flag is on AND the target
 * user has not disabled email notifications in their settings.
 */
export async function isEmailEnabledForUser(userId: string): Promise<boolean> {
  if (process.env.EMAIL_ENABLED !== 'true') return false;

  const settings = await prisma.settings.findUnique({
    where: { userId },
    select: { emailInvitesEnabled: true },
  });

  // Schema default is true when no Settings row exists
  return settings?.emailInvitesEnabled ?? true;
}

// ── Base send ───────────────────────────────────────────────

async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (process.env.EMAIL_ENABLED !== 'true') {
    console.log(`[EMAIL] Dev mode → "${subject}" to ${to}`);
    return;
  }

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      html,
    });
    if (error) console.error('[EMAIL] Resend API error:', error);
  } catch (err) {
    console.error('[EMAIL] Send failed:', err);
  }
}

// ── Email #1: Event Invite ──────────────────────────────────

export async function sendInviteEmail(params: {
  to: string;
  inviteeName: string;
  hostName: string;
  eventTitle: string;
  eventStartAt: Date;
  eventTimezone?: string;
  eventId: string;
}): Promise<void> {
  const title = escapeHtml(params.eventTitle);
  const host = escapeHtml(params.hostName);
  const name = escapeHtml(params.inviteeName);
  const date = formatEventDate(params.eventStartAt, params.eventTimezone);

  await sendEmail(
    params.to,
    `You're invited to "${params.eventTitle}"`,
    `<h2>Hi ${name},</h2>
     <p><strong>${host}</strong> invited you to <strong>${title}</strong>.</p>
     <p><strong>When:</strong> ${date}</p>
     <p style="margin-top:24px;">${buttonHtml(eventUrl(params.eventId), 'View Event')}</p>
     ${footer()}`
  );
}

// ── Email #2: RSVP Accepted ─────────────────────────────────

export async function sendRsvpAcceptedEmail(params: {
  to: string;
  hostName: string;
  attendeeName: string;
  eventTitle: string;
  eventId: string;
}): Promise<void> {
  const title = escapeHtml(params.eventTitle);
  const attendee = escapeHtml(params.attendeeName);
  const host = escapeHtml(params.hostName);

  await sendEmail(
    params.to,
    `${params.attendeeName} is going to "${params.eventTitle}"`,
    `<h2>Hi ${host},</h2>
     <p><strong>${attendee}</strong> accepted your invite to <strong>${title}</strong>.</p>
     <p style="margin-top:24px;">${buttonHtml(eventUrl(params.eventId), 'View Event')}</p>
     ${footer()}`
  );
}

// ── Email #3: RSVP Declined ─────────────────────────────────

export async function sendRsvpDeclinedEmail(params: {
  to: string;
  hostName: string;
  attendeeName: string;
  eventTitle: string;
  eventId: string;
}): Promise<void> {
  const title = escapeHtml(params.eventTitle);
  const attendee = escapeHtml(params.attendeeName);
  const host = escapeHtml(params.hostName);

  await sendEmail(
    params.to,
    `${params.attendeeName} declined "${params.eventTitle}"`,
    `<h2>Hi ${host},</h2>
     <p><strong>${attendee}</strong> has declined your invite to <strong>${title}</strong>.</p>
     <p style="margin-top:24px;">${buttonHtml(eventUrl(params.eventId), 'View Event')}</p>
     ${footer()}`
  );
}

// ── Email #4: Event Updated ─────────────────────────────────

export async function sendEventUpdatedEmail(params: {
  to: string;
  attendeeName: string;
  eventTitle: string;
  eventStartAt: Date;
  eventTimezone?: string;
  locationName?: string | null;
  eventId: string;
}): Promise<void> {
  const title = escapeHtml(params.eventTitle);
  const name = escapeHtml(params.attendeeName);
  const date = formatEventDate(params.eventStartAt, params.eventTimezone);
  const location = params.locationName
    ? `<p><strong>Location:</strong> ${escapeHtml(params.locationName)}</p>`
    : '';

  await sendEmail(
    params.to,
    `"${params.eventTitle}" has been updated`,
    `<h2>Hi ${name},</h2>
     <p>The details of <strong>${title}</strong> have been updated.</p>
     <p><strong>When:</strong> ${date}</p>
     ${location}
     <p style="margin-top:24px;">${buttonHtml(eventUrl(params.eventId), 'View Updated Event')}</p>
     ${footer()}`
  );
}

// ── Email #5: Event Cancelled ───────────────────────────────

export async function sendEventCancelledEmail(params: {
  to: string;
  attendeeName: string;
  hostName: string;
  eventTitle: string;
  eventStartAt: Date;
  eventTimezone?: string;
}): Promise<void> {
  const title = escapeHtml(params.eventTitle);
  const name = escapeHtml(params.attendeeName);
  const host = escapeHtml(params.hostName);
  const date = formatEventDate(params.eventStartAt, params.eventTimezone);

  await sendEmail(
    params.to,
    `"${params.eventTitle}" has been cancelled`,
    `<h2>Hi ${name},</h2>
     <p><strong>${host}</strong> has cancelled <strong>${title}</strong> that was scheduled for ${date}.</p>
     <p style="color:#64748b;">This event is no longer taking place.</p>
     ${footer()}`
  );
}
