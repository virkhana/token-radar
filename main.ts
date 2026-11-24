// Token radar, the entry: one program and the dashboard it writes.
//
// It reads the sealed snapshot (protocols from DefiLlama, frozen with the competition), scores every
// pre-token protocol with the model in lib/model.ts, and writes four things into the output directory:
//
//   board.json       the ranked board, ranks 1..N, every row with its farm plan
//   data.js          the same board as the page's dataset, so the page needs no server and no network
//   dashboard/       index.html, app.css and app.js: the static page the judge screenshots
//   dossier.json     the screenshots and the page's source, as vendor/makefun-board.ts writes them
//
// Nothing here is a snapshot of today's answers: the board is recomputed from whatever snapshot is
// mounted, so the next fetch of the protocol universe re-ranks the field on its own. Outside the
// grader's container the output directory is MAKEFUN_OUTPUT_DIR:
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's caps: the text cap shapes the dossier, the rest refuse an entry. */
const DOSSIER_TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** `--name <value>` or `--name=<value>` out of the arguments, else `fallback`. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

/** Stop with one line on stderr: a run the grader would refuse is better refused here. */
function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const input = arg('input', '/input');
const snapshotFile = input.endsWith('.json') ? input : join(input, 'snapshot.json');
if (!existsSync(snapshotFile)) {
  process.stderr.write(`token radar: no snapshot at ${snapshotFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const output = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(snapshotFile, 'utf8'));
const { rows, radar } = buildRadar(snapshot);
const issue = boardIssue(rows, snapshot);
if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`);

mkdirSync(output, { recursive: true });
writeFileSync(join(output, 'board.json'), `${JSON.stringify({ rows })}\n`);
writeFileSync(join(output, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping dot-names, and return what was copied. */
function copyDirectory(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const page = copyDirectory(join(ROOT, 'dashboard'), join(output, 'dashboard'));
if (!page.includes('index.html') || !page.some((f) => f.endsWith('.css')) || !page.some((f) => f.endsWith('.js'))) {
  fail('dashboard/ needs index.html, at least one .css and one .js file');
}

const shots = copyDirectory(join(ROOT, 'screenshots'), join(output, 'screenshots'));
if (shots.length < 3) fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in three, the board, a detail view and a filtered view`);
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
}

writeFileSync(
  join(output, 'dossier.json'),
  buildDossier(output, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
);

const usd = (n: number): string => `$${(n / 1_000_000).toFixed(1)}M`;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols read, ${snapshot.watchlist.length} on the watchlist, ${rows.length} rows scored\n` +
    `token radar: rank 1 ${rows[0]!.name} at ${usd(rows[0]!.implied_value_usd)} implied, ${radar.stats.early} early rows outside the watchlist\n` +
    `token radar: wrote board.json, data.js, dashboard/ (${page.length} files), screenshots/ (${shots.length}) and dossier.json\n`,
);
