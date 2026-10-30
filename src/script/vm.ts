// Fallout script "processor": runs INT bytecode from the player's copy.
// Stack machine: data stack, return stack, procedure frame (fp) and the script's global variables (bp).
// Command behaviour follows the original (checked against the format description), the code is ours.
// Game functions (dialogue, variables, items…) are run by the host — ScriptHost (game-functions.ts).
import { IntProgram, PROC_FLAG } from './int.ts';
import { CORE_OPCODES, FUNCTIONS } from './signatures.ts';

/**
 * A value on the script stack. A string from the script itself also remembers its offset (at): names of shared variables
 * (export_var, fetch_external, store_external) are pushed by the script just like strings, but that offset is in the name block.
 */
export type Value = { t: 'i'; v: number } | { t: 'f'; v: number } | { t: 's'; v: string; at?: number } | { t: 'p'; v: unknown };

export const int = (v: number): Value => ({ t: 'i', v: v | 0 });
export const float = (v: number): Value => ({ t: 'f', v: Math.fround(v) });
export const str = (v: string): Value => ({ t: 's', v });
/** Reference to a game object; a null reference is the number 0, as in the original. */
export const ptr = (v: unknown): Value => (v == null ? int(0) : { t: 'p', v });

/** Number from a value (string — 0, reference — 1). */
export function asInt(value: Value | undefined): number {
  if (!value) return 0;
  if (value.t === 'i') return value.v;
  if (value.t === 'f') return Math.trunc(value.v);
  if (value.t === 'p') return value.v == null ? 0 : 1;
  return 0;
}

export function asString(value: Value | undefined): string {
  if (!value) return '';
  if (value.t === 's') return value.v;
  if (value.t === 'f') return value.v.toFixed(5);
  if (value.t === 'i') return String(value.v);
  return '';
}

/** Game object from a value (or null). */
export function asObject<T>(value: Value | undefined): T | null {
  return value?.t === 'p' ? (value.v as T) : null;
}

/** "Empty" for if/while/not conditions: 0, a null reference. */
function isEmpty(value: Value | undefined): boolean {
  if (!value) return true;
  if (value.t === 'i' || value.t === 'f') return value.v === 0;
  if (value.t === 'p') return value.v == null;
  return false;
}

export interface ScriptHost {
  /** Game function: args are in the order written in the script. A result is needed if the function returns one. */
  call(vm: ScriptVM, code: number, args: Value[]): Value | void | Promise<Value | void>;
  /** Time in milliseconds (for wait and timed procedures). */
  now(): number;
  /** Wait (wait in a script). */
  sleep?(ms: number): Promise<void>;
  log?(message: string): void;
}

/** Program flags. */
const F = { exited: 0x01, bad: 0x04, stopped: 0x08, waiting: 0x10, busy: 0x20, returned: 0x40, critical: 0x80, held: 0x100 } as const;
const STOP_MASK = F.exited | F.bad | F.stopped | F.busy | F.returned | F.held;
/** Address of the startup code at the start of the file: "pop result, return flags, exit" — this is how the game calls procedures. */
const RETURN_TO_ENGINE = 24;
/** Protection from infinite loops in a single run. */
const MAX_STEPS = 2_000_000;

/** Values scripts pass to each other (export_var / fetch_external). */
const exported = new Map<string, Value>();

/** Shared script variables (for checks and debugging): name → value. */
export function externalVars(): ReadonlyMap<string, Value> {
  return exported;
}

export class ScriptError extends Error {}

export class ScriptVM {
  readonly program: IntProgram;
  readonly host: ScriptHost;
  stack: Value[] = [];
  ret: Value[] = [];
  ip = 0;
  fp = -1;
  bp = -1;
  flags = 0;
  windowId = 0;
  private checkWait: unknown = null;
  exited = false;
  /** How many commands have been run in total (for debugging). */
  steps = 0;

  constructor(program: IntProgram, host: ScriptHost) {
    this.program = program;
    this.host = host;
  }

  /** First run: the startup code at the start of the file sets up the script's global variables and stops. */
  async init(): Promise<void> {
    this.ip = 0;
    await this.run();
  }

  /** Whether there is a procedure with this name. */
  has(name: string): boolean {
    return this.program.findProcedure(name) > 0;
  }

  /** Call a procedure the way the game does (talk_p_proc, map_enter_p_proc…). No procedure — do nothing. */
  async call(proc: number | string): Promise<void> {
    if (this.exited) return;
    const index = typeof proc === 'number' ? proc : this.program.findProcedure(proc);
    if (index <= 0) return;
    const p = this.program.procedure(index);
    if (p.flags & PROC_FLAG.imported) {
      this.host.log?.(`${this.program.name}: external procedure ${p.name} is not supported`);
      return;
    }
    this.ret.push(int(this.ip), int(RETURN_TO_ENGINE));
    this.stack.push(int(this.flags & 0xffff), ptr(this.checkWait), int(this.windowId));
    this.flags &= ~0xffff;
    this.ip = p.body;
    this.stack.push(int(0));
    await this.run();
  }

  /**
   * Timed procedures (call_at): run those whose time has come.
   * Conditional procedures (call_when) are almost never used in Fallout 1 scripts — not run for now.
   */
  async runTimed(): Promise<void> {
    const now = this.host.now();
    for (let i = 1; i < this.program.procedureCount; i++) {
      const p = this.program.procedure(i);
      if (p.flags & PROC_FLAG.timed && p.time <= now) {
        this.program.setProcedureFlags(i, p.flags & ~PROC_FLAG.timed);
        await this.call(i);
      }
    }
  }

  private pop(): Value {
    const v = this.stack.pop();
    if (!v) throw new ScriptError(`${this.program.name}: stack is empty (address ${this.ip})`);
    return v;
  }

  /** Name of a shared variable from the stack: offset in the name block (for a string from the script — its offset), case-insensitive. */
  private externalName(): string {
    const v = this.pop();
    const offset = v.t === 's' && v.at !== undefined ? v.at : asInt(v);
    return this.program.identifier(offset).toLowerCase();
  }

  private popInt(): number {
    return asInt(this.pop());
  }

  private popRet(): Value {
    const v = this.ret.pop();
    if (!v) throw new ScriptError(`${this.program.name}: return stack is empty (address ${this.ip})`);
    return v;
  }

  private async run(): Promise<void> {
    let budget = MAX_STEPS;
    while (!(this.flags & STOP_MASK) && !this.exited) {
      if (--budget < 0) throw new ScriptError(`${this.program.name}: running too long (infinite loop?) at address ${this.ip}`);
      const at = this.ip;
      const opcode = this.program.word(at);
      this.ip += 2;
      this.steps++;
      if (!(opcode & 0x8000)) throw new ScriptError(`${this.program.name}: not a command 0x${opcode.toString(16)} at address ${at}`);
      this.flags = (this.flags & 0xffff) | (opcode << 16);
      const index = opcode & 0x3ff;
      if (index < CORE_OPCODES.length) {
        const wait = this.core(index, opcode);
        if (wait) await wait;
      } else {
        await this.external(opcode & 0xffff);
      }
    }
    this.flags &= ~F.returned;
  }

  /** Game function: pop the arguments, call the host, push the result. */
  private async external(code: number): Promise<void> {
    const sig = FUNCTIONS[code];
    if (!sig) throw new ScriptError(`${this.program.name}: unknown function 0x${code.toString(16)}`);
    const [, argc, returns] = sig;
    const args: Value[] = new Array(argc);
    for (let i = argc - 1; i >= 0; i--) args[i] = this.pop();
    let result = this.host.call(this, code, args);
    if (result instanceof Promise) result = await result;
    if (returns) this.stack.push(result ?? int(0));
  }

  private compare(op: (a: number, b: number) => boolean): void {
    const right = this.pop();
    const left = this.pop();
    if (left.t === 's' || right.t === 's') {
      const a = asString(left);
      const b = asString(right);
      this.stack.push(int(op(a < b ? -1 : a > b ? 1 : 0, 0) ? 1 : 0));
      return;
    }
    const a = left.t === 'p' ? (left.v == null ? 0 : 1) : left.v;
    const b = right.t === 'p' ? (right.v == null ? 0 : 1) : right.v;
    this.stack.push(int(op(a as number, b as number) ? 1 : 0));
  }

  private equal(): boolean {
    const right = this.pop();
    const left = this.pop();
    if (left.t === 's' || right.t === 's') return asString(left) === asString(right);
    if (left.t === 'p' || right.t === 'p') {
      const a = left.t === 'p' ? left.v : left.v === 0 ? null : left.v;
      const b = right.t === 'p' ? right.v : right.v === 0 ? null : right.v;
      return a === b;
    }
    return left.v === right.v;
  }

  private arithmetic(op: '+' | '-' | '*'): void {
    const right = this.pop();
    const left = this.pop();
    if (op === '+' && (left.t === 's' || right.t === 's')) {
      this.stack.push(str(asString(left) + asString(right)));
      return;
    }
    const a = left.t === 'f' ? left.v : asInt(left);
    const b = right.t === 'f' ? right.v : asInt(right);
    const r = op === '+' ? a + b : op === '-' ? a - b : a * b;
    if (left.t === 'f' || right.t === 'f') this.stack.push(float(r));
    // Integer overflow — as in the original, becomes a float.
    else this.stack.push(r > 0x7fffffff || r < -0x80000000 ? float(r) : int(r));
  }

  private core(index: number, opcode: number): Promise<void> | void {
    const p = this.program;
    switch (CORE_OPCODES[index]) {
      case 'noop':
        return;
      case 'push': {
        const raw = p.long(this.ip);
        const at = this.ip;
        this.ip += 4;
        const type = opcode & 0xf7ff;
        if (type === 0xc001) this.stack.push(int(raw));
        else if (type === 0xa001) this.stack.push(float(p.float(at)));
        else if (type === 0x9001) this.stack.push({ t: 's', v: p.string(raw), at: raw });
        else this.stack.push(int(raw));
        return;
      }
      case 'enter_critical':
      case 'start_critical':
        this.flags |= F.critical;
        return;
      case 'leave_critical':
      case 'end_critical':
        this.flags &= ~F.critical;
        return;
      case 'jump':
        this.ip = this.popInt();
        return;
      case 'call': {
        const proc = p.procedure(this.popInt());
        if (proc.flags & PROC_FLAG.imported) throw new ScriptError(`${p.name}: external procedure ${proc.name} is not supported`);
        this.ip = proc.body;
        if (proc.flags & PROC_FLAG.critical) this.flags |= F.critical;
        return;
      }
      case 'call_at': {
        const proc = this.popInt();
        const delay = this.popInt();
        p.setProcedureTime(proc, 1000 * delay + this.host.now());
        p.setProcedureFlags(proc, p.procedure(proc).flags | PROC_FLAG.timed);
        return;
      }
      case 'call_when': {
        const proc = this.popInt();
        const condition = this.popInt();
        p.setProcedureFlags(proc, p.procedure(proc).flags | PROC_FLAG.conditional);
        p.setProcedureCondition(proc, condition);
        return;
      }
      case 'callstart':
      case 'exec':
      case 'spawn':
      case 'fork':
        // Running other programs by name — never happens in the game's scripts.
        this.host.log?.(`${p.name}: ${CORE_OPCODES[index]} is not supported`);
        this.pop();
        return;
      case 'a_to_d':
        this.stack.push(this.popRet());
        return;
      case 'd_to_a':
        this.ret.push(this.pop());
        return;
      case 'exit':
        this.exited = true;
        this.flags |= F.exited;
        return;
      case 'detach':
        return;
      case 'exit_program':
        this.flags |= F.exited;
        return;
      case 'stop_program':
        this.flags |= F.stopped;
        return;
      case 'fetch_global': {
        const addr = this.popInt();
        this.stack.push(this.stack[this.bp + addr] ?? int(0));
        return;
      }
      case 'store_global': {
        const addr = this.popInt();
        this.stack[this.bp + addr] = this.pop();
        return;
      }
      case 'fetch_external': {
        const name = this.externalName();
        this.stack.push(exported.get(name) ?? int(0));
        return;
      }
      case 'store_external': {
        const name = this.externalName();
        exported.set(name, this.pop());
        return;
      }
      case 'export_var': {
        const name = this.externalName();
        if (!exported.has(name)) exported.set(name, int(0));
        return;
      }
      case 'export_proc':
        this.popInt();
        this.popInt();
        return;
      case 'swap': {
        const a = this.pop();
        const b = this.pop();
        this.stack.push(a, b);
        return;
      }
      case 'swapa': {
        const a = this.popRet();
        const b = this.popRet();
        this.ret.push(a, b);
        return;
      }
      case 'pop':
        this.pop();
        return;
      case 'dup': {
        const v = this.pop();
        this.stack.push(v, v);
        return;
      }
      case 'pop_return':
        this.ip = asInt(this.popRet());
        return;
      case 'pop_exit':
        this.ip = asInt(this.popRet());
        this.flags |= F.returned;
        return;
      case 'pop_address':
        this.popRet();
        return;
      case 'pop_flags':
        this.popFlags();
        return;
      case 'pop_flags_return':
        this.popFlags();
        this.ip = asInt(this.popRet());
        return;
      case 'pop_flags_exit':
        this.popFlags();
        this.ip = asInt(this.popRet());
        this.flags |= F.returned;
        return;
      case 'pop_flags_return_val_exit': {
        const v = this.pop();
        this.popFlags();
        this.ip = asInt(this.popRet());
        this.flags |= F.returned;
        this.stack.push(v);
        return;
      }
      case 'pop_flags_return_extern':
      case 'pop_flags_exit_extern':
      case 'pop_flags_return_val_extern':
      case 'pop_flags_return_val_exit_extern':
        throw new ScriptError(`${p.name}: return from an external procedure is not supported`);
      case 'check_arg_count': {
        const expected = this.popInt();
        const proc = this.popInt();
        if (p.procedure(proc).args !== expected) this.host.log?.(`${p.name}: wrong number of arguments for ${p.procedure(proc).name}`);
        return;
      }
      case 'lookup_proc_by_name': {
        const name = asString(this.pop());
        const found = p.findProcedure(name);
        if (found < 0) throw new ScriptError(`${p.name}: no procedure ${name}`);
        this.stack.push(int(found));
        return;
      }
      case 'pop_base':
        this.fp = asInt(this.popRet());
        return;
      case 'pop_to_base':
        while (this.stack.length > this.fp) this.stack.pop();
        return;
      case 'push_base': {
        const argc = this.popInt();
        this.ret.push(int(this.fp));
        this.fp = this.stack.length - argc;
        return;
      }
      case 'set_global':
        this.bp = this.stack.length;
        return;
      case 'fetch_proc_address':
        this.stack.push(int(p.procedure(this.popInt()).body));
        return;
      case 'dump': {
        const n = this.popInt();
        for (let i = 0; i < n; i++) this.pop();
        return;
      }
      case 'if': {
        const v = this.pop();
        if (!isEmpty(v)) this.pop();
        else this.ip = this.popInt();
        return;
      }
      case 'while': {
        const v = this.pop();
        if (isEmpty(v)) this.ip = this.popInt();
        return;
      }
      case 'store': {
        const addr = this.popInt();
        this.stack[this.fp + addr] = this.pop();
        return;
      }
      case 'fetch': {
        const addr = this.popInt();
        this.stack.push(this.stack[this.fp + addr] ?? int(0));
        return;
      }
      case 'equal':
        this.stack.push(int(this.equal() ? 1 : 0));
        return;
      case 'not_equal':
        this.stack.push(int(this.equal() ? 0 : 1));
        return;
      case 'less_equal':
        return this.compare((a, b) => a <= b);
      case 'greater_equal':
        return this.compare((a, b) => a >= b);
      case 'less':
        return this.compare((a, b) => a < b);
      case 'greater':
        return this.compare((a, b) => a > b);
      case 'add':
        return this.arithmetic('+');
      case 'sub':
        return this.arithmetic('-');
      case 'mul':
        return this.arithmetic('*');
      case 'div': {
        const right = this.pop();
        const left = this.pop();
        if (left.t === 'f' || right.t === 'f') {
          const d = right.t === 'f' ? right.v : asInt(right);
          this.stack.push(float(d === 0 ? 0 : (left.t === 'f' ? left.v : asInt(left)) / d));
        } else {
          const d = asInt(right);
          if (d === 0) this.host.log?.(`${p.name}: division by zero`);
          this.stack.push(int(d === 0 ? 0 : Math.trunc(asInt(left) / d)));
        }
        return;
      }
      case 'mod': {
        const right = this.popInt();
        const left = this.pop();
        if (left.t !== 'i') return;
        this.stack.push(int(right === 0 ? 0 : left.v % right));
        return;
      }
      case 'and': {
        const right = this.pop();
        const left = this.pop();
        this.stack.push(int(!isEmpty(left) && !isEmpty(right) ? 1 : 0));
        return;
      }
      case 'or': {
        const right = this.pop();
        const left = this.pop();
        this.stack.push(int(!isEmpty(left) || !isEmpty(right) ? 1 : 0));
        return;
      }
      case 'bitwise_and': {
        const b = this.popInt();
        this.stack.push(int(this.popInt() & b));
        return;
      }
      case 'bitwise_or': {
        const b = this.popInt();
        this.stack.push(int(this.popInt() | b));
        return;
      }
      case 'bitwise_xor': {
        const b = this.popInt();
        this.stack.push(int(this.popInt() ^ b));
        return;
      }
      case 'bitwise_not':
        this.stack.push(int(~this.popInt()));
        return;
      case 'floor': {
        const v = this.pop();
        this.stack.push(v.t === 'f' ? int(Math.trunc(v.v)) : v);
        return;
      }
      case 'not':
        this.stack.push(int(isEmpty(this.pop()) ? 1 : 0));
        return;
      case 'negate': {
        const v = this.pop();
        if (v.t === 'i') this.stack.push(int(-v.v));
        else if (v.t === 'f') this.stack.push(float(-v.v));
        return;
      }
      case 'wait': {
        const ms = this.popInt();
        return this.host.sleep ? this.host.sleep(ms) : undefined;
      }
      case 'cancel': {
        const proc = this.popInt();
        p.setProcedureFlags(proc, 0);
        p.setProcedureTime(proc, 0);
        p.setProcedureCondition(proc, 0);
        return;
      }
      case 'cancel_all':
        for (let i = 0; i < p.procedureCount; i++) {
          p.setProcedureFlags(i, 0);
          p.setProcedureTime(i, 0);
          p.setProcedureCondition(i, 0);
        }
        return;
      default:
        throw new ScriptError(`${p.name}: command ${CORE_OPCODES[index]} is not supported`);
    }
  }

  private popFlags(): void {
    this.windowId = this.popInt();
    const wait = this.pop();
    this.checkWait = wait.t === 'p' ? wait.v : null;
    this.flags = this.popInt() & 0xffff;
  }
}
