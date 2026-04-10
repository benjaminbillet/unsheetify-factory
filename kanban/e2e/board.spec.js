import { test, expect } from '@playwright/test';

// All tests run sequentially, sharing the same in-memory DB.
// Tests that assume an empty DB run first; later suites build on prior state.
test.describe.configure({ mode: 'serial' });

// ─── Board renders ────────────────────────────────────────────────────────────
test.describe('Board renders', () => {
  test('shows three column headers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ready' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'In Progress' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Done' })).toBeVisible();
  });

  test('shows No cards empty state when DB is empty', async ({ page }) => {
    await page.goto('/');
    // All three columns should show the empty state on a fresh in-memory DB
    await expect(page.getByText('No cards').first()).toBeVisible();
  });
});

// ─── Creating a card ──────────────────────────────────────────────────────────
test.describe('Creating a card', () => {
  test('toggle button opens the create card form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Add card' }).first().click();
    await expect(page.getByLabel('Title')).toBeVisible();
  });

  test('submitting creates a card in the Ready column', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '+ Add card' }).first().click();
    await page.getByLabel('Title').fill('My E2E Card');
    await page.getByRole('button', { name: 'Add card' }).click();
    // Card tile appears in the Ready column
    const readyColumn = page.getByRole('region', { name: 'Ready' });
    await expect(readyColumn.getByRole('button', { name: 'My E2E Card' })).toBeVisible();
  });

  test('created card persists after page reload', async ({ page }) => {
    // Assumes 'My E2E Card' was created in the previous test (serial mode)
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'My E2E Card' })).toBeVisible();
  });
});

// ─── Viewing a card ───────────────────────────────────────────────────────────
test.describe('Viewing a card', () => {
  test('clicking a card opens a modal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'My E2E Card' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

// ─── Editing a card ───────────────────────────────────────────────────────────
test.describe('Editing a card', () => {
  test('can update card title', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'My E2E Card' }).click();
    await page.getByLabel('Edit title').click();
    await page.getByLabel('Title').fill('Updated Title');
    await page.getByLabel('Save').click();
    // Modal stays open; board also reflects the new title
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Close').click();
    await expect(page.getByRole('button', { name: 'Updated Title' })).toBeVisible();
  });

  test('can update card assignee', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Updated Title' }).click();
    await page.getByLabel('Edit assignee').click();
    await page.getByLabel('Assignee').fill('Alice');
    await page.getByLabel('Save').click();
    // Assignee name now visible in the modal
    await expect(page.getByRole('dialog')).toContainText('Alice');
    await page.getByLabel('Close').click();
  });
});

// ─── Adding a comment ─────────────────────────────────────────────────────────
test.describe('Adding a comment', () => {
  test('can add a comment to a card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Updated Title' }).click();
    await page.getByLabel('Author name').fill('Tester');
    await page.getByLabel('Comment').fill('This is a test comment');
    // Button text is 'Add Comment' with capital C (from CommentList.jsx)
    await page.getByRole('button', { name: 'Add Comment' }).click();
    await expect(page.getByTestId('comment')).toBeVisible();
    await expect(page.getByTestId('comment')).toContainText('This is a test comment');
  });
});

// ─── Deleting a card ──────────────────────────────────────────────────────────
test.describe('Deleting a card', () => {
  test('can delete a card', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Updated Title' }).click();
    await page.getByLabel('Delete').click();
    await page.getByLabel('Confirm delete').click();
    // Modal closes and card is gone from the board
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Updated Title' })).not.toBeVisible();
  });
});
