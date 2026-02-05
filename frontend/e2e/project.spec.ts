import { test, expect } from './fixtures/auth';

test.describe('Project CRUD', () => {
  test('create a new project and navigate to editor', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/projects');
    await authenticatedPage.waitForLoadState('networkidle');

    const projectName = `Test Project ${Date.now()}`;

    // Fill in project name
    const input = authenticatedPage.locator('input[type="text"]');
    await input.fill(projectName);

    // Click create button
    const createButton = authenticatedPage.locator('button', { hasText: /new|新增/ });
    await createButton.click();

    // Should navigate to editor
    await authenticatedPage.waitForURL(/\/editor\/\d+/);

    // Editor should render with header, sidebar, timeline
    await expect(authenticatedPage.locator('text=VE')).toBeVisible();
    await expect(authenticatedPage.locator('text=+ ')).toBeVisible(); // Add Track button
  });
});
