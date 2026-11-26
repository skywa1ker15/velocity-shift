# Assets and licences

VELOCITY: SHIFT ships **no third-party art, audio or model files**.

| What | Source | Licence |
|---|---|---|
| All geometry (levels, scenery, the player's body) | Generated in code at runtime (`src/levels`, `src/render`, `src/character`) | Project licence |
| All materials and shaders (sky, world surfaces, effects) | Written for this project (`src/render`, `src/fx`) | Project licence |
| All sound effects and music | Synthesised at runtime with the Web Audio API (`src/audio/AudioEngine.ts`) | Project licence |
| Favicon | Drawn for this project (`public/favicon.svg`) | Project licence |
| Typeface: Unbounded | `@fontsource/unbounded` (npm) | SIL Open Font License 1.1 |
| Typeface: Chakra Petch | `@fontsource/chakra-petch` (npm) | SIL Open Font License 1.1 |
| Typeface: JetBrains Mono | `@fontsource/jetbrains-mono` (npm) | SIL Open Font License 1.1 |

## Libraries (bundled in the build)

| Library | Licence |
|---|---|
| three.js | MIT |
| postprocessing (pmndrs) | Zlib |
| Rapier (`@dimforge/rapier3d-compat`) | Apache-2.0 |
| React, React DOM | MIT |
| Zustand | MIT |

Development-only tools (Vite, TypeScript, Vitest, Playwright, ESLint, Prettier, lil-gui) are not shipped to players.
