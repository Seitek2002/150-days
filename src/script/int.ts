// Fallout script file (INT): bytecode for our "processor" (vm.ts).
// File layout: 42 bytes of startup code, procedure table, names, strings; numbers are big-endian.
// Scripts are read from the player's copy at runtime — they are not in our code.

/** Procedure flags in the table. */
export const PROC_FLAG = { timed: 0x01, conditional: 0x02, imported: 0x04, exported: 0x08, critical: 0x10 } as const;

const PROCEDURES_AT = 42;
const PROC_SIZE = 24;

export interface IntProcedure {
  index: number;
  name: string;
  flags: number;
  /** For a timed procedure — when to run it (ms). */
  time: number;
  /** For a conditional procedure — address of the condition code. */
  condition: number;
  /** Address of the start of the procedure body. */
  body: number;
  args: number;
}

const decoder = new TextDecoder('windows-1251');

export class IntProgram {
  readonly name: string;
  /** Own copy of the bytes: timed procedures change the procedure table on the fly, as in the original. */
  readonly data: Uint8Array;
  readonly view: DataView;
  readonly procedureCount: number;
  /** Where the name block starts (at its length field — name offsets are counted from there). */
  private readonly identifiers: number;
  /** Where the string block starts (at its length field). */
  private readonly strings: number;

  constructor(name: string, bytes: Uint8Array) {
    this.name = name;
    this.data = bytes.slice();
    this.view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength);
    if (this.data.byteLength < PROCEDURES_AT + 4) throw new Error(`${name}: script too short`);
    this.procedureCount = this.view.getInt32(PROCEDURES_AT);
    this.identifiers = PROCEDURES_AT + 4 + this.procedureCount * PROC_SIZE;
    this.strings = this.identifiers + 4 + this.view.getInt32(this.identifiers);
    if (this.procedureCount < 0 || this.strings > this.data.byteLength) throw new Error(`${name}: corrupted script`);
  }

  word(at: number): number {
    return this.view.getUint16(at);
  }

  long(at: number): number {
    return this.view.getInt32(at);
  }

  float(at: number): number {
    return this.view.getFloat32(at);
  }

  /** Name (of a procedure or external variable) by offset in the name block. */
  identifier(offset: number): string {
    return this.cString(this.identifiers + offset);
  }

  /** String from the script's string block. */
  string(offset: number): string {
    return this.cString(this.strings + 4 + offset);
  }

  private cString(at: number): string {
    let end = at;
    while (end < this.data.length && this.data[end] !== 0) end++;
    return decoder.decode(this.data.subarray(at, end));
  }

  private procAt(index: number): number {
    if (index < 0 || index >= this.procedureCount) throw new Error(`${this.name}: no procedure #${index}`);
    return PROCEDURES_AT + 4 + index * PROC_SIZE;
  }

  procedure(index: number): IntProcedure {
    const at = this.procAt(index);
    return {
      index,
      name: this.identifier(this.long(at)),
      flags: this.long(at + 4),
      time: this.long(at + 8),
      condition: this.long(at + 12),
      body: this.long(at + 16),
      args: this.long(at + 20),
    };
  }

  setProcedureFlags(index: number, flags: number): void {
    this.view.setInt32(this.procAt(index) + 4, flags);
  }

  setProcedureTime(index: number, time: number): void {
    this.view.setInt32(this.procAt(index) + 8, time);
  }

  setProcedureCondition(index: number, address: number): void {
    this.view.setInt32(this.procAt(index) + 12, address);
  }

  /** Procedure index by name (case-insensitive); −1 if there is none. Index 0 is the startup one and is never searched. */
  findProcedure(name: string): number {
    const wanted = name.toLowerCase();
    for (let i = 1; i < this.procedureCount; i++) {
      if (this.procedure(i).name.toLowerCase() === wanted) return i;
    }
    return -1;
  }

  procedures(): IntProcedure[] {
    return Array.from({ length: this.procedureCount }, (_, i) => this.procedure(i));
  }
}
