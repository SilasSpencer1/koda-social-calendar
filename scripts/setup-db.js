import pg from 'pg';

const { Pool } = pg;

async function setupDatabase() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.log('DATABASE_URL not set, skipping database setup');
    process.exit(0);
  }

  const pool = new Pool({ connectionString });

  try {
    const sql = `
-- Create enums
DO $$ BEGIN
  CREATE TYPE "AccountVisibility" AS ENUM ('PUBLIC', 'FRIENDS_ONLY', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "DetailLevel" AS ENUM ('DETAILS', 'BUSY_ONLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EventVisibility" AS ENUM ('PRIVATE', 'FRIENDS', 'PUBLIC');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CoverMode" AS ENUM ('NONE', 'BUSY_ONLY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "EventSource" AS ENUM ('KODA', 'GOOGLE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AttendeeStatus" AS ENUM ('INVITED', 'GOING', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "Anonymity" AS ENUM ('NAMED', 'ANONYMOUS');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AttendeeRole" AS ENUM ('HOST', 'ATTENDEE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Create User table
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "username" TEXT UNIQUE,
  "avatarUrl" TEXT,
  "city" TEXT,
  "passwordHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_username_idx" ON "User"("username");
CREATE INDEX IF NOT EXISTS "User_city_idx" ON "User"("city");

-- Create Account table
CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- Create Session table
CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- Create VerificationToken table
CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "expires" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- Create Settings table
CREATE TABLE IF NOT EXISTS "Settings" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL UNIQUE,
  "accountVisibility" "AccountVisibility" NOT NULL DEFAULT 'FRIENDS_ONLY',
  "defaultDetailLevel" "DetailLevel" NOT NULL DEFAULT 'BUSY_ONLY',
  "allowSuggestions" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Create Friendship table
CREATE TABLE IF NOT EXISTS "Friendship" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "requesterId" TEXT NOT NULL,
  "addresseeId" TEXT NOT NULL,
  "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
  "canViewCalendar" BOOLEAN NOT NULL DEFAULT false,
  "detailLevel" "DetailLevel" NOT NULL DEFAULT 'BUSY_ONLY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");
CREATE INDEX IF NOT EXISTS "Friendship_requesterId_idx" ON "Friendship"("requesterId");
CREATE INDEX IF NOT EXISTS "Friendship_addresseeId_idx" ON "Friendship"("addresseeId");
CREATE INDEX IF NOT EXISTS "Friendship_status_idx" ON "Friendship"("status");

-- Create Event table
CREATE TABLE IF NOT EXISTS "Event" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "locationName" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "visibility" "EventVisibility" NOT NULL DEFAULT 'PRIVATE',
  "coverMode" "CoverMode" NOT NULL DEFAULT 'NONE',
  "source" "EventSource" NOT NULL DEFAULT 'KODA',
  "externalId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Event_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "Event_ownerId_idx" ON "Event"("ownerId");
CREATE INDEX IF NOT EXISTS "Event_startAt_idx" ON "Event"("startAt");
CREATE INDEX IF NOT EXISTS "Event_endAt_idx" ON "Event"("endAt");
CREATE INDEX IF NOT EXISTS "Event_visibility_idx" ON "Event"("visibility");
CREATE INDEX IF NOT EXISTS "Event_source_externalId_idx" ON "Event"("source", "externalId");

-- Create Attendee table
CREATE TABLE IF NOT EXISTS "Attendee" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "AttendeeStatus" NOT NULL DEFAULT 'INVITED',
  "anonymity" "Anonymity" NOT NULL DEFAULT 'NAMED',
  "role" "AttendeeRole" NOT NULL DEFAULT 'ATTENDEE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE,
  CONSTRAINT "Attendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Attendee_eventId_userId_key" ON "Attendee"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "Attendee_eventId_idx" ON "Attendee"("eventId");
CREATE INDEX IF NOT EXISTS "Attendee_userId_idx" ON "Attendee"("userId");
CREATE INDEX IF NOT EXISTS "Attendee_status_idx" ON "Attendee"("status");
    `;

    await pool.query(sql);
    console.log('✓ Database setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('✗ Database setup failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
