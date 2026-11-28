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

async function boot(page: Page, mode: 'pure' | 'evolve' = 'pure') {
  await page.goto('/');
  await page.waitForSelector('.title', { timeout: 90_000 });
  // keep software rendering quick; the course tests below were written for Pure (the original
  // game), the Evolve tests at the end ask for Evolve
  await page.evaluate((m) => (window as any).__vs.updateSettings({ preset: 'low', gameMode: m }), mode);
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
  await expect(page.locator('.lv-card')).toHaveCount(10);
  await expect(page.locator('.lv-card.locked')).toHaveCount(8); // only training and level 1 start open
  await page.keyboard.press('Escape');

  await page.click('nav >> text=Settings');
  for (const tab of ['Graphics', 'Display', 'Controls', 'Comfort', 'Audio', 'Gameplay', 'Data']) {
    await page.click(`.tabs >> text=${tab}`);
    await expect(page.locator('.set-row').first()).toBeVisible();
  }
  await page.keyboard.press('Escape');

  await page.click('nav >> text=Controls');
  await expect(page.locator('.bind-row')).toHaveCount(15); // 12 movement / system actions + sword slash + draw/sheathe + Surge
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
    g.sim.player.reset(0, -12.9, 691, Math.PI);
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
    g.sim.player.reset(0, -12.9, 691, Math.PI);
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

test('all nine courses load, render and tick without errors', async ({ page }) => {
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
    'shiftpoint',
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

test("Phase G: holding W through Shift Point's wall run (real keyboard, real-time) lands on the wall and back down", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => ((window as any).__vsAllowUnlocked = true));
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'shiftpoint');
  // respawn at the checkpoint on the deck before the sideways field
  await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - 123) < 0.6);
    sim.restartFromCheckpoint();
  });
  const pl = () =>
    page.evaluate(() => {
      const p = (window as any).__vs.sim.player;
      const u = p.upAxis();
      return {
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        ux: u.x,
        uy: u.y,
        grounded: p.grounded,
        deaths: (window as any).__vs.sim.stats.deaths,
      };
    });
  await page.keyboard.down('KeyW');
  let onWall = false;
  let s = await pl();
  for (let i = 0; i < 3000 && s.z < 205 && s.deaths === 0; i++) {
    s = await pl();
    // standing on the wall: gravity turned sideways, feet on the wall face (x = 7.5)
    if (s.grounded && s.ux < -0.95 && Math.abs(s.x - 7.5) < 0.1) onWall = true;
  }
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  expect(onWall).toBe(true);
  expect(s.z).toBeGreaterThanOrEqual(205);
  // and gravity is ordinary again on the deck after it
  await page.waitForTimeout(500);
  s = await pl();
  expect(s.uy).toBeGreaterThan(0.99);
});

test("Level 3: holding W through Momentum's Roll (real keyboard, real-time) rides the quarter turn and comes out upright", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => ((window as any).__vsAllowUnlocked = true));
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'momentum');
  // respawn at the checkpoint on the deck before the channel
  await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - 500) < 0.6);
    sim.restartFromCheckpoint();
  });
  const pl = () =>
    page.evaluate(() => {
      const p = (window as any).__vs.sim.player;
      const u = p.upAxis();
      return {
        z: p.pos.z,
        ux: u.x,
        uy: u.y,
        grounded: p.grounded,
        deaths: (window as any).__vs.sim.stats.deaths,
      };
    });
  await page.keyboard.down('KeyW');
  let rolled = false;
  let s = await pl();
  for (let i = 0; i < 3000 && s.z < 592 && s.deaths === 0; i++) {
    s = await pl();
    // running on the channel's old wall: gravity turned a full quarter
    if (s.grounded && s.ux > 0.99 && s.z > 520 && s.z < 581) rolled = true;
  }
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  expect(rolled).toBe(true);
  expect(s.z).toBeGreaterThanOrEqual(592);
  await page.waitForTimeout(500);
  s = await pl();
  expect(s.uy).toBeGreaterThan(0.99);
});

test("Level 4: holding W through Breakpoint's overpass (real keyboard, real-time) runs its underside upside down", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => ((window as any).__vsAllowUnlocked = true));
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'breakpoint');
  await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - 580) < 0.6);
    sim.restartFromCheckpoint();
  });
  const pl = () =>
    page.evaluate(() => {
      const p = (window as any).__vs.sim.player;
      const u = p.upAxis();
      return {
        y: p.pos.y,
        z: p.pos.z,
        uy: u.y,
        grounded: p.grounded,
        deaths: (window as any).__vs.sim.stats.deaths,
      };
    });
  await page.keyboard.down('KeyW');
  let upsideDown = false;
  let s = await pl();
  for (let i = 0; i < 3000 && s.z < 668 && s.deaths === 0; i++) {
    s = await pl();
    if (s.grounded && s.uy < -0.99 && Math.abs(s.y + 10) < 0.2) upsideDown = true;
  }
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  expect(upsideDown).toBe(true);
  expect(s.z).toBeGreaterThanOrEqual(668);
  await page.waitForTimeout(500);
  s = await pl();
  expect(s.uy).toBeGreaterThan(0.99);
});

test("Level 5: holding W down Ink Falls' Cascade (real keyboard, real-time) rides the falling slabs to the bottom", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => ((window as any).__vsAllowUnlocked = true));
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'inkfalls');
  await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - 379) < 0.6);
    sim.restartFromCheckpoint();
  });
  const pl = () =>
    page.evaluate(() => {
      const p = (window as any).__vs.sim.player;
      return { y: p.pos.y, z: p.pos.z, grounded: p.grounded, deaths: (window as any).__vs.sim.stats.deaths };
    });
  await page.keyboard.down('KeyW');
  let s = await pl();
  let lowestOnSlab = 0;
  for (let i = 0; i < 3000 && s.z < 462 && s.deaths === 0; i++) {
    s = await pl();
    if (s.grounded && s.z > 399 && s.z < 455) lowestOnSlab = Math.min(lowestOnSlab, s.y);
  }
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  expect(s.z).toBeGreaterThanOrEqual(462);
  expect(lowestOnSlab).toBeLessThan(-40); // stood on slabs that had fallen 20 m and more
});

test("Level 6: Faceted's Crossing with the real keyboard (W held, Space at each gap) flips gravity 180° twice", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => ((window as any).__vsAllowUnlocked = true));
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'faceted');
  await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - 406) < 0.6);
    sim.restartFromCheckpoint();
  });
  const pl = () =>
    page.evaluate(() => {
      const p = (window as any).__vs.sim.player;
      const u = p.upAxis();
      return {
        x: p.pos.x,
        z: p.pos.z,
        ux: u.x,
        grounded: p.grounded,
        deaths: (window as any).__vs.sim.stats.deaths,
      };
    });
  await page.keyboard.down('KeyW');
  let s = await pl();
  let jumps = 0,
    onLeft = false,
    backOnRight = false;
  for (let i = 0; i < 3000 && s.z < 465 && s.deaths === 0; i++) {
    s = await pl();
    // a person presses Space as each gap comes up, several metres before it (any jump from the
    // checkpoint to the gap's edge crosses; reading the game from the browser is itself slow)
    if (s.grounded && ((jumps === 0 && s.z > 411) || (jumps === 1 && s.z > 435))) {
      await page.keyboard.press('Space');
      jumps++;
    }
    if (s.grounded && s.ux < -0.99 && s.x > 1.9) onLeft = true;
    if (onLeft && s.grounded && s.ux > 0.99 && s.x < -1.9 && s.z > 450) backOnRight = true;
  }
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  expect(onLeft).toBe(true);
  expect(backOnRight).toBe(true);
  expect(s.z).toBeGreaterThanOrEqual(465);
});

test("Level 7: holding W through Blockfall's Climb and Drop (real keyboard, real-time) runs up a face and down another", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => ((window as any).__vsAllowUnlocked = true));
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'blockfall');
  await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - 240) < 0.6);
    sim.restartFromCheckpoint();
  });
  const pl = () =>
    page.evaluate(() => {
      const p = (window as any).__vs.sim.player;
      const u = p.upAxis();
      return {
        y: p.pos.y,
        z: p.pos.z,
        uz: u.z,
        grounded: p.grounded,
        deaths: (window as any).__vs.sim.stats.deaths,
      };
    });
  await page.keyboard.down('KeyW');
  let s = await pl();
  let up = false,
    down = false;
  for (let i = 0; i < 3000 && s.z < 316 && s.deaths === 0; i++) {
    s = await pl();
    if (s.grounded && s.uz < -0.99 && s.y > 8 && s.y < 18) up = true; // running up the Climb's face
    if (s.grounded && s.uz > 0.99 && s.y > 2 && s.y < 18) down = true; // running down the Drop's face
  }
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  expect(up).toBe(true);
  expect(down).toBe(true);
  expect(s.z).toBeGreaterThanOrEqual(316);
});

test("Level 8: holding W through Corrupted Core's Breach (real keyboard, real-time): launch, ceiling, fall", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => ((window as any).__vsAllowUnlocked = true));
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'core');
  await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - 258) < 0.6);
    sim.restartFromCheckpoint();
  });
  const pl = () =>
    page.evaluate(() => {
      const p = (window as any).__vs.sim.player;
      const u = p.upAxis();
      return {
        y: p.pos.y,
        z: p.pos.z,
        uy: u.y,
        grounded: p.grounded,
        deaths: (window as any).__vs.sim.stats.deaths,
      };
    });
  await page.keyboard.down('KeyW');
  let s = await pl();
  let ceiling = false;
  for (let i = 0; i < 3000 && s.z < 336 && s.deaths === 0; i++) {
    s = await pl();
    if (s.grounded && s.uy < -0.99 && Math.abs(s.y - 20) < 0.3) ceiling = true;
  }
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  expect(ceiling).toBe(true);
  expect(s.z).toBeGreaterThanOrEqual(336);
  expect(s.y).toBeCloseTo(-18, 0);
});

test("Level 9: holding W through Shift Point's Barrel Roll and Grand Climb (real keyboard, real-time)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => ((window as any).__vsAllowUnlocked = true));
  await boot(page);
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'shiftpoint');
  await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - 746) < 0.6);
    sim.restartFromCheckpoint();
  });
  const pl = () =>
    page.evaluate(() => {
      const p = (window as any).__vs.sim.player;
      const u = p.upAxis();
      return {
        y: p.pos.y,
        z: p.pos.z,
        uy: u.y,
        uz: u.z,
        grounded: p.grounded,
        deaths: (window as any).__vs.sim.stats.deaths,
      };
    });
  await page.keyboard.down('KeyW');
  let s = await pl();
  let inverted = false,
    face = false;
  for (let i = 0; i < 4000 && s.z < 900 && s.deaths === 0; i++) {
    s = await pl();
    if (s.grounded && s.uy < -0.99 && s.z > 766 && s.z < 880) inverted = true; // upside down in the roll
    if (s.grounded && s.uz < -0.99 && s.y > 20) face = true; // high on the 20 m face
  }
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  expect(inverted).toBe(true);
  expect(face).toBe(true);
  expect(s.z).toBeGreaterThanOrEqual(900);
  expect(s.y).toBeCloseTo(34, 0);
});

// ----- Evolve ------------------------------------------------------------------------------
async function evolveTraining(page: Page, cpZ: number) {
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await startLevel(page, 'training');
  await page.evaluate((z) => {
    const sim = (window as any).__vs.sim;
    sim.checkpoint = sim.data.checkpoints.findIndex((c: { p: number[] }) => Math.abs(c.p[2] - z) < 0.6);
    sim.restartFromCheckpoint();
  }, cpZ);
}
const evoState = (page: Page) =>
  page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    const e = sim.evo;
    return {
      z: sim.player.pos.z,
      deaths: sim.stats.deaths,
      taken: e.items.map((i: { kind: string; taken: boolean }) => i.kind + (i.taken ? '+' : '-')),
      flux: e.flux,
      levels: e.totalLevels,
      world: e.worldScale,
      surge: e.surgeLeft,
    };
  });

test('Evolve (real keyboard): in the Training gym, running catches Glints, C under the arch catches the Undertow and Space over the gap catches the Skyknot', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await boot(page, 'evolve');
  await evolveTraining(page, 362);
  expect(await page.evaluate(() => (window as any).__vs.sim.evo !== null)).toBe(true);
  // a person presses each key a little before the obstacle; the page tells us when we get there
  const reach = (z: number) =>
    page.waitForFunction((zz) => (window as any).__vs.sim.player.pos.z > zz, z, {
      timeout: 60_000,
      polling: 'raf',
    });
  await page.keyboard.down('KeyW');
  await reach(387);
  await page.keyboard.down('KeyC'); // slide under the arch
  await reach(394);
  await page.keyboard.up('KeyC');
  await reach(396.5);
  await page.keyboard.press('Space'); // jump the gap
  await reach(406);
  const s = await evoState(page);
  await page.keyboard.up('KeyW');
  expect(s.deaths).toBe(0);
  const taken = s.taken as string[];
  expect(taken.filter((t) => t === 'glint+')).toHaveLength(5);
  expect(taken).toContain('undertow+');
  expect(taken).toContain('skyknot+');
  expect(s.flux).toBeGreaterThan(15);
  expect(s.levels).toBe(2);
  await expect(page.locator('.evo-meters .flux')).toBeVisible();
  await expect(page.locator('.evo-rail .ab')).toHaveCount(2);
});

test('Evolve (real keyboard): V triggers Surge, which spends Flux and slows the world while the HUD counts it down', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await boot(page, 'evolve');
  await evolveTraining(page, 546);
  // setup through the debug handle: the Timeslip ability and enough Flux to spend
  await page.evaluate(() => {
    const e = (window as any).__vs.sim.evo;
    e.grant('timeslip');
    e.addFlux(40);
  });
  const before = await evoState(page);
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(400);
  const s = await evoState(page);
  expect(s.surge).toBeGreaterThan(0);
  expect(s.world).toBeLessThan(0.6);
  expect(s.flux).toBeLessThan(before.flux - 25);
  await expect(page.locator('.evo-meters .tm.surge')).toBeVisible();
  await page.waitForTimeout(3000);
  expect((await evoState(page)).world).toBe(1);
});

test('the ready card switches between Evolve and Pure: a Pure run has no collectibles and no Evolve HUD', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await boot(page, 'evolve');
  await page.evaluate(() => (window as any).__vs.updateSettings({ unlockAll: true, tutorials: false }));
  await page.evaluate(() => (window as any).__vs.loadLevel('awakening'));
  await page.waitForSelector('.ready-card', { timeout: 90_000 });
  await expect(page.locator('.mode-pick .mode.on')).toContainText('Evolve');
  expect(await page.evaluate(() => (window as any).__vs.sim.evo.items.length)).toBeGreaterThan(10);
  await page.click('.mode-pick >> text=Pure');
  await page.waitForFunction(
    () => (window as any).__vs.mode === 'ready' && (window as any).__vs.sim?.evo === null,
    null,
    {
      timeout: 90_000,
    },
  );
  await expect(page.locator('.mode-pick .mode.on')).toContainText('Pure');
  expect(await page.evaluate(() => (window as any).__vs.settings.gameMode)).toBe('pure');
  await page.click('.ready-card .primary');
  await page.waitForSelector('.hud');
  await expect(page.locator('.evo-meters')).toHaveCount(0);
  await expect(page.locator('.evo-rail')).toHaveCount(0);
});

test('Evolve (real keyboard): slashing on the run through the slashable world builds a Kinetic Chain, clears a Spindle gate and never slows the runner', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await boot(page, 'evolve');
  await evolveTraining(page, 660);
  const kinds = await page.evaluate(() =>
    (window as any).__vs.sim.data.breakables.map((b: { kind: string }) => b.kind),
  );
  for (const k of ['prism', 'lantern', 'bloom', 'spindle', 'sentinel', 'seal']) expect(kinds).toContain(k);
  await page.evaluate(() => {
    const e = (window as any).__vs.sim.evo;
    (window as any).__gates = 0;
    e.events.on('gate', (g: { cleared: boolean }) => g.cleared && (window as any).__gates++);
  });
  // a runner whose blade has evolved (Edge 2: Crescent, Reach 1) holds forward and keeps slashing
  await page.evaluate(() => {
    const e = (window as any).__vs.sim.evo;
    e.grant('edge');
    e.grant('edge');
    e.grant('reach');
  });
  await page.keyboard.down('KeyW');
  let minSpeed = 99;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(50);
    const s = await page.evaluate(() => {
      const sim = (window as any).__vs.sim;
      return { z: sim.player.pos.z, v: sim.player.speed };
    });
    if (s.z > 664 && s.z < 690) minSpeed = Math.min(minSpeed, s.v);
    if (s.z > 692) break;
  }
  await page.keyboard.up('KeyW');
  const r = await page.evaluate(() => {
    const sim = (window as any).__vs.sim;
    const bs = sim.data.breakables as { kind: string }[];
    return {
      spindles: bs.filter((b, i) => b.kind === 'spindle' && sim.broken[i]).length,
      peak: sim.evo.peakStreak,
      gates: (window as any).__gates,
      cuts: sim.stats.cuts,
    };
  });
  expect(r.spindles).toBe(3);
  expect(r.gates).toBe(1);
  expect(r.peak).toBeGreaterThanOrEqual(3);
  // slashing never stopped the run
  expect(minSpeed).toBeGreaterThan(6);
  await expect(page.locator('.evo-meters .streak')).toBeVisible();
});
