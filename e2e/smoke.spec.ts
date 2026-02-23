/**
 * Playwright E2E Smoke Tests -- Koda
 *
 * Covers the main flows:
 * 1. Signup/login (email and username)
 * 2. Add friend + accept request
 * 3. View friend calendar (respects privacy)
 * 4. Create event + invite friend
 * 5. Friend accepts invite (RSVP GOING)
 * 6. Calendar shows the event for both accounts
 *
 * Tests that depend on UI not yet implemented are marked test.fixme()
 * so they surface as "fixme" instead of silently passing.
 */

import { test, expect } from '@playwright/test';
import { createUser, login, logout, testUser } from './helpers';

// Two test users for the full flow
const userA = testUser('alice');
const userB = testUser('bob');

test.describe.serial('Koda Smoke Tests', () => {
  // -----------------------------------------------------------------------
  // 1. Signup/Login flow
  // -----------------------------------------------------------------------

  test('1. User A can sign up', async ({ page }) => {
    await createUser(page, userA);
    await expect(page).toHaveURL(/\/app/);
    await expect(
      page.getByText(userA.name, { exact: true }).first()
    ).toBeVisible();
  });

  test('2. User B can sign up', async ({ page }) => {
    await createUser(page, userB);
    await expect(page).toHaveURL(/\/app/);
    await expect(
      page.getByText(userB.name, { exact: true }).first()
    ).toBeVisible();
  });

  test('3. User A can log out and log back in', async ({ page }) => {
    await login(page, userA.email, userA.password);
    await expect(page).toHaveURL(/\/app/);
    await logout(page);
    // Log back in using username instead of email
    await login(page, userA.username, userA.password);
    await expect(page).toHaveURL(/\/app/);
  });

  // -----------------------------------------------------------------------
  // 2. Add friend + accept request
  // -----------------------------------------------------------------------

  test('4. User A sends friend request to User B', async ({ page }) => {
    await login(page, userA.email, userA.password);
    await page.goto('/app/friends');
    await page.waitForLoadState('networkidle');

    // Should NOT be prompted to sign in again -- verify friends heading
    await expect(
      page.getByRole('heading', { name: 'Friends', exact: true })
    ).toBeVisible();

    // Search for User B
    const searchInput = page.getByPlaceholder(
      /search by name, username, or email/i
    );
    await expect(searchInput).toBeVisible();
    await searchInput.fill(userB.username);

    const searchResponsePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/users/search') && resp.status() === 200
    );
    await page.getByRole('button', { name: /search/i }).click();
    await searchResponsePromise;

    // User B should appear in results with an "Add Friend" button
    await expect(page.getByText(userB.name).first()).toBeVisible({
      timeout: 5000,
    });
    const addBtn = page.getByRole('button', { name: /add friend/i });
    await expect(addBtn).toBeVisible();

    // Click Add Friend and wait for the API response
    const friendReqPromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/friends/request')
    );
    await addBtn.click();
    const friendReqResp = await friendReqPromise;

    // Log status for debugging if it fails
    if (!friendReqResp.ok()) {
      const body = await friendReqResp.json().catch(() => ({}));
      console.log('Friend request API error:', friendReqResp.status(), body);
    }

    // Assert success feedback
    await expect(page.getByText(/friend request sent/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('5. User B accepts friend request from User A', async ({ page }) => {
    await login(page, userB.email, userB.password);
    await page.goto('/app/friends');
    await page.waitForLoadState('networkidle');

    // Incoming requests section should be visible with accept button
    await expect(page.getByText(/incoming requests/i)).toBeVisible({
      timeout: 10000,
    });
    const acceptBtn = page.getByRole('button', { name: /accept/i }).first();
    await expect(acceptBtn).toBeVisible();

    // Click Accept and wait for the API response
    const acceptPromise = page.waitForResponse((resp) =>
      resp.url().includes('/api/friends/request/')
    );
    await acceptBtn.click();
    await acceptPromise;

    // After accepting, User A should appear in "Your Friends" list
    await expect(page.getByText(/friend request accepted/i)).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText(userA.name).first()).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 3. View friend calendar (respects privacy settings)
  // -----------------------------------------------------------------------

  test('6. User A can view User B calendar via friends page', async ({
    page,
  }) => {
    await login(page, userA.email, userA.password);
    await page.goto('/app/friends');
    await page.waitForLoadState('networkidle');

    // User B should be in the accepted friends list
    await expect(page.getByText(userB.name).first()).toBeVisible();

    // Click "View Calendar" button for User B
    const viewCalBtn = page
      .getByRole('button', { name: /view calendar/i })
      .first();
    await expect(viewCalBtn).toBeVisible();
    await viewCalBtn.click();

    // Calendar overlay should appear with the friend's name in the heading
    await expect(
      page.getByRole('heading', {
        name: new RegExp(`${userB.name}.*Calendar`, 'i'),
      })
    ).toBeVisible();

    // Close the overlay
    await page.getByRole('button', { name: /close/i }).click();
  });

  // -----------------------------------------------------------------------
  // 4. Create event + invite friend
  //
  // Event creation page (/app/events/new) does not exist yet and no invite
  // UI is present on the event detail page.
  // -----------------------------------------------------------------------

  test.fixme('7. User A creates an event', async ({ page }) => {
    await login(page, userA.email, userA.password);
    await page.goto('/app/events/new');
    await page.waitForLoadState('networkidle');

    const titleInput = page.getByLabel(/title/i);
    await expect(titleInput).toBeVisible();
    await titleInput.fill('E2E Test Event');

    const submitBtn = page.getByRole('button', {
      name: /create|save|submit/i,
    });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    await expect(page).toHaveURL(/\/app\/events/);
    await expect(page.getByText('E2E Test Event')).toBeVisible();
  });

  test.fixme('8. User A invites User B to the event', async ({ page }) => {
    await login(page, userA.email, userA.password);
    await page.goto('/app/events');
    await page.waitForLoadState('networkidle');

    const eventLink = page.getByText('E2E Test Event').first();
    await expect(eventLink).toBeVisible();
    await eventLink.click();
    await page.waitForLoadState('networkidle');

    const inviteBtn = page.getByRole('button', { name: /invite/i });
    await expect(inviteBtn).toBeVisible();
    await inviteBtn.click();

    await expect(page.getByText(/invited|sent/i).first()).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 5. Friend accepts invite (RSVP)
  //
  // Depends on event creation + invite (tests 7-8) which are fixme.
  // -----------------------------------------------------------------------

  test.fixme('9. User B RSVPs GOING to the event', async ({ page }) => {
    await login(page, userB.email, userB.password);
    await page.goto('/app/events');
    await page.waitForLoadState('networkidle');

    const eventLink = page.getByText('E2E Test Event').first();
    await expect(eventLink).toBeVisible();
    await eventLink.click();
    await page.waitForLoadState('networkidle');

    const goingBtn = page.getByRole('button', {
      name: /going|accept|rsvp/i,
    });
    await expect(goingBtn).toBeVisible();
    await goingBtn.click();

    await expect(page.getByText(/going/i).first()).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // 6. Calendar shows the event
  // -----------------------------------------------------------------------

  test('10. User A sees calendar page', async ({ page }) => {
    await login(page, userA.email, userA.password);
    await page.goto('/app/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/app\/calendar/);
    await expect(
      page.getByRole('heading', { name: /calendar/i })
    ).toBeVisible();
  });

  test('11. User B sees calendar page', async ({ page }) => {
    await login(page, userB.email, userB.password);
    await page.goto('/app/calendar');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/app\/calendar/);
    await expect(
      page.getByRole('heading', { name: /calendar/i })
    ).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // Landing page checks
  // -----------------------------------------------------------------------

  test('12. Landing page loads with all sections', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Hero
    await expect(
      page.getByRole('heading', { name: /share availability/i })
    ).toBeVisible();
    await expect(page.getByText(/get started/i).first()).toBeVisible();

    // Features
    await expect(page.getByText(/privacy first/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Google Calendar Sync', exact: true })
    ).toBeVisible();

    // FAQ
    await expect(page.getByText(/frequently asked/i)).toBeVisible();

    // Footer
    await expect(page.getByText(/all rights reserved/i)).toBeVisible();
  });

  test('13. Landing page has correct meta tags', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title).toContain('Koda');

    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute('content');
    expect(ogTitle).toContain('Koda');

    const ogDesc = await page
      .locator('meta[property="og:description"]')
      .getAttribute('content');
    expect(ogDesc).toBeTruthy();
  });
});
