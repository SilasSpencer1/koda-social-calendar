import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Create Prisma client with PostgreSQL adapter for Prisma 7
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Starting seed...');

  // Create 3 users with upsert for idempotency
  const alice = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {
      name: 'Alice Johnson',
      username: 'alice',
      city: 'San Francisco',
    },
    create: {
      email: 'alice@example.com',
      name: 'Alice Johnson',
      username: 'alice',
      city: 'San Francisco',
    },
  });
  console.log(`  Created/updated user: ${alice.name} (${alice.email})`);

  const bob = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {
      name: 'Bob Smith',
      username: 'bob',
      city: 'San Francisco',
    },
    create: {
      email: 'bob@example.com',
      name: 'Bob Smith',
      username: 'bob',
      city: 'San Francisco',
    },
  });
  console.log(`  Created/updated user: ${bob.name} (${bob.email})`);

  const charlie = await prisma.user.upsert({
    where: { email: 'charlie@example.com' },
    update: {
      name: 'Charlie Brown',
      username: 'charlie',
      city: 'New York',
    },
    create: {
      email: 'charlie@example.com',
      name: 'Charlie Brown',
      username: 'charlie',
      city: 'New York',
    },
  });
  console.log(`  Created/updated user: ${charlie.name} (${charlie.email})`);

  // Create settings for each user
  for (const user of [alice, bob, charlie]) {
    await prisma.settings.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        accountVisibility:
          user.email === 'alice@example.com' ? 'PUBLIC' : 'FRIENDS_ONLY',
        defaultDetailLevel: 'BUSY_ONLY',
        allowSuggestions: true,
      },
    });
  }
  console.log('  Created/updated settings for all users');

  // Create an accepted friendship between Alice and Bob
  // Use a deterministic approach: always have the lower ID as requester
  const [requesterId, addresseeId] = [alice.id, bob.id].sort();
  await prisma.friendship.upsert({
    where: {
      requesterId_addresseeId: {
        requesterId,
        addresseeId,
      },
    },
    update: {
      status: 'ACCEPTED',
      canViewCalendar: true,
      detailLevel: 'DETAILS',
    },
    create: {
      requesterId,
      addresseeId,
      status: 'ACCEPTED',
      canViewCalendar: true,
      detailLevel: 'DETAILS',
    },
  });
  console.log('  Created/updated friendship: Alice <-> Bob (accepted)');

  // Create some events
  // First, delete existing events by these users to avoid duplicates
  // (events don't have a natural unique key like email)
  const existingEvents = await prisma.event.findMany({
    where: { ownerId: { in: [alice.id, bob.id] } },
    select: { id: true },
  });

  if (existingEvents.length > 0) {
    const eventIds = existingEvents.map((e: { id: string }) => e.id);
    await prisma.attendee.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.event.deleteMany({
      where: { id: { in: eventIds } },
    });
    console.log('  Cleaned up existing events');
  }

  // Create new events with dates relative to today
  const today = new Date();
  const coffeeDate = await prisma.event.create({
    data: {
      ownerId: alice.id,
      title: 'Coffee with Bob',
      description: 'Weekly coffee catch-up',
      locationName: 'Blue Bottle Coffee, SF',
      startAt: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000), // 4 days from now
      endAt: new Date(
        today.getTime() + 4 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000
      ), // +1 hour
      timezone: 'America/Los_Angeles',
      visibility: 'FRIENDS',
      coverMode: 'NONE',
      source: 'KODA',
    },
  });
  console.log(`  Created event: ${coffeeDate.title}`);

  const teamLunch = await prisma.event.create({
    data: {
      ownerId: bob.id,
      title: 'Team Lunch',
      description: 'Monthly team gathering',
      locationName: 'The Italian Place',
      startAt: new Date(today.getTime() + 9 * 24 * 60 * 60 * 1000), // 9 days from now
      endAt: new Date(
        today.getTime() + 9 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000
      ), // +1.5 hours
      timezone: 'America/Los_Angeles',
      visibility: 'FRIENDS',
      coverMode: 'NONE',
      source: 'KODA',
    },
  });
  console.log(`  Created event: ${teamLunch.title}`);

  const privateEvent = await prisma.event.create({
    data: {
      ownerId: alice.id,
      title: 'Dentist Appointment',
      locationName: "Dr. Smith's Office",
      startAt: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      endAt: new Date(
        today.getTime() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000
      ), // +1 hour
      timezone: 'America/Los_Angeles',
      visibility: 'PRIVATE',
      coverMode: 'BUSY_ONLY',
      source: 'KODA',
    },
  });
  console.log(`  Created event: ${privateEvent.title}`);

  // Create attendees
  // Alice is host of coffee date, Bob is attendee
  await prisma.attendee.create({
    data: {
      eventId: coffeeDate.id,
      userId: alice.id,
      status: 'GOING',
      role: 'HOST',
      anonymity: 'NAMED',
    },
  });
  await prisma.attendee.create({
    data: {
      eventId: coffeeDate.id,
      userId: bob.id,
      status: 'GOING',
      role: 'ATTENDEE',
      anonymity: 'NAMED',
    },
  });
  console.log('  Created attendees for Coffee with Bob');

  // Bob is host of team lunch, Alice is invited
  await prisma.attendee.create({
    data: {
      eventId: teamLunch.id,
      userId: bob.id,
      status: 'GOING',
      role: 'HOST',
      anonymity: 'NAMED',
    },
  });
  await prisma.attendee.create({
    data: {
      eventId: teamLunch.id,
      userId: alice.id,
      status: 'INVITED',
      role: 'ATTENDEE',
      anonymity: 'NAMED',
    },
  });
  console.log('  Created attendees for Team Lunch');

  // Alice is sole attendee (host) of private event
  await prisma.attendee.create({
    data: {
      eventId: privateEvent.id,
      userId: alice.id,
      status: 'GOING',
      role: 'HOST',
      anonymity: 'NAMED',
    },
  });
  console.log('  Created attendee for Dentist Appointment');

  console.log('Seed completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
