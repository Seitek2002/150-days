/**
 * Release guard: nothing in Cyrillic on GitHub except the game's Russian translation.
 * Cyrillic is allowed only inside string literals (quotes, template literals, regex literals) and only in:
 *   src/i18n.ts, src/game/text-fixes.ts, files under tests/, lines with a `ru:` field, and lines of
 *   src/world/block-catalog.ts that call a RU/EN pair helper (a Cyrillic literal followed by another literal).
 * Cyrillic in comments, in code outside literals, or in literals anywhere else is reported as file:line.
 * Non-code files (Markdown, text, HTML, …) may not contain Cyrillic at all, except under tests/ (test data).
 * A code line that must hold Cyrillic data elsewhere (a font's letter table, a match against Russian file names) can be
 * marked with the comment `// cyrillic-ok: <reason in English>` at its end.
 * Run on its own: node tools/cyrillic-guard.mjs — checks the files `git ls-files` lists (as the release would).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CYRILLIC = /[\u0400-\u04FF]/;
const CODE = /\.(ts|tsx|js|mjs|cjs|jsx|json)$/i;
const LITERAL_FILES = new Set(['src/i18n.ts', 'src/game/text-fixes.ts']);
const PAIR_FILE = 'src/world/block-catalog.ts';
/** After these characters (or at the start of a line, or after these words) a "/" starts a regex literal, not a division. */
const REGEX_BEFORE = /[(,=:[!&|?{};+\-*%<>~^]$/;
const REGEX_WORDS = /\b(return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/;

/**
 * Splits the lines of a JS/TS source into tokens per line: literals (strings, template literals, regex literals) and
 * everything else (code and comments). State (template literal, block comment) carries over between lines.
 * Returns for each line: { code, comment, literals: [{ text, end }] } — code without literals, whether it is a comment
 * line, and the literal texts with the position right after each one in the line.
 */
export function tokenizeLines(lines) {
  const out = [];
  // Stack of open contexts: 'template' or { expr: braceDepth } for ${ … } inside a template.
  const stack = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const result = { code: '', comment: inBlock || trimmed.startsWith('//') || trimmed.startsWith('*') || line.includes('/*'), literals: [] };
    let literal = null; // text of a literal that started on this line or carried over
    let i = 0;
    if (stack[stack.length - 1] === 'template') literal = '';
    while (i < line.length) {
      const c = line[i];
      const top = stack[stack.length - 1];
      if (inBlock) {
        if (line.startsWith('*/', i)) {
          inBlock = false;
          i += 2;
        } else {
          result.code += c;
          i++;
        }
        continue;
      }
      if (top === 'template') {
        if (c === '\\') {
          literal += line.slice(i, i + 2);
          i += 2;
        } else if (c === '`') {
          stack.pop();
          result.literals.push({ text: literal, end: i + 1 });
          literal = null;
          i++;
        } else if (line.startsWith('${', i)) {
          result.literals.push({ text: literal, end: i });
          literal = null;
          stack.push({ expr: 0 });
          i += 2;
        } else {
          literal += c;
          i++;
        }
        continue;
      }
      // Code (top level or inside ${ … }).
      if (line.startsWith('//', i)) {
        result.code += line.slice(i);
        result.comment = true;
        break;
      }
      if (line.startsWith('/*', i)) {
        inBlock = true;
        result.comment = true;
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") {
        let j = i + 1;
        let text = '';
        while (j < line.length && line[j] !== c) {
          if (line[j] === '\\') {
            text += line.slice(j, j + 2);
            j += 2;
          } else text += line[j++];
        }
        result.literals.push({ text, end: j + 1 });
        i = j + 1;
        continue;
      }
      if (c === '`') {
        stack.push('template');
        literal = '';
        i++;
        continue;
      }
      if (c === '/') {
        const before = line.slice(0, i).trimEnd();
        if (before === '' || REGEX_BEFORE.test(before) || REGEX_WORDS.test(before)) {
          let j = i + 1;
          let text = '';
          let inClass = false;
          while (j < line.length && (line[j] !== '/' || inClass)) {
            if (line[j] === '\\') {
              text += line.slice(j, j + 2);
              j += 2;
              continue;
            }
            if (line[j] === '[') inClass = true;
            else if (line[j] === ']') inClass = false;
            text += line[j++];
          }
          if (j < line.length) {
            while (j + 1 < line.length && /[a-z]/i.test(line[j + 1])) j++;
            result.literals.push({ text, end: j + 1 });
            i = j + 1;
            continue;
          }
        }
      }
      if (top && typeof top === 'object') {
        if (c === '{') top.expr++;
        else if (c === '}') {
          if (top.expr === 0) {
            stack.pop();
            literal = '';
            i++;
            continue;
          }
          top.expr--;
        }
      }
      result.code += c;
      i++;
    }
    if (literal !== null && stack[stack.length - 1] === 'template') result.literals.push({ text: literal, end: line.length });
    out.push(result);
  }
  return out;
}

/** Whether the Cyrillic literals of a block-catalog line are the RU half of a RU/EN pair: a call, literal, comma, literal. */
function isPairLine(line, literals) {
  if (!/[A-Za-z_$][\w$]*\s*\(/.test(line)) return false;
  return literals.every((lit) => !CYRILLIC.test(lit.text) || /^\s*,\s*['"`]/.test(line.slice(lit.end)));
}

/** Cyrillic problems in one file: [{ line, text }]. `file` is the path relative to the project root with "/". */
export function checkFile(file, content) {
  const lines = content.split(/\r?\n/);
  const inTests = file.startsWith('tests/');
  const problems = [];
  if (!CODE.test(file)) {
    if (inTests) return problems;
    lines.forEach((text, k) => {
      if (CYRILLIC.test(text)) problems.push({ line: k + 1, text });
    });
    return problems;
  }
  const literalsAllowed = inTests || LITERAL_FILES.has(file);
  tokenizeLines(lines).forEach((tok, k) => {
    const text = lines[k];
    if (!CYRILLIC.test(text)) return;
    const marker = /\/\/\s*cyrillic-ok:/.exec(text);
    if (marker && !CYRILLIC.test(text.slice(marker.index))) return;
    if (tok.comment && CYRILLIC.test(tok.code)) return problems.push({ line: k + 1, text });
    if (CYRILLIC.test(tok.code)) return problems.push({ line: k + 1, text });
    if (!tok.literals.some((lit) => CYRILLIC.test(lit.text))) return;
    if (literalsAllowed || /\bru\s*:/.test(text) || (file === PAIR_FILE && isPairLine(text, tok.literals))) return;
    problems.push({ line: k + 1, text });
  });
  return problems;
}

/** Checks the given files (paths relative to root); binary files are skipped. Returns ["file:line: text", …]. */
export function findCyrillic(root, files) {
  const report = [];
  for (const file of files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    const bytes = fs.readFileSync(full);
    if (bytes.includes(0)) continue;
    for (const p of checkFile(file.replace(/\\/g, '/'), bytes.toString('utf8'))) report.push(`${file}:${p.line}: ${p.text.trim().slice(0, 160)}`);
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('docs/') && f !== 'CLAUDE.md');
  const report = findCyrillic(root, files);
  if (report.length) {
    console.log(report.join('\n'));
    console.log(`\n${report.length} line(s) with Cyrillic outside the Russian translation.`);
    process.exit(1);
  }
  console.log('No Cyrillic outside the Russian translation.');
}
