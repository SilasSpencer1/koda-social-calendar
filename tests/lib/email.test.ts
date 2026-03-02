import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSend = vi.fn();
vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = { send: (...args: unknown[]) => mockSend(...args) };
    },
  };
});

const mockSettingsFindUnique = vi.fn();
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    settings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// isEmailEnabledForUser
// ---------------------------------------------------------------------------

describe('isEmailEnabledForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns false when EMAIL_ENABLED is not true', async () => {
    const original = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'false';

    const { isEmailEnabledForUser } = await import('@/lib/email');
    const result = await isEmailEnabledForUser('user-1');
    expect(result).toBe(false);
    expect(mockSettingsFindUnique).not.toHaveBeenCalled();

    process.env.EMAIL_ENABLED = original;
  });

  it('returns true when enabled globally and user has no settings row', async () => {
    const original = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'true';
    mockSettingsFindUnique.mockResolvedValue(null);

    const { isEmailEnabledForUser } = await import('@/lib/email');
    const result = await isEmailEnabledForUser('user-1');
    expect(result).toBe(true);

    process.env.EMAIL_ENABLED = original;
  });

  it('returns false when user has disabled email invites', async () => {
    const original = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'true';
    mockSettingsFindUnique.mockResolvedValue({ emailInvitesEnabled: false });

    const { isEmailEnabledForUser } = await import('@/lib/email');
    const result = await isEmailEnabledForUser('user-1');
    expect(result).toBe(false);

    process.env.EMAIL_ENABLED = original;
  });

  it('returns true when user has email invites enabled', async () => {
    const original = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'true';
    mockSettingsFindUnique.mockResolvedValue({ emailInvitesEnabled: true });

    const { isEmailEnabledForUser } = await import('@/lib/email');
    const result = await isEmailEnabledForUser('user-1');
    expect(result).toBe(true);

    process.env.EMAIL_ENABLED = original;
  });
});

// ---------------------------------------------------------------------------
// sendInviteEmail
// ---------------------------------------------------------------------------

describe('sendInviteEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sends invite email via Resend when enabled', async () => {
    const origEnabled = process.env.EMAIL_ENABLED;
    const origKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    const { sendInviteEmail } = await import('@/lib/email');
    await sendInviteEmail({
      to: 'alice@example.com',
      inviteeName: 'Alice',
      hostName: 'Bob',
      eventTitle: 'Game Night',
      eventStartAt: new Date('2026-03-15T19:00:00Z'),
      eventTimezone: 'America/New_York',
      eventId: 'evt-1',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe('alice@example.com');
    expect(call.subject).toContain('Game Night');
    expect(call.html).toContain('Bob');
    expect(call.html).toContain('Alice');

    process.env.EMAIL_ENABLED = origEnabled;
    process.env.RESEND_API_KEY = origKey;
  });

  it('logs instead of sending when EMAIL_ENABLED is not true', async () => {
    const origEnabled = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'false';
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { sendInviteEmail } = await import('@/lib/email');
    await sendInviteEmail({
      to: 'alice@example.com',
      inviteeName: 'Alice',
      hostName: 'Bob',
      eventTitle: 'Game Night',
      eventStartAt: new Date('2026-03-15T19:00:00Z'),
      eventId: 'evt-1',
    });

    expect(mockSend).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();

    process.env.EMAIL_ENABLED = origEnabled;
  });

  it('handles Resend API errors gracefully', async () => {
    const origEnabled = process.env.EMAIL_ENABLED;
    const origKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Rate limited' },
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { sendInviteEmail } = await import('@/lib/email');
    // Should not throw
    await sendInviteEmail({
      to: 'alice@example.com',
      inviteeName: 'Alice',
      hostName: 'Bob',
      eventTitle: 'Game Night',
      eventStartAt: new Date('2026-03-15T19:00:00Z'),
      eventId: 'evt-1',
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();

    process.env.EMAIL_ENABLED = origEnabled;
    process.env.RESEND_API_KEY = origKey;
  });
});

// ---------------------------------------------------------------------------
// sendRsvpAcceptedEmail
// ---------------------------------------------------------------------------

describe('sendRsvpAcceptedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sends accepted email with correct subject', async () => {
    const origEnabled = process.env.EMAIL_ENABLED;
    const origKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: { id: 'email-2' }, error: null });

    const { sendRsvpAcceptedEmail } = await import('@/lib/email');
    await sendRsvpAcceptedEmail({
      to: 'host@example.com',
      hostName: 'Bob',
      attendeeName: 'Alice',
      eventTitle: 'Game Night',
      eventId: 'evt-1',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain('Alice');
    expect(call.subject).toContain('going');
    expect(call.html).toContain('accepted');

    process.env.EMAIL_ENABLED = origEnabled;
    process.env.RESEND_API_KEY = origKey;
  });
});

// ---------------------------------------------------------------------------
// sendRsvpDeclinedEmail
// ---------------------------------------------------------------------------

describe('sendRsvpDeclinedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sends declined email with correct subject', async () => {
    const origEnabled = process.env.EMAIL_ENABLED;
    const origKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: { id: 'email-3' }, error: null });

    const { sendRsvpDeclinedEmail } = await import('@/lib/email');
    await sendRsvpDeclinedEmail({
      to: 'host@example.com',
      hostName: 'Bob',
      attendeeName: 'Alice',
      eventTitle: 'Game Night',
      eventId: 'evt-1',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain('Alice');
    expect(call.subject).toContain('declined');

    process.env.EMAIL_ENABLED = origEnabled;
    process.env.RESEND_API_KEY = origKey;
  });
});

// ---------------------------------------------------------------------------
// sendEventUpdatedEmail
// ---------------------------------------------------------------------------

describe('sendEventUpdatedEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('includes location when provided', async () => {
    const origEnabled = process.env.EMAIL_ENABLED;
    const origKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: { id: 'email-4' }, error: null });

    const { sendEventUpdatedEmail } = await import('@/lib/email');
    await sendEventUpdatedEmail({
      to: 'alice@example.com',
      attendeeName: 'Alice',
      eventTitle: 'Game Night',
      eventStartAt: new Date('2026-03-15T19:00:00Z'),
      locationName: 'Central Park',
      eventId: 'evt-1',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.html).toContain('Central Park');
    expect(call.subject).toContain('updated');

    process.env.EMAIL_ENABLED = origEnabled;
    process.env.RESEND_API_KEY = origKey;
  });
});

// ---------------------------------------------------------------------------
// sendEventCancelledEmail
// ---------------------------------------------------------------------------

describe('sendEventCancelledEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('sends cancellation email with host name and date', async () => {
    const origEnabled = process.env.EMAIL_ENABLED;
    const origKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: { id: 'email-5' }, error: null });

    const { sendEventCancelledEmail } = await import('@/lib/email');
    await sendEventCancelledEmail({
      to: 'alice@example.com',
      attendeeName: 'Alice',
      hostName: 'Bob',
      eventTitle: 'Game Night',
      eventStartAt: new Date('2026-03-15T19:00:00Z'),
      eventTimezone: 'America/New_York',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.subject).toContain('cancelled');
    expect(call.html).toContain('Bob');
    expect(call.html).toContain('no longer taking place');

    process.env.EMAIL_ENABLED = origEnabled;
    process.env.RESEND_API_KEY = origKey;
  });
});

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

describe('email HTML escaping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('escapes HTML in event titles and names', async () => {
    const origEnabled = process.env.EMAIL_ENABLED;
    const origKey = process.env.RESEND_API_KEY;
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 'test-key';
    mockSend.mockResolvedValue({ data: { id: 'email-6' }, error: null });

    const { sendInviteEmail } = await import('@/lib/email');
    await sendInviteEmail({
      to: 'alice@example.com',
      inviteeName: '<script>alert("xss")</script>',
      hostName: 'Bob & "Friends"',
      eventTitle: 'Party <b>Bold</b>',
      eventStartAt: new Date('2026-03-15T19:00:00Z'),
      eventId: 'evt-1',
    });

    const call = mockSend.mock.calls[0][0];
    expect(call.html).not.toContain('<script>');
    expect(call.html).toContain('&lt;script&gt;');
    expect(call.html).toContain('Bob &amp; &quot;Friends&quot;');

    process.env.EMAIL_ENABLED = origEnabled;
    process.env.RESEND_API_KEY = origKey;
  });
});
