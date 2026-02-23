# Koda — Social Calendar + Discover

Koda is a privacy-first social calendar that helps friends coordinate plans and discover things to do in their city. Share availability safely (busy-only or full details), invite friends to hangouts, host public events with optional anonymity, and sync with Google Calendar.

## Getting Started

### Prerequisites

- Node.js **20.19.0+** (required by Prisma 7; see `.nvmrc`)
- pnpm (recommended)
- Supabase account (free tier works)

### Installation

```bash
# Install dependencies
pnpm install

# Set up git hooks (pre-commit)
pnpm husky

# Copy environment variables
cp .env.example .env.local
# Then edit .env.local with your Supabase credentials
```

### Database Setup

Koda uses Prisma with Supabase Postgres. Before running the app:

1. **Create a Supabase project** at [supabase.com](https://supabase.com)

2. **Get your database credentials** from Supabase Dashboard:
   - `DATABASE_URL`: Settings > Database > Connection string (use "Transaction" mode for Prisma)
   - `SUPABASE_URL`: Settings > API > Project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Settings > API > service_role key
   - Note: DATABASE_URL is configured in `prisma.config.ts` for Prisma 7 CLI commands

3. **Set up Supabase Storage** for avatar uploads:
   - Go to Storage in your Supabase Dashboard
   - Create a bucket named `avatars`
   - Set the bucket as **public** (for direct public avatar URLs)
   - Note: Private bucket support with signed URLs is not yet implemented; see [Future Enhancements](#avatar-upload-future-enhancements)

4. **Set up Google OAuth** (for authentication):
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new OAuth 2.0 credentials (OAuth consent screen + Credentials)
   - Set redirect URI to `http://localhost:3000/api/auth/callback/google` (for local development)
   - For production, add your domain's callback URL: `https://yourdomain.com/api/auth/callback/google`
   - Get your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

5. **Run database migrations**:

   ```bash
   # Generate Prisma client
   pnpm db:generate

   # Run migrations (creates tables)
   pnpm db:migrate

   # Seed the database with sample data
   pnpm db:seed
   ```

### Authentication Setup

Koda uses NextAuth.js v5 (beta) for authentication with two providers:

- **Email + Password**: Users can sign up with email and password (bcryptjs hashing)
- **Google OAuth**: Users can sign in with their Google account

To configure authentication locally:

1. Copy `.env.example` to `.env.local` and fill in:

   ```bash
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=<random_secret_32_chars_minimum>
   GOOGLE_CLIENT_ID=<your_google_client_id>
   GOOGLE_CLIENT_SECRET=<your_google_client_secret>
   ```

2. Generate a secure `NEXTAUTH_SECRET`:

   ```bash
   openssl rand -base64 32
   ```

3. Sessions are persisted to the database using Prisma adapter

### Development

```bash
# Start development server (runs on http://localhost:3000)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Database Commands

```bash
# Run migrations in development (creates migration files)
pnpm db:migrate

# Deploy migrations to production (applies existing migrations)
pnpm db:migrate:prod

# Seed the database with sample data
pnpm db:seed

# Open Prisma Studio (database GUI)
pnpm db:studio

# Push schema changes directly (skip migrations, useful for prototyping)
pnpm db:push

# Regenerate Prisma client after schema changes
pnpm db:generate
```

## Tooling & Scripts

### Code Quality

```bash
# Lint code with ESLint
pnpm lint

# Type-check with TypeScript
pnpm typecheck

# Format code with Prettier
pnpm format

# Check formatting (without making changes)
pnpm format:check
```

### Testing

```bash
# Run tests once
pnpm test

# Run tests with coverage report (must meet 93% threshold)
pnpm test:coverage
```

### Avatar Upload API

Upload user avatars to Supabase Storage via the `/api/uploads/avatar` endpoint.

**Endpoint**: `POST /api/uploads/avatar`

**Headers**:

- `Content-Type: multipart/form-data`
- `x-dev-user-email: user@example.com` (development auth placeholder)

**Body**: Form data with field `file` containing the image

**Supported formats**: JPEG, PNG, GIF, WebP (max 5MB)

**Example with curl**:

```bash
# Upload an avatar (development mode with x-dev-user-email header)
curl -X POST http://localhost:3000/api/uploads/avatar \
  -H "x-dev-user-email: alice@example.com" \
  -F "file=@/path/to/avatar.png"

# Response: { "url": "https://your-project.supabase.co/storage/v1/object/public/avatars/alice@example.com/1234567890-avatar.png" }
```

**Response codes**:

- `200`: Success, returns `{ url: string }`
- `400`: Missing file or invalid file type/size
- `401`: Missing authentication
- `500`: Upload failed

**Note**: The endpoint currently uses a development placeholder (`x-dev-user-email` header) for authentication. In production, this will be replaced with proper session-based auth.

## Code Style & Configuration

- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 + shadcn/ui components
- **Formatting**: Prettier (2-space indentation, single quotes)
- **Linting**: ESLint 9 + Next.js config
- **Pre-commit hooks**: Husky + lint-staged (auto-format staged files)
- **Editor config**: `.editorconfig` for IDE consistency

## Project Structure

```
.
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/          # NextAuth routes & signup
│   │   │   ├── [...nextauth]/route.ts
│   │   │   └── signup/    # Email/password signup endpoint
│   │   └── integrations/  # Integration endpoints
│   │       └── google/    # Google integration (connect/disconnect)
│   ├── app/               # Protected authenticated area
│   │   ├── settings/
│   │   │   └── integrations/  # Google Calendar connect/disconnect UI
│   │   ├── page.tsx       # Dashboard
│   │   └── layout.tsx     # App layout with sidebar
│   ├── login/             # Login page
│   ├── signup/            # Signup page
│   ├── layout.tsx         # Root layout with navigation
│   ├── page.tsx           # Landing page
│   └── globals.css        # Global styles
├── components/
│   ├── ui/                # shadcn/ui components
│   └── ...                # Feature components
├── lib/
│   ├── auth/              # Authentication
│   │   ├── config.ts      # NextAuth configuration
│   │   └── password.ts    # Password hashing utilities
│   ├── db/                # Database utilities
│   │   └── prisma.ts      # Prisma client singleton
│   ├── supabase/          # Supabase utilities
│   │   └── server.ts      # Server-side Supabase client
│   ├── auth.ts            # Auth helpers (getSession, getCurrentUser)
│   └── utils.ts           # Shared utilities
├── middleware.ts          # Route protection middleware
├── prisma/
│   ├── schema.prisma      # Database schema (with auth models)
│   ├── migrations/        # Database migrations
│   └── seed.ts            # Seed data script
├── tests/                 # Unit & integration tests
│   ├── api/               # API route tests
│   │   └── integrations/  # Integration tests
│   └── lib/               # Library tests
│       └── auth/          # Auth utility tests
├── .github/workflows/     # GitHub Actions CI
├── .husky/                # Git hooks
├── vitest.config.mjs      # Test runner config
└── next.config.ts         # Next.js config
```

## Testing

Run the test suite with:

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test --watch
```

Authentication tests include:

- Password hashing and verification (bcryptjs)
- Disconnect endpoint authorization
- Smoke tests for signup and login flows

## Authentication & Protected Routes

### How It Works

1. **Public Routes**: `/`, `/login`, `/signup`, `/api/auth/**`
2. **Protected Routes**: `/app/**` — redirects to `/login` if not authenticated
3. **Session Storage**: Database-backed sessions via Prisma adapter

### Testing Login/Signup Flow

#### Email + Password Signup:

1. Navigate to `http://localhost:3000/signup`
2. Create account with email/password (min 8 chars)
3. Redirects to `/app` on success
4. Password is hashed with bcryptjs (12 salt rounds)

#### Email + Password Login:

1. Navigate to `http://localhost:3000/login`
2. Sign in with registered email/password
3. Redirects to `/app`

#### Google OAuth Login:

1. Navigate to `/login` or `/signup`
2. Click "Sign in/up with Google"
3. Complete Google OAuth flow
4. Redirects to `/app` on success
5. Account row is created in database for token storage

### Testing Integrations / Google Connect/Disconnect

1. **When Logged In**: Navigate to `/app/settings/integrations`
2. **Connect Google**:
   - Click "Connect" button
   - Complete Google OAuth flow
   - Returns to `/app/settings/integrations`
   - Status changes to "Connected"
   - Google Account row stored in database with tokens
3. **Disconnect Google**:
   - Click "Disconnect" button
   - Confirm in dialog
   - Account row deleted from database
   - Status changes to "Not connected"
   - Tokens no longer available

### Session Persistence

Sessions persist across page refreshes. To test:

1. Sign in at `/login`
2. Navigate to `/app`
3. Refresh page — still logged in
4. Open developer tools > Application > Cookies
5. Note `authjs.session-token` cookie

### Protected Route Behavior

To test route protection:

1. Sign out (click "Sign out" in sidebar)
2. Try accessing `/app` directly
3. Redirected to `/login?callbackUrl=/app`
4. After login, redirected back to `/app`

## Calendar & Events (Sprint 3)

### Overview

Koda's calendar system allows users to create, view, and manage events with friends. Features include:

- **Event CRUD**: Create, update, and delete events with title, time, location, timezone, visibility, and cover mode
- **Event Visibility**: PRIVATE, FRIENDS, PUBLIC
- **Cover Mode**: BUSY_ONLY redacts details to non-owners (shows "Busy" only)
- **Invitations**: Invite friends to events with automatic notifications
- **RSVP**: Attendees can respond as GOING or DECLINED
- **Anonymity**: Attendees can choose to attend anonymously; host cannot override
- **Calendar UI**: Premium glassmorphic week view + agenda list
- **Notifications**: In-app and email invitations (with dev-mode toggle)

### Testing the Calendar Locally

#### Setup

Ensure your database is seeded with test users:

```bash
pnpm db:seed
```

#### 1. Create an Event

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<your-session-token>" \
  -d '{
    "title": "Coffee Meetup",
    "startAt": "2026-02-10T14:00:00Z",
    "endAt": "2026-02-10T15:00:00Z",
    "timezone": "America/New_York",
    "visibility": "FRIENDS",
    "coverMode": "NONE",
    "locationName": "Local Cafe"
  }'
```

#### 2. View Your Calendar

Navigate to `http://localhost:3000/app/calendar` to see your events in week view and agenda list.

#### 3. Invite a Friend

```bash
curl -X POST http://localhost:3000/api/events/:id/invite \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<your-session-token>" \
  -d '{
    "userIds": ["friend-user-id"]
  }'
```

Note: The friend must be an accepted friend to receive the invite.

#### 4. RSVP as Invitee

```bash
curl -X POST http://localhost:3000/api/events/:id/rsvp \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<invitee-session-token>" \
  -d '{ "status": "GOING" }'
```

#### 5. Toggle Anonymity

```bash
curl -X POST http://localhost:3000/api/events/:id/anonymity \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=<invitee-session-token>" \
  -d '{ "anonymity": "ANONYMOUS" }'
```

#### 6. View Event Details (with Anonymity Enforcement)

```bash
curl http://localhost:3000/api/events/:id \
  -H "Cookie: authjs.session-token=<your-session-token>"
```

Anonymous attendees will show as "Anonymous attendee" without email/userId.

### Email Notifications

By default, email notifications are **disabled** for local development. To enable:

1. Get a **Resend API key** at [resend.com](https://resend.com)
2. Update `.env.local`:

   ```bash
   EMAIL_ENABLED=true
   RESEND_API_KEY=re_your_key_here
   EMAIL_FROM=noreply@koda.app
   ```

3. Restart the dev server

When enabled, invitees will receive email invitations. When disabled, a log message appears in the server console instead.

### Calendar UI Features

**Week View**:

- Displays Mon–Sun with hourly grid (8am–10pm)
- Event blocks positioned by start/end time
- Click events to open detail modal
- Premium glassmorphism styling with frosted glass effect

**Agenda List**:

- Shows upcoming events sorted by time
- Quick view of date, time, and status
- Click to open event detail page

**Event Detail Page**:

- Full event info: title, time, location, description
- Attendees list (respects anonymity rules)
- RSVP buttons for invitees
- Anonymity toggle for attendees
- Edit/delete buttons for event owner

### Data Model

**Event**:

- `id, ownerId, title, description?, locationName?`
- `startAt, endAt, timezone`
- `visibility` (PRIVATE | FRIENDS | PUBLIC)
- `coverMode` (NONE | BUSY_ONLY)
- `createdAt, updatedAt`

**Attendee**:

- `id, eventId, userId`
- `status` (INVITED | GOING | DECLINED)
- `anonymity` (NAMED | ANONYMOUS)
- `role` (HOST | ATTENDEE)
- `createdAt, updatedAt`

**Notification**:

- `id, userId, type` (EVENT_INVITE)
- `title, body, href, isRead`
- `createdAt`

### Authorization & Privacy

**Event Visibility Rules**:

1. **Owner** always sees full details
2. **Non-owner** must be:
   - An accepted friend with `canViewCalendar=true`
   - Have appropriate `detailLevel` (BUSY_ONLY | DETAILS)
3. **PRIVATE events**: Only owner sees details; non-owner blocked (403/404)
4. **FRIENDS events**: Friends with permission see details per `detailLevel`
5. **PUBLIC events**: Currently treated like FRIENDS (no public web browsing yet)

**Cover Mode**:

- If `coverMode=BUSY_ONLY`, non-owners always see "Busy" regardless of detail level

**Anonymity**:

- Attendees can set their own anonymity
- Host **cannot override** attendee anonymity (enforced server-side)
- Anonymous attendees show as "Anonymous attendee" in attendee list (except for self and owner)

GitHub Actions workflow runs on every PR and push to `main`:

- **Linting** (`pnpm lint`)
- **Type-checking** (`pnpm typecheck`)
- **Tests** (`pnpm test:coverage`) — must meet 93% coverage threshold

See `.github/workflows/ci.yml` for details.

## Git Workflow

1. Create a feature branch
2. Make changes and commit
3. Pre-commit hook automatically:
   - Formats staged files with Prettier
   - Lints staged files with ESLint (blocks on errors)
4. Push to remote
5. CI runs on PR; merge once all checks pass

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4
- **Components**: shadcn/ui (Radix UI + Tailwind)
- **Testing**: Vitest + React Testing Library
- **Formatting**: Prettier
- **Linting**: ESLint 9
- **Git Hooks**: Husky + lint-staged
- **Package Manager**: pnpm

## Acceptance Criteria (Epic 0.1)

`pnpm dev` starts successfully and loads homepage
`pnpm lint` passes (no errors)
`pnpm typecheck` passes
`pnpm format:check` passes
`pnpm test` passes with 16 tests
`pnpm test:coverage` reports 100% coverage
Pre-commit hook installed and working (`git commit` triggers format + lint)
CI workflow exists and runs the same commands
Coverage threshold enforced at 93% in CI

## Deployment

### Railway

This project is configured for deployment on [Railway](https://railway.app):

1. **Connect your GitHub repo** to Railway
2. **Set environment variables** (see section below)
3. **Deploy** - Railway automatically deploys on push to `main`

#### Environment Variables

For local development, create a `.env.local` file:

```bash
# Example (update with actual values)
DATABASE_URL=your_supabase_url
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

In Railway, set these via the dashboard under **Variables**.

#### Free-tier Stack

- **Frontend/Backend**: Next.js on Railway
- **Database**: Supabase Postgres (free tier)
- **Caching**: Upstash Redis (free tier)
- **Auth**: Google OAuth (free)
- **Analytics**: PostHog (free tier)
- **Error Tracking**: Sentry (free tier)

No credit card required for initial deployment!

## Public Events & Join Requests (Sprint 4)

### Public Event Pages

Public events (`visibility: PUBLIC`) are accessible via a dedicated link-shareable page:

- **Route**: `/app/public/events/:id`
- **Authorization**: Requires login (MVP). Non-authenticated users are redirected to login first.
- **Design choice**: We require login for public event pages to enforce block checks, prevent data scraping, and simplify anonymity enforcement. No public search feed is implemented.

#### How it works

1. Host creates or edits an event and sets visibility to `PUBLIC`
2. A shareable link appears on the event detail page: `/app/public/events/:id`
3. Any logged-in user can view the event details and attendee list
4. Anonymous attendees appear as "Anonymous attendee" (attendee-controlled)
5. Non-attendees can click "Request to Join" which sends a pending request to the host
6. Host sees a "Join Requests" panel on the public event page with Approve/Deny buttons
7. On approval, the requester becomes an attendee (status: GOING) and receives a notification
8. On denial, the requester is notified and cannot re-request

#### Block rules

- If the host blocked the viewer (or vice versa), the public event page returns 404
- Blocked users cannot create join requests

#### API Endpoints

| Method | Path                                              | Description                                  |
| ------ | ------------------------------------------------- | -------------------------------------------- |
| GET    | `/api/public/events/:id`                          | Public event data + attendees + viewer state |
| POST   | `/api/public/events/:id/join-request`             | Create join request (rate limited: 10/hr)    |
| DELETE | `/api/public/events/:id/join-request`             | Cancel pending join request                  |
| GET    | `/api/public/events/:id/join-requests`            | Host: list all join requests                 |
| PATCH  | `/api/public/events/:id/join-requests/:requestId` | Host: approve or deny                        |

### Find Time (Availability)

Find a meeting time that works for multiple participants, then create an event with invites in one flow.

#### Usage Steps

1. Go to `/app/calendar` and click the **"Find Time"** button
2. Select friends from your accepted friends list
3. Choose a search range (next 3/7/14 days) and duration (30/60/90/120 min)
4. Click "Find Slots" — the system computes mutually free times
5. Pick a slot from the suggestions (up to 5, preferring earlier times)
6. Enter a title, optional location, and visibility setting
7. Click "Create Event & Send Invites" — creates the event and sends invites to selected friends

#### Permissions

- You can only find time with participants whose calendars you are allowed to view (`canViewCalendar=true` in the friendship)
- If any participant's calendar is not viewable, the API returns a 403 with `notViewableParticipantIds`

#### Algorithm

- Queries all events (including BUSY_ONLY redacted) as busy blocks for each participant
- Merges overlapping busy intervals per participant
- Computes intersection of free time across all participants
- Returns candidate slots aligned to 15-minute increments

#### API Endpoints

| Method | Path                     | Description                                |
| ------ | ------------------------ | ------------------------------------------ |
| POST   | `/api/find-time`         | Find available slots (rate limited: 20/hr) |
| POST   | `/api/find-time/confirm` | Convert slot to event + send invites       |

### Data Model Additions (Sprint 4)

**JoinRequest**:

- `id, eventId, requesterId, status` (PENDING | APPROVED | DENIED | CANCELED)
- `message?` (optional, not used in UI)
- `createdAt, updatedAt`
- Unique constraint: `(eventId, requesterId)`

**NotificationType** expanded:

- `JOIN_REQUEST` — sent to host when someone requests to join
- `JOIN_REQUEST_APPROVED` — sent to requester on approval
- `JOIN_REQUEST_DENIED` — sent to requester on denial

## Next Steps

After Epic 0.1, the following features are planned:

- **S1.0**: Database setup (Prisma + Supabase)
- **S2.0**: Authentication (Auth.js + Google OAuth)
- **S3.0**: Calendar views and sharing features
- **S4.0**: Friends management
- **S5.0**: Discover and suggestions engine
- **S6.0**: Event creation and invitations

See `/docs/sprint-plan.md` for detailed roadmap.

## Known Limitations & Future Enhancements

### Avatar Upload Future Enhancements

1. **Signed URLs for Private Buckets**
   - Currently only supports public buckets with direct URLs
   - Future: Implement `createSignedUrl()` for private buckets
   - Allows fine-grained control over avatar accessibility

2. **Robust File Validation**
   - Currently validates MIME type only (client-provided)
   - Future: Add magic byte verification + image library validation
   - Prevents spoofed file types and security issues

3. **Filename Sanitization**
   - Currently: Simple character replacement creating collisions
   - Future: Use UUID + preserve extension, or base64url encoding
   - Prevents naming collisions and preserves metadata

4. **Rate Limiting**
   - Currently: No rate limiting on upload endpoint
   - Future: Add per-user rate limiting to prevent abuse/DoS
   - Protect against excessive storage consumption and costs

### Database

1. **Seed Data Dates**
   - Currently uses hardcoded future dates (2026-02-05, etc.)
   - Future: Use relative dates based on current time
   - Makes seed data remain realistic over time

2. **Connection Pool Management**
   - Currently creates new Pool on each `createPrismaClient()` call
   - Potential issue: Hot module reloads in development
   - Future: Store pool in global object alongside Prisma client
   - Ensure proper cleanup on process termination

3. **Initial Migration**
   - No `prisma/migrations` directory yet
   - Developers must run `pnpm db:migrate` to create initial migration
   - Future PRs should commit migrations for production deployments
