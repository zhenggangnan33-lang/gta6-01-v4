// VERDE BAY — the entry point (Node 22, standard library only). It hands
// the game in: copies game/ and screenshots/ from beside this file into the
// output directory and writes dossier.json, the summary the judge reads,
// using the vendored make.fun library. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The build is deterministic: the same repository always writes the same
// dossier bytes, because every file it copies is fixed and the dossier
// builder sorts and hashes them the same way each run.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps, from the kit's gate: the text budget shapes the
// dossier's bytes; the rest refuse an entry the scorer would refuse, so the
// build refuses first with a clear message instead of handing in a bad one.
const DOSSIER_TEXT_MAX = 163840;
const SHOT_MAX = 4;
const SHOT_MAX_BYTES = 262144;
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 50331648;
const GAME_PATH_MAX_BYTES = 1000;

function countGameFiles(dir, base) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      const sub = countGameFiles(full, `${base}/${name}`);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files++;
      bytes += st.size;
      if (Buffer.byteLength(`${base}/${name}`, 'utf8') > GAME_PATH_MAX_BYTES) {
        throw new Error(`game path too long: ${base}/${name}`);
      }
    }
  }
  return { files, bytes };
}

const gameDir = join(here, 'game');
const gameCount = countGameFiles(gameDir, 'game');
if (gameCount.files > GAME_MAX_FILES) throw new Error(`too many game files: ${gameCount.files}`);
if (gameCount.bytes > GAME_MAX_BYTES) throw new Error(`game too large: ${gameCount.bytes} bytes`);

const shotDir = join(here, 'screenshots');
const shotNames = existsSync(shotDir) ? readdirSync(shotDir).filter((n) => !n.startsWith('.')) : [];
if (shotNames.length > SHOT_MAX) throw new Error(`too many screenshots: ${shotNames.length}`);
for (const name of shotNames) {
  const size = statSync(join(shotDir, name)).size;
  if (size > SHOT_MAX_BYTES) throw new Error(`screenshot too large: ${name} (${size} bytes)`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: DOSSIER_TEXT_MAX,
    screenshots: { max: SHOT_MAX, max_bytes: SHOT_MAX_BYTES },
    game_max_files: GAME_MAX_FILES,
    game_max_bytes: GAME_MAX_BYTES,
    game_path_max_bytes: GAME_PATH_MAX_BYTES,
  }),
);
