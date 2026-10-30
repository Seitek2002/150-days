// An assembler of small scripts for tests: a header like the original's, a procedure table, strings, code with labels.
// Shared by tests/vm.test.ts and the script function tests.
import { IntProgram } from '../../src/script/int.ts';
import { CORE_OPCODES, FUNCTIONS } from '../../src/script/signatures.ts';

/** Script assembler: a service header like the original's, a procedure table, names, strings, code with labels. */
export class Asm {
  private code: number[] = [];
  private labels = new Map<string, number>();
  private fixups: { at: number; label: string }[] = [];
  readonly strings: string[] = [];
  readonly procs: { name: string; label: string }[] = [];
  /** Names of shared variables (export_var, fetch_external, store_external): they lie in the name block, like procedure names. */
  readonly names: string[] = [];

  op(name: string): this {
    const index = (CORE_OPCODES as readonly string[]).indexOf(name);
    if (index < 0) throw new Error('no opcode ' + name);
    return this.word(0x8000 + index);
  }

  fn(name: string): this {
    const code = Object.entries(FUNCTIONS).find(([, sig]) => sig[0] === name)?.[0];
    if (!code) throw new Error('no function ' + name);
    return this.word(Number(code));
  }

  push(value: number | string): this {
    this.word(0xc001);
    if (typeof value === 'string') {
      this.fixups.push({ at: this.code.length, label: value });
      return this.long(0);
    }
    return this.long(value);
  }

  pushStr(text: string): this {
    this.strings.push(text);
    this.word(0x9001);
    this.fixups.push({ at: this.code.length, label: '$str' + (this.strings.length - 1) });
    return this.long(0);
  }

  /** Push the name of a shared variable: the value is a string, but the offset is in the name block (as the original's compiler does). */
  pushName(name: string): this {
    if (!this.names.includes(name)) this.names.push(name);
    this.word(0x9001);
    this.fixups.push({ at: this.code.length, label: '$name' + name });
    return this.long(0);
  }

  label(name: string): this {
    this.labels.set(name, this.code.length);
    return this;
  }

  proc(name: string): this {
    this.procs.push({ name, label: 'proc:' + name });
    return this.label('proc:' + name);
  }

  /** End of procedure as the original's compiler does it: result 0 via the return stack. */
  ret(): this {
    return this.push(0).op('d_to_a').op('swapa').op('pop_to_base').op('pop_base').op('a_to_d').op('pop_return');
  }

  private word(v: number): this {
    this.code.push((v >> 8) & 0xff, v & 0xff);
    return this;
  }

  private long(v: number): this {
    this.code.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    return this;
  }

  build(): Uint8Array {
    // Strings in scripts are windows-1251, as in the localized copy of the game.
    const enc = (s: string) =>
      [...s].map((ch) => {
        const c = ch.charCodeAt(0);
        if (c < 0x80) return c;
        if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0;
        if (c === 0x401) return 0xa8;
        if (c === 0x451) return 0xb8;
        return 0x3f;
      });
    // Names: 2 length bytes, letters, a zero. The offset is from the block start (the length field), as in the original.
    const ident: number[] = [];
    const nameOffsets = new Map<string, number>();
    for (const p of [{ name: '' }, ...this.procs, ...this.names.map((name) => ({ name }))]) {
      nameOffsets.set(p.name, 4 + ident.length + 2);
      const b = enc(p.name);
      ident.push(0, b.length + 1, ...b, 0);
    }
    const strs: number[] = [];
    const strOffsets: number[] = [];
    for (const s of this.strings) {
      strOffsets.push(strs.length + 2);
      const b = enc(s);
      strs.push(0, b.length + 1, ...b, 0);
    }
    const procCount = this.procs.length + 1;
    const tableAt = 42;
    const identAt = tableAt + 4 + procCount * 24;
    const strAt = identAt + 4 + ident.length;
    const codeAt = strAt + 4 + strs.length;
    const abs = (label: string) => {
      if (label.startsWith('$str')) return strOffsets[Number(label.slice(4))]!;
      if (label.startsWith('$name')) return nameOffsets.get(label.slice(5))!;
      const at = this.labels.get(label);
      if (at === undefined) throw new Error('no label ' + label);
      return codeAt + at;
    };
    for (const f of this.fixups) {
      const v = abs(f.label);
      this.code.splice(f.at, 4, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    }
    const out = new Uint8Array(codeAt + this.code.length);
    const view = new DataView(out.buffer);
    // Header: enter the "critical section", return address 18, jump to the startup code.
    const header = [0x8002, 0xc001, 0, 18, 0x800d, 0xc001, 0, 0, 0x8004, 0x8010, 0x801a, 0x8020, 0x801a, 0x8021, 0x801a, 0x8022, 0x801a, 0x8023, 0x8024, 0x8025, 0x8026];
    let p = 0;
    for (const [i, w] of header.entries()) {
      if (i === 2 || i === 6) {
        view.setInt32(p, i === 2 ? 18 : abs('init'));
        p += 4;
      } else if (i === 3 || i === 7) {
        continue;
      } else {
        view.setUint16(p, w);
        p += 2;
      }
    }
    view.setInt32(tableAt, procCount);
    const procAt = (i: number) => tableAt + 4 + i * 24;
    view.setInt32(procAt(0), nameOffsets.get('')!);
    view.setInt32(procAt(0) + 16, abs('init'));
    this.procs.forEach((pr, i) => {
      view.setInt32(procAt(i + 1), nameOffsets.get(pr.name)!);
      view.setInt32(procAt(i + 1) + 16, abs(pr.label));
    });
    view.setInt32(identAt, ident.length);
    out.set(ident, identAt + 4);
    view.setInt32(strAt, strs.length);
    out.set(strs, strAt + 4);
    out.set(this.code, codeAt);
    return out;
  }
}

/** Startup: two global script variables (0 and 0), then "exit" at address 18. */
export function program(body: (a: Asm) => void): IntProgram {
  const a = new Asm();
  a.label('init').op('set_global').push(0).push(0).op('leave_critical').push(0).op('push_base').ret();
  body(a);
  return new IntProgram('TEST', a.build());
}

