/** Shared helper: run the bot on a level and log what happened (used while authoring levels). */
import { Simulation } from '../../src/gameplay/Simulation';
import { Bot } from '../../src/gameplay/Bot';
import { initPhysics } from '../../src/physics/PhysicsWorld';
import { levelById } from '../../src/levels/registry';
import { moveStateNames } from '../../src/movement/types';

export async function botRun(id: string, maxSeconds = 300, verbose = false) {
  await initPhysics();
  const entry = levelById(id)!;
  const data = (await entry.load()).build();
  const sim = new Simulation(entry.meta, data);
  const bot = new Bot(sim);
  const log: string[] = [];
  const pl = sim.player;
  sim.events.on('death', (d) =>
    log.push(
      `DEATH ${d.reason} t=${sim.runTime.toFixed(2)} at (${pl.pos.x.toFixed(1)}, ${pl.pos.y.toFixed(1)}, ${pl.pos.z.toFixed(1)}) wp=${bot.index} state=${moveStateNames[pl.state]} spd=${pl.speed.toFixed(1)}`,
    ),
  );
  sim.events.on('checkpoint', (c) => log.push(`checkpoint ${c.index} t=${c.time.toFixed(2)}`));
  let lastWp = -1;
  const max = Math.round(maxSeconds * 120);
  let t = 0;
  for (; t < max && !sim.stats.finished && sim.stats.deaths < 12; t++) {
    sim.tick(bot.step());
    if (verbose && bot.index !== lastWp) {
      lastWp = bot.index;
      log.push(
        `  wp ${bot.index} t=${sim.runTime.toFixed(2)} pos (${pl.pos.x.toFixed(1)}, ${pl.pos.y.toFixed(1)}, ${pl.pos.z.toFixed(1)}) spd=${pl.speed.toFixed(1)} ${moveStateNames[pl.state]}`,
      );
    }
    if (bot.stuckTicks > 120 * 20) {
      log.push(
        `STUCK at wp ${bot.index} pos (${pl.pos.x.toFixed(1)}, ${pl.pos.y.toFixed(1)}, ${pl.pos.z.toFixed(1)}) state=${moveStateNames[pl.state]}`,
      );
      break;
    }
  }
  const st = sim.stats;
  log.push(
    `RESULT ${id}: finished=${st.finished} time=${sim.runTime.toFixed(2)} deaths=${st.deaths} wp=${bot.index}/${data.bot.length} top=${st.topSpeed.toFixed(1)} avg=${(st.speedSum / Math.max(1, st.ticks)).toFixed(1)} dashes=${st.dashes} wallRuns=${st.wallRuns} slides=${st.slides} vaults=${st.vaults}`,
  );
  return { sim, log, finished: st.finished, deaths: st.deaths, time: sim.runTime };
}
