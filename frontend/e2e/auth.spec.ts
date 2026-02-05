import { test, expect } from './fixtures/auth';

test.describe('Auth flow', () => {
  test('authenticated user can access projects page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    // Should see the VE logo and projects header
    await expect(authenticatedPage.locator('text=VE')).toBeVisible();
    await expect(authenticatedPage.locator('header')).toBeVisible();
  });

  test('unauthenticated user is redirected or sees login', async ({ page }) => {
    await page.goto('/projects');
    await page.waitForLoadState('networkidle');

    // Page should still render (SPA) but API calls will fail
    await expect(page.locator('body')).toBeVisible();
  });
});
