import { test as base, type Page } from '@playwright/test';

type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const timestamp = Date.now();
    const email = `e2e-${timestamp}@test.com`;
    const username = `e2e_user_${timestamp}`;
    const password = 'TestPass123!';

    // Register user
    const registerRes = await page.request.post('/api/v1/auth/register', {
      data: { email, username, password },
    });

    if (!registerRes.ok()) {
      throw new Error(`Registration failed: ${registerRes.status()}`);
    }

    // Login to get token
    const loginRes = await page.request.post('/api/v1/auth/login', {
      form: { username: email, password },
    });

    if (!loginRes.ok()) {
      throw new Error(`Login failed: ${loginRes.status()}`);
    }

    const { access_token } = await loginRes.json();

    // Inject token into localStorage
    await page.goto('/');
    await page.evaluate((token) => {
      localStorage.setItem('access_token', token);
    }, access_token);

    await use(page);
  },
});

export { expect } from '@playwright/test';
