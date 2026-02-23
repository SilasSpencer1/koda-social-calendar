/**
 * Playwright E2E test helpers.
 *
 * Provides utilities for creating test users, logging in, and cleanup.
 * Uses email+password credentials (not Google OAuth) to avoid OAuth flows.
 */

import type { Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// User management via API
// ---------------------------------------------------------------------------

/**
 * Create a test user via the signup page.
 */
export async function createUser(
  page: Page,
  opts: { name: string; email: string; password: string; username?: string }
): Promise<void> {
  await page.goto(`${BASE_URL}/signup`);
  await page.waitForLoadState('networkidle');

  // Fill signup form using element IDs from app/signup/page.tsx
  await page.locator('#name').fill(opts.name);
  await page
    .locator('#username')
    .fill(
      opts.username ?? opts.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_')
    );
  await page.locator('#email').fill(opts.email);
  await page.locator('#password').fill(opts.password);
  await page.locator('#confirmPassword').fill(opts.password);

  // Submit
  await page.getByRole('button', { name: /sign up with email/i }).click();

  // Wait for redirect to /app
  await page.waitForURL(/\/app/, { timeout: 15_000 });
}

/**
 * Log in an existing user.
 */
export async function login(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Fill login form using element IDs from app/login/page.tsx
  await page.locator('#identifier').fill(email);
  await page.locator('#password').fill(password);

  await page.getByRole('button', { name: /sign in$/i }).click();

  // Wait for redirect to /app
  await page.waitForURL(/\/app/, { timeout: 15_000 });
}

/**
 * Log out the current user.
 */
export async function logout(page: Page): Promise<void> {
  // Click sign out button in sidebar
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL(/\/(login)?$/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

let counter = 0;

export function uniqueEmail(prefix = 'e2e'): string {
  counter++;
  return `${prefix}_${Date.now()}_${counter}@test.koda.app`;
}

export function testUser(prefix = 'e2e') {
  const email = uniqueEmail(prefix);
  const username = `${prefix}_${Date.now()}_${counter}`;
  return {
    name: `Test ${prefix} ${counter}`,
    email,
    username,
    password: 'TestPassword123!',
  };
}
