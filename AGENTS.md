# AGENTS.md

## Cursor Cloud specific instructions

This is a vanilla TypeScript + Vite browser game with zero production dependencies. There is no backend, database, or external service—all game state lives in-memory in the browser.

### Quick reference

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (serves at `http://localhost:5173`) |
| Type-check + build | `npm run build` (`tsc && vite build`) |
| Preview prod build | `npm run preview` |
| Regen card art | `npm run cards:placeholders` |

### Notes

- There is no test framework configured; correctness is verified via `npm run build` (TypeScript strict compilation) and manual browser testing.
- The UI is entirely in Brazilian Portuguese (pt-BR).
- The game supports "vs CPU" mode (basic AI) — click **Jogar vs CPU1** on the main menu to start a match.
- Card data lives in `public/data/cards.json`; SVG placeholder art is in `public/cards/`.
- No linter is configured; use `tsc` (via `npm run build`) as the primary static-analysis check.
