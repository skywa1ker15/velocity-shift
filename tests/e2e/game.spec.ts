/**
 * End-to-end tests against the production build in a real browser.
 * Every test fails on any console error or uncaught exception.
 *
 * Headless browsers cannot grant pointer lock, so the tests set `__vsAllowUnlocked` (keyboard
 * input still goes through the real input path) and use the game's read-only debug handle.
 */
import { expect, test, type Page } from '@playwright/test';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('uncaught: ' + String(e)));
  await page.addInitScript(() => {
    (window as any).__vsAllowUnlocked = true;
  });
});

test.afterEach(() => {
  expect(errors, 'console errors:\n' + errors.join('\n')).toEqual([]);
});

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.title', { timeout: 90_000 });
  await page.evaluate(() => (window as any).__vs.updateSettings({ preset: 'low' })); // keep software rendering quick
  await page.click('.title');
  await page.waitForSelector('.menu');
}
const state = (page: Page) => page.evaluate(() => (window as any).__vs.debugState());
async function startLevel(page: Page, id: string) {
  await page.evaluate((l) => (window as any).__vs.loadLevel(l), id);
  await page.waitForSelector('.ready-card', { timeout: 90_000 });
  await page.click('.ready-card .primary');
  await page.waitForSelector('.hud');
}

test('boots to the title, then every menu screen opens and returns', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.logo').first()).toBeVisible();

  await page.click('text=Level Select');
  await expect(page.locator('.lv-card')).toHaveCount(9);
  await expect(page.locator('.lv-card.locked')).toHaveCount(7); // only training and level 1 start open
  await page.keyboard.press('Escape');

  await page.click('nav >> text=Settings');
  for (const tab of ['Graphics', 'Display', 'Controls', 'Comfort', 'Audio', 'Gameplay', 'Data']) {
    await page.click(`.tabs >> text=${tab}`);
    await expect(page.locator('.set-row').first()).toBeVisible();
  }
  await page.keyboard.press('Escape');

  await page.click('nav >> text=Controls');
  await expect(page.locator('.bind-row')).toHaveCount(14); // 12 movement / system actions + sword slash + draw/sheathe
  await page.keyboard.press('Escape');

  await page.click('text=Achievements');
  await expect(page.locator('.ach-item').first()).toBeVisible();
  await page.click('.tabs >> text=Cosmetics');
  await expect(page.locator('.cos').first()).toBeVisible();
  await page.click('.tabs >> text=Career');
  await expect(page.locator('.stat').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.click('text=Credits');
  await expect(page.locator('.credits')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toBeVisible();
});

test('play flow: load, move, pause, resume, restart, finish, results, retry', async ({ page }) => {
  await boot(page);
  await startLevel(page, 'training');
  expect((await state(page)).mode).toBe('playing');

  // real keyboard input moves the player and starts the timer
  const z0 = (await state(page)).pos[2];
  await page.keyboard.down('KeyW');
  await page.waitForFunction((z) => (window as any).__vs.debugState().pos[2] > z + 3, z0, {
    timeout: 30_000,
  });
  await page.keyboard.up('KeyW');
  expect((await state(page)).runTime).toBeGreaterThan(0);

  // a jump leaves the ground
  await page.evaluate(() => (window as any).__vs.debugAdvance(0.2, { jump: true }));
  expect((await state(page)).pos[1]).toBeGreaterThan(0.3);

  // pause and resume
  await page.keyboard.press('KeyP');
  await page.waitForSelector('.pause');
  const frozen = (await state(page)).runTime;
  await page.waitForTimeout(400);
  expect((await state(page)).runTime).toBe(frozen); // the simulation is fully frozen while paused
  await page.click('text=Resume');
  await page.waitForSelector('.pause', { state: 'detached' });

  // restart the level from the pause menu: timer back to zero, player back at the spawn
  await page.keyboard.press('KeyP');
  await page.click('text=Restart Level');
  await page.waitForSelector('.pause', { state: 'detached' });
  const s = await state(page);
  expect(s.runTime).toBe(0);
  expect(Math.abs(s.pos[2] + 3)).toBeLessThan(0.5);

  // put the player just before the finish line and walk through it
  await page.evaluate(() => {
    const g = (window as any).__vs;
    g.sim.player.reset(0, -6.9, 351, Math.PI);
    g.input.setLook(Math.PI, 0);
  });
  await page.keyboard.down('KeyW');
  await page.waitForSelector('.results', { timeout: 30_000 });
  await page.keyboard.up('KeyW');
  await expect(page.locator('.big-time')).toBeVisible();
  await expect(page.locator('.record')).toHaveText(/FIRST CLEAR/);
  await expect(page.locator('.splits tr.total')).toBeVisible();

  // retry goes straight back into a fresh run
  await page.click('.results footer >> text=Retry');
  await page.waitForSelector('.hud');
  expect((await state(page)).runTime).toBe(0);

  // and the pause menu returns to the main menu
  await page.keyboard.press('KeyP');
  await page.click('text=Return to Main Menu');
  await page.click('text=Yes, leave');
  await expect(page.locator('.menu')).toBeVisible();
});

test('progress and settings persist across a reload', async ({ page }) => {
  await boot(page);
  await page.click('nav >> text=Settings');
  await page.click('.tabs >> text=Display');
  await page.locator('input[type=range]').first().fill('110');
  await page.keyboard.press('Escape');

  await startLevel(page, 'training');
  await page.evaluate(() => {
    const g = (window as any).__vs;
    g.debugAdvance(0.5, { moveZ: 1 });
    g.sim.player.reset(0, -6.9, 351, Math.PI);
    g.input.setLook(Math.PI, 0);
  });
  await page.keyboard.down('KeyW');
  await page.waitForSelector('.results', { timeout: 30_000 });
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(600);

  await page.reload();
  await page.waitForSelector('.title', { timeout: 90_000 });
  const saved = await page.evaluate(() => {
    const d = (window as any).__vs.save.data;
    return {
      fov: d.settings.fov,
      best: d.levels.training?.best,
      completions: d.levels.training?.completions,
      ach: Object.keys(d.achievements),
    };
  });
  expect(saved.fov).toBe(110);
  expect(saved.best).toBeGreaterThan(0);
  expect(saved.completions).toBe(1);
  expect(saved.ach).toContain('first-steps');
});

test('all eight courses load, render and tick without errors', async ({ page }) => {
  test.setTimeout(480_000);
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true }));
  for (const id of [
    'awakening',
    'verticality',
    'momentum',
    'breakpoint',
    'inkfalls',
    'faceted',
    'blockfall',
    'core',
  ]) {
    await startLevel(page, id);
    await page.evaluate(() => (window as any).__vs.debugAdvance(1.5, { moveZ: 1 }));
    const s = await state(page);
    expect(s.level).toBe(id);
    expect(s.pos[2]).toBeGreaterThan(5);
    expect(s.render.calls).toBeGreaterThan(5);
    await page.evaluate(() => (window as any).__vs.quitToMenu());
    await page.waitForSelector('.menu');
  }
  // leaving a level releases its GPU resources: geometry count returns close to the menu baseline
  const a = (await state(page)).render.geometries;
  await startLevel(page, 'awakening');
  await page.evaluate(() => (window as any).__vs.quitToMenu());
  await page.waitForSelector('.menu');
  await page.waitForTimeout(300);
  const b = (await state(page)).render.geometries;
  expect(Math.abs(b - a)).toBeLessThanOrEqual(4);
});

test('rebinding a key works and conflicts are resolved', async ({ page }) => {
  await boot(page);
  await page.click('nav >> text=Controls');
  const dashRow = page.locator('.bind-row', { hasText: 'Dash' });
  await dashRow.locator('.key').first().click();
  await expect(dashRow.locator('.key.capturing')).toBeVisible();
  await page.keyboard.press('KeyF');
  await expect(dashRow.locator('.key').first()).toHaveText('F');
  // binding dash to the jump key removes it from jump
  await dashRow.locator('.key').nth(1).click();
  await page.keyboard.press('Space');
  const b = await page.evaluate(() => (window as any).__vs.save.data.bindings);
  expect(b.dash).toEqual(['KeyF', 'Space']);
  expect(b.jump).toEqual([]);
  await page.click('text=Reset to defaults');
  const d = await page.evaluate(() => (window as any).__vs.save.data.bindings);
  expect(d.jump).toEqual(['Space']);
  expect(d.dash).toEqual(['KeyQ', 'KeyE']);
});
