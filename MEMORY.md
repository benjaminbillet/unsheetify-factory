# Memory

## Product Overview

- 2026-04-07: `unsheetify-factory` is a monorepo of agents under `agents/`. First agent is `prd-to-tasks`.

## Architecture

- 2026-04-07: `agents/prd-to-tasks` is a standalone npm package (ESM, TypeScript via tsx). It shells out to the `task-master-ai` CLI in a temp directory to run a 3-step pipeline: `parse-prd` → `analyze-complexity` → `expand --all`. Output is the enriched `tasks.json` printed to stdout.

## Decisions

- 2026-04-07: Use `task-master-ai` (open-source) over `@taskmasterai/cli` (proprietary). Shell out to the CLI rather than importing internals (no public programmatic API).
- 2026-04-07: Use npm + tsx (not Bun) as the runtime. No build step needed.
- 2026-04-07: Use `commander` for named CLI flags (`--input`, `--anthropic-key`).
- 2026-04-07: Run task-master in an isolated temp directory to avoid polluting the caller's project. Cleanup happens in a `finally` block.

## Workarounds

## Known Issues

## User Preferences

- 2026-04-07: Prefer npm + tsx over Bun. Prefer named CLI arguments (commander) over positional args.
