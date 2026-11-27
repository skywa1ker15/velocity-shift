/**
 * Interface tests (Phase C): the HUD stays out of the first-person hand zone and never overlaps
 * itself, sword feedback follows the sword, the results card fits the window with nothing
 * floating over its statistics, and the menus lay out on small screens and work from the keyboard.
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

async function boot(page: Page, patch: Record<string, unknown> = {}) {
  await page.goto('/');
  await page.waitForSelector('.title', { timeout: 90_000 });
  await page.evaluate(
    (p) => (window as any).__vs.updateSettings({ preset: 'low', tutorials: false, ...p }),
    patch,
  );
  await page.click('.title');
  await page.waitForSelector('.menu');
}
async function startLevel(page: Page, id: string) {
  await page.evaluate((l) => (window as any).__vs.loadLevel(l), id);
  await page.waitForSelector('.ready-card', { timeout: 90_000 });
  await page.click('.ready-card .primary');
  await page.waitForSelector('.hud');
}

type Box = { x: number; y: number; w: number; h: number };
async function boxes(page: Page, selectors: string[]): Promise<Record<string, Box | null>> {
  return page.evaluate((sels) => {
    const out: Record<string, Box | null> = {};
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) {
        out[s] = null;
        continue;
      }
      const r = el.getBoundingClientRect();
      out[s] = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return out;
  }, selectors);
}
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const vp of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 600 },
]) {
  test(`HUD clears the hand zone and never overlaps itself at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page);
    await startLevel(page, 'training');
    await page.evaluate(() => (window as any).__vs.debugAdvance(1.5, { moveZ: 1 }));
    await page.waitForTimeout(300);

    const sels = ['.hud-tl', '.hud-tc', '.speed', '.dash', '.indicators', '.sword-chip'];
    const b = await boxes(page, sels);
    for (const s of sels) expect(b[s], s + ' is on screen').not.toBeNull();

    // the first-person hands fill the bottom-centre: no readout may sit there
    const hands: Box = { x: vp.width * 0.18, y: vp.height * 0.55, w: vp.width * 0.64, h: vp.height * 0.45 };
    for (const s of sels) expect(overlap(b[s]!, hands), s + ' overlaps the hand zone').toBe(false);

    // and the HUD's own pieces do not collide
    for (let i = 0; i < sels.length; i++)
      for (let j = i + 1; j < sels.length; j++) {
        if (sels[i] === '.hud-tr' || sels[j] === '.hud-tr') continue;
        expect(overlap(b[sels[i]]!, b[sels[j]]!), `${sels[i]} overlaps ${sels[j]}`).toBe(false);
      }
    // all of it inside the window
    for (const s of sels) {
      const r = b[s]!;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(vp.width + 0.5);
    }
  });
}

test('sword chip follows the sword; breaking an object shows the hit marker and a tally', async ({
  page,
}) => {
  await boot(page);
  await startLevel(page, 'awakening');
  await expect(page.locator('.sword-chip')).not.toHaveClass(/drawn/);
  await expect(page.locator('.sword-chip')).toContainText('STOWED');

  // X draws the blade by hand, X again sheathes it
  await page.evaluate(() => (window as any).__vs.debugAdvance(0.05, { sword: true }));
  await expect(page.locator('.sword-chip')).toHaveClass(/drawn/);
  await page.evaluate(() => (window as any).__vs.debugAdvance(0.6));
  await expect(page.locator('.sword-chip')).toContainText('DRAWN');
  await page.evaluate(() => (window as any).__vs.debugAdvance(0.05, { sword: true }));
  await page.evaluate(() => (window as any).__vs.debugAdvance(0.6));
  await expect(page.locator('.sword-chip')).toContainText('STOWED');

  // let the autopilot swing until something is cut
  await page.evaluate(() => {
    const g = (window as any).__vs;
    g.debugSlash = true;
    g.debugBot(null, 25);
    g.debugFrozen = false;
  });
  // the marker is an absolutely positioned, self-fading overlay: assert it is rendered, not its box
  await expect(page.locator('.hitmark')).toHaveClass(/cut|smash|bullseye/, { timeout: 10_000 });
  await expect(page.locator('.hitmark .call')).toContainText(/CUT|SMASH/);
  const tally = await page.locator('.sword-chip .tally b').innerText();
  expect(Number(tally)).toBeGreaterThan(0);
});

test('results: card fits the window, achievements sit inside it, nothing floats over the stats', async ({
  page,
}) => {
  await boot(page);
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
  // a pile of notifications arrives with the results
  await page.evaluate(() => {
    const g = (window as any).__vs;
    g.announce([
      { name: 'One', desc: 'First test achievement' },
      { name: 'Two', desc: 'Second test achievement' },
    ]);
  });
  await page.keyboard.press('Shift'); // any key skips the staged reveal
  await page.waitForTimeout(500);

  const card = (await boxes(page, ['.res-card']))['.res-card']!;
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.y + card.h).toBeLessThanOrEqual(720 + 0.5);
  const clipped = await page.evaluate(() => {
    const el = document.querySelector('.res-card') as HTMLElement;
    const body = document.querySelector('.res-body') as HTMLElement;
    return { card: el.scrollHeight - el.clientHeight, body: body.scrollHeight - body.clientHeight };
  });
  expect(clipped.card).toBeLessThanOrEqual(1);
  expect(clipped.body).toBeLessThanOrEqual(1);

  // achievement toasts are suppressed while the results card is up (they are listed inside it)
  const visibleMajor = await page.locator('.toast.major:visible').count();
  expect(visibleMajor).toBe(0);
  await expect(page.locator('.fresh-item').first()).toBeVisible(); // First Steps, a real one
  // any toast that is visible must not cover the card
  const toasts = await page.locator('.toast:visible').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
  for (const t of toasts) expect(overlap(t, card)).toBe(false);

  // the footer actions all exist; Next is offered because Awakening is open
  await expect(page.locator('.res-foot >> text=Retry')).toBeVisible();
  await expect(page.locator('.res-foot >> text=Next')).toBeEnabled();
  await expect(page.locator('.res-foot >> text=Level Select')).toBeVisible();
  await expect(page.locator('.res-foot >> text=Main Menu')).toBeVisible();
});

test('level select: locked cards say what unlocks them; arrows move focus; Escape goes back', async ({
  page,
}) => {
  await boot(page);
  await page.click('text=Level Select');
  await expect(page.locator('.lv-card')).toHaveCount(4);
  const locked = page.locator('.lv-card.locked');
  await expect(locked).toHaveCount(2);
  await expect(locked.nth(0)).toContainText('Finish THE AWAKENING to unlock');
  await expect(locked.nth(1)).toContainText('Finish VERTICALITY to unlock');
  await expect(locked.nth(0).locator('.lock')).toBeVisible();

  const first = page.locator('.lv-card').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.lv-card').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.menu')).toBeVisible();
});

for (const vp of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
]) {
  test(`menus lay out without horizontal overflow at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page);
    const noOverflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(await noOverflow()).toBe(true);
    const col = (await boxes(page, ['.menu-col']))['.menu-col']!;
    expect(col.x).toBeGreaterThanOrEqual(0);
    expect(col.x + col.w).toBeLessThanOrEqual(vp.width + 0.5);
    // every menu entry is reachable on screen (the column fits, or it scrolls as a page, never clips)
    await expect(page.locator('.menu-list .btn').last()).toBeVisible();
    await page.click('text=Level Select');
    await expect(page.locator('.lv-card').first()).toBeVisible();
    expect(await noOverflow()).toBe(true);
    await page.keyboard.press('Escape');
    await page.evaluate((l) => (window as any).__vs.loadLevel(l), 'awakening');
    await page.waitForSelector('.ready-card', { timeout: 90_000 });
    const ready = (await boxes(page, ['.ready-card']))['.ready-card']!;
    expect(ready.x + ready.w).toBeLessThanOrEqual(vp.width + 0.5);
    await expect(page.locator('.ready-card .primary')).toBeVisible();
  });
}

test('multiverse: a shift completes mid-run without touching the simulation or leaking resources', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const g = (window as any).__vs;
    g.mvSeed = 7;
  });
  await startLevel(page, 'awakening');
  const info = await page.evaluate(() => (window as any).__vs.multiverse.describe());
  expect(info.seed).toBe(7);
  expect(info.plan.shifts.length).toBeGreaterThan(0);
  expect(info.here).toBe(info.plan.home);

  // the same inputs with and without shifts must leave the player in exactly the same place
  const run = async (shift: boolean) =>
    page.evaluate(async (shift) => {
      const g = (window as any).__vs;
      g.restartLevel();
      g.multiverse.snap(g.multiverse.plan.home);
      g.debugAdvance(0.4, { moveZ: 1 });
      const others = g.multiverse.plan.shifts.map((s: any) => s.to);
      if (shift) g.debugShift(others[0]);
      g.debugAdvance(1.2, { moveZ: 1, jump: true });
      const p = g.sim.player;
      return [p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z, g.sim.runTime];
    }, shift);
  const plain = await run(false);
  const shifted = await run(true);
  expect(shifted).toEqual(plain);

  // let several shifts run to completion and check nothing accumulates
  const mem = () =>
    page.evaluate(() => {
      const s = (window as any).__vs.renderer.stats;
      return { geometries: s.geometries, textures: s.textures };
    });
  const before = await mem();
  const home = info.plan.home;
  const other = info.plan.shifts[0].to;
  for (let i = 0; i < 6; i++) {
    await page.evaluate((to) => (window as any).__vs.debugShift(to), i % 2 ? home : other);
    await page.waitForFunction(() => !(window as any).__vs.multiverse.describe().shifting, null, {
      timeout: 60_000,
    });
  }
  const after = await mem();
  expect(after.geometries).toBeLessThanOrEqual(before.geometries + 2);
  expect(after.textures).toBeLessThanOrEqual(before.textures + 2);
  expect((await page.evaluate(() => (window as any).__vs.multiverse.describe())).here).toBe(home);
});

test('multiverse: every universe renders on a level, and a shift between each pair of neighbours completes', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const g = (window as any).__vs;
    g.mvSeed = 3;
    g.multiverse.enabled = false; // drive the universes by hand
  });
  await startLevel(page, 'awakening');
  const ids: string[] = await page.evaluate(async () => {
    const g = (window as any).__vs;
    return g.universeIds();
  });
  expect(ids.length).toBeGreaterThanOrEqual(6);
  for (const id of ids) {
    await page.evaluate((u) => (window as any).__vs.multiverse.snap(u), id);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => (window as any).__vs.multiverse.describe().here)).toBe(id);
    expect(await page.evaluate(() => document.documentElement.dataset.universe)).toBe(id);
  }
  // chain shifts through the whole library; any shader error fails the test through the console check
  // (each shift uses the next transition kind, so all seven run)
  for (const [i, id] of ids.entries()) {
    await page.evaluate(([u, k]) => (window as any).__vs.debugShift(u, k), [id, i % 7] as const);
    await page.waitForFunction(
      () =>
        (window as any).__vs.multiverse.describe().blend > 0.9 ||
        !(window as any).__vs.multiverse.describe().shifting,
      null,
      {
        timeout: 60_000,
      },
    );
  }
});

test('multiverse: entering a universe is announced under the timer without covering the HUD or the hands', async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const g = (window as any).__vs;
    g.mvSeed = 5;
    g.multiverse.enabled = false;
  });
  await startLevel(page, 'training');
  await page.evaluate(() => (window as any).__vs.debugShift('neon', 0));
  const callout = page.locator('.callout.shift');
  await expect(callout).toContainText('Neon District', { timeout: 30_000 });
  const b = await boxes(page, ['.callout', '.hud-tc', '.hud-tl', '.speed', '.sword-chip']);
  for (const other of ['.hud-tc', '.hud-tl', '.speed', '.sword-chip'])
    expect(overlap(b['.callout']!, b[other]!), '.callout overlaps ' + other).toBe(false);
  const hands: Box = { x: 1280 * 0.18, y: 720 * 0.55, w: 1280 * 0.64, h: 720 * 0.45 };
  expect(overlap(b['.callout']!, hands)).toBe(false);
  // the theme follows the universe the camera is in
  expect(await page.evaluate(() => document.documentElement.dataset.universe)).toBe('neon');
  await expect(callout).toHaveCount(0, { timeout: 10_000 });
});
