# Engineering rules for the factory console

What every change in this repository is held to, on top of `AGENTS.md` and
`.archon/engineering.md`. The factory's build, review and test stages read this file as the
project's policy (`.archon/packs/Wirasm.archon-software-factory.yaml`).

## The live factory shares this machine

The factory building this repository runs Archon from another checkout, on the home
`~/.archon-fc` (SQLite). Every agent it starts inherits `ARCHON_HOME` and
`ARCHON_FACTORY_LIVE_HOME` pointing there.

- **Never start an Archon server or CLI command that writes, on that home.** The server refuses
  to start on it. To see the console: `bun run build:web && bun run dev:console --port <free port>`.
  That serves on a throwaway home (`.console-home/`, gitignored) seeded once with a read-only copy
  of the live database and of its installed packs (`plugins/`), so real items, runs and the
  pack's workflows show. `--fresh` takes a new copy.
- Pick a free port (not 3090, 3190 or 8864, which are in use); check it first.
- Stop every server and browser you start before you finish. Kill by the PID you started, never by
  process name: other factories run on this machine.
- Tests already use scratch homes (`packages/web/bunfig.toml` preload). Keep it that way.

## Scope of a change

- No database migrations and no change to engine tables. New server code only reads.
- Keep factory code together: web under `packages/web/src/experiments/console/factory/`
  (components, pure `lib/`, the page routes), server under `packages/server/src/routes/api.factory.ts`
  plus a reader in `packages/core` or `packages/workflows` where the data access belongs. The
  declaration schemas live in `packages/workflows/src/schemas/factory-view.ts` (the view file)
  and `factory-overview.ts` (the overview file); both files are found by one reader,
  `packages/workflows/src/factory-pack-files.ts`. The server
  asks the change host through `packages/adapters/src/forge-host.ts`, which finds plugins
  through `@archon/forge/host-plugins` as the CLI's `archon forge` does.
- A new or changed server route regenerates the web API types: `bun run --cwd packages/server generate:api-types`
  (`check:api-types` fails CI otherwise). Two open changes that both add routes conflict in
  `api.generated.d.ts`; regenerate after rebasing rather than hand-merging it.
- Console token lint: arbitrary sizes need a `console-token-exception` comment with a reason;
  prefer the scale.
- The complexity ratchet (`bun run check:ratchet`) applies to touched functions and files: split a
  component rather than growing one past it.

## Proving a change

The declared validate command is the local check:

```
bun run validate --only generated-files,type-check,lint,format
bun run --cwd packages/web test
bun run --cwd packages/server test
bun run build:web
```

CI (`.github/workflows/ci.yml`) runs that set on every push, and more: the core, workflows, cli,
adapters, server and web suites on Linux (one runner per package, cli in three parts, one test
group at a time), and every test file that reads `ARCHON_TEST_PG_URL` against a Postgres it
starts. A test file that fails there is rerun once by itself and the log says `RETRIED <file>`; a
second failure fails CI. A pull request lists every file that needed a retry. A check need not
repeat any of it, and need not run whole suites on Windows, where the container and symlink tests
fail by design. A review or test check runs
the tests of the packages the change touches (`bun test <dir>` inside the package), and only when
it needs a comparison runs the same tests on the base. Running a whole package suite twice on
Windows costs most of an hour and finds nothing CI does not.

On top of that, anything a person sees is checked in a browser (DESIGN.md, Testing) and the pull
request says what was seen, at which size, with which data. A screenshot path is welcome; a claim
of "works" without having looked is not.

## Windows

This machine is Windows. Use Git Bash syntax in bash steps; paths with forward slashes. Bun is
1.4.2. `agent-browser` is on PATH and muted.
