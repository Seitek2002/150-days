// Initial values of script variables (GAM): lines like "NAME := number;", comments after //.
// DATA\VAULT13.GAM — story variables (shared by the whole game), MAPS\<map>.GAM — variables of one map.

export interface GamVars {
  names: string[];
  values: number[];
}

export function parseGam(bytes: Uint8Array): GamVars {
  const text = new TextDecoder('windows-1252').decode(bytes);
  const names: string[] = [];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '');
    const m = /^\s*([A-Za-z_]\w*)\s*:=\s*(-?\d+)\s*;?/.exec(line);
    if (!m) continue;
    names.push(m[1]!);
    values.push(Number(m[2]));
  }
  return { names, values };
}
