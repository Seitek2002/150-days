// Script disassembler: INT bytecode → readable command list (for debugging and for describing functions).
import type { IntProgram } from './int.ts';
import { CORE_OPCODES, FUNCTIONS } from './signatures.ts';

export interface Instruction {
  at: number;
  opcode: number;
  /** Name of the command or game function. */
  name: string;
  /** Value of a push: integer, float or string. */
  operand?: number | string;
}

/** Where the code starts: right after the string block. */
export function codeStart(program: IntProgram): number {
  const procCount = program.long(42);
  const identifiers = 42 + 4 + procCount * 24;
  const strings = identifiers + 4 + program.long(identifiers);
  return strings + 4 + Math.max(0, program.long(strings));
}

/** All commands in order: the startup header (0–41) and the code after the string block. */
export function disassemble(program: IntProgram): Instruction[] {
  const out: Instruction[] = [];
  const decode = (from: number, to: number) => {
    let at = from;
    while (at + 2 <= to) {
      const opcode = program.word(at);
      const index = opcode & 0x3ff;
      const ins: Instruction = { at, opcode, name: '?' };
      at += 2;
      if (!(opcode & 0x8000)) {
        ins.name = `data 0x${opcode.toString(16)}`;
      } else if (index < CORE_OPCODES.length) {
        ins.name = CORE_OPCODES[index]!;
        if (index === 1 && at + 4 <= to) {
          const raw = program.long(at);
          const type = opcode & 0xf7ff;
          ins.operand = type === 0x9001 ? program.string(raw) : type === 0xa001 ? program.float(at) : raw;
          at += 4;
        }
      } else {
        ins.name = FUNCTIONS[opcode]?.[0] ?? `function 0x${opcode.toString(16)}`;
      }
      out.push(ins);
    }
  };
  decode(0, 42);
  decode(codeStart(program), program.data.length);
  return out;
}

/** Text for reading: procedures with addresses, then commands. */
export function listing(program: IntProgram): string {
  const lines: string[] = [];
  const starts = new Map<number, string>();
  for (const p of program.procedures()) {
    lines.push(`procedure ${p.index}: ${p.name || '(unnamed)'} — address ${p.body}, args ${p.args}${p.flags ? `, flags ${p.flags}` : ''}`);
    if (!starts.has(p.body)) starts.set(p.body, p.name);
  }
  lines.push('');
  for (const ins of disassemble(program)) {
    const start = starts.get(ins.at);
    if (start !== undefined) lines.push(`\n${start}:`);
    const operand = ins.operand === undefined ? '' : typeof ins.operand === 'string' ? ` "${ins.operand}"` : ` ${ins.operand}`;
    lines.push(`  ${String(ins.at).padStart(6)}  ${ins.name}${operand}`);
  }
  return lines.join('\n');
}

/** Which game functions a script calls and how many times — to know what it needs from us. */
export function usedFunctions(program: IntProgram): Map<string, number> {
  const used = new Map<string, number>();
  for (const ins of disassemble(program)) {
    if ((ins.opcode & 0x3ff) >= CORE_OPCODES.length && FUNCTIONS[ins.opcode]) used.set(ins.name, (used.get(ins.name) ?? 0) + 1);
  }
  return used;
}
