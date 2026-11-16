/**
 * Start the Archon server on a throwaway home, to look at the console without touching a
 * real Archon install: `bun run dev:console [--port 3190] [--fresh]`.
 *
 * - The home is `.console-home/` in this checkout (gitignored), so the server uses SQLite
 *   there and never reads ~/.archon/.env or a DATABASE_URL.
 * - When ARCHON_FACTORY_LIVE_HOME names the live factory's home (its launcher sets it, so
 *   every factory agent has it), the database is seeded once with a read-only copy of that
 *   home's archon.db (`VACUUM INTO`), so the console shows the factory's real items and runs.
 *   `--fresh` takes a new copy. The live database is only ever opened read-only.
 * - It serves the built web UI (`bun run build:web` first) on the given port, default 3190.
 */
import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const port = portArg >= 0 ? Number(args[portArg + 1]) : 3190;
const fresh = args.includes('--fresh');

const root = resolve(import.meta.dir, '..');
const home = join(root, '.console-home');
const db = join(home, 'archon.db');
const live = process.env.ARCHON_FACTORY_LIVE_HOME;

if (fresh && existsSync(home)) rmSync(home, { recursive: true, force: true });
mkdirSync(home, { recursive: true });

if (live && !existsSync(db)) {
  const source = join(live, 'archon.db');
  if (existsSync(source)) {
    const src = new Database(source, { readonly: true });
    src.run(`VACUUM INTO '${db.replaceAll("'", "''")}'`);
    src.close();
    console.log(`Seeded ${db} from a read-only copy of the live factory database.`);
  }
}

const env: Record<string, string | undefined> = {
  ...process.env,
  ARCHON_HOME: home,
  PORT: String(port),
  DATABASE_URL: undefined,
  ARCHON_FACTORY_LIVE_SERVE: undefined,
};
delete env.DATABASE_URL;
delete env.ARCHON_FACTORY_LIVE_SERVE;

console.log(`Archon console on http://localhost:${port}/console (home ${home})`);
const child = Bun.spawn(['bun', 'packages/server/src/index.ts'], {
  cwd: root,
  env: env as Record<string, string>,
  stdio: ['inherit', 'inherit', 'inherit'],
});
process.exit(await child.exited);
