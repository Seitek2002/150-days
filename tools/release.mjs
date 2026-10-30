/**
 * Publishes a version on GitHub (repository Seitek2002/150-days):
 *   1) the project code — as a new snapshot on top of the main branch on GitHub (the local history is not changed and does
 *      not leave this computer: its old commits contain screenshots and reference data from the Fallout copy);
 *      docs/ and CLAUDE.md (local notes) are left out of the snapshot; README.md must be committed;
 *   2) release v<version> with the patches from the "patches" folder (run npm run patch first).
 * Before publishing, every published text file is checked for Cyrillic (tools/cyrillic-guard.mjs): only the game's
 * Russian translation may contain it.
 * Run: npm run release -- "what's new, in a couple of sentences" — the notes are English only;
 * npm run release -- --fresh "..." replaces the whole GitHub history with this one snapshot (no parent, force push):
 *   a one-time clean start.
 *   In the notes a line break is written as "\n" (two characters).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATCH_DIR } from './patch.mjs';
import { findCyrillic } from './cyrillic-guard.mjs';

const REPO = 'Seitek2002/150-days';
const REMOTE_URL = `https://github.com/${REPO}.git`;
const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const run = (cmd, args, input, env) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', input, env }).trim();
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
/** Local notes that are not published: everything under docs/ and CLAUDE.md. */
const isLocalOnly = (f) => f.startsWith('docs/') || f === 'CLAUDE.md';

const patches = ['windows', 'mac'].map((platform) => path.join(PATCH_DIR, `150-Days-update-${version}-${platform}.zip`));
for (const file of patches) if (!fs.existsSync(file)) fail(`Missing patch ${path.basename(file)}: run npm run patch first`);
if (run('git', ['status', '--porcelain', '--untracked-files=no'])) fail('There are uncommitted changes: commit first.');
const tag = `v${version}`;
let exists = true;
try {
  run('gh', ['release', 'view', tag, '--repo', REPO]);
} catch {
  exists = false;
}
if (exists) fail(`Release ${tag} already exists: bump the version in package.json.`);

// Code snapshot: the current commit's tree without the local notes, on top of main on GitHub. Nothing foreign
// (screenshots, reference data) may be in it.
const files = run('git', ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n').filter((f) => f && !isLocalOnly(f));
if (!files.includes('README.md')) fail('README.md is not committed: it is the front page of the GitHub repository.');
const banned = files.filter((f) => /^(docs\/img|docs\/data|\.local)\//.test(f) || /\.(frm|acm|mve|dat|msg|int)$/i.test(f));
if (banned.length) fail('The project has files that do not belong on GitHub:\n' + banned.join('\n'));
// Nothing in Russian outside the game's translation (the working tree equals HEAD: checked above).
const cyrillic = findCyrillic(root, files);
if (cyrillic.length) fail(`Cyrillic outside the Russian translation (${cyrillic.length} lines):\n` + cyrillic.join('\n'));

// "\n" in the text is a line break: npm on Windows cuts a real line break in an argument.
const fresh = process.argv.includes('--fresh');
const notes = process.argv.slice(2).filter((a) => a !== '--fresh').join(' ').replace(/\\n/g, '\n').trim() || `Update to version ${version}.`;
// The published tree: HEAD without the local notes, built in a temporary index (the real index is not touched).
const index = path.join(os.tmpdir(), `150days-release-${process.pid}.index`);
const env = { ...process.env, GIT_INDEX_FILE: index };
let tree;
try {
  run('git', ['read-tree', 'HEAD'], undefined, env);
  run('git', ['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', 'docs', 'CLAUDE.md'], undefined, env);
  tree = run('git', ['write-tree'], undefined, env);
} finally {
  fs.rmSync(index, { force: true });
}
// --fresh: no parent, and the push replaces main on GitHub (the old history is gone from the branch).
const parents = fresh ? [] : (run('git', ['fetch', REMOTE_URL, 'main']), ['-p', run('git', ['rev-parse', 'FETCH_HEAD'])]);
const commit = run('git', ['commit-tree', tree, ...parents, '-F', '-'], `Version ${version}\n\n${notes}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`);
run('git', ['push', ...(fresh ? ['--force'] : []), REMOTE_URL, `${commit}:refs/heads/main`]);
console.log(`Code published: ${commit.slice(0, 7)}`);

run('gh', ['release', 'create', tag, ...patches, '--repo', REPO, '--target', 'main', '--title', `Version ${version}`, '--notes', notes]);
console.log(`Release: https://github.com/${REPO}/releases/tag/${tag}`);
