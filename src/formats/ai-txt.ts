// DATA\AI.TXT — the original's combat behavior packets: sections "[Name]" with "key=value" lines; packet_num is the number critters refer to.

/** What we take from a packet: min_hp — at how many hit points the critter turns to run away (1 or less — fights to the death). */
export interface AiPacket {
  minHp: number;
}

export function parseAiPackets(text: string): Map<number, AiPacket> {
  const packets = new Map<number, AiPacket>();
  for (const section of text.split(/\r?\n(?=\s*\[)/)) {
    const value = (key: string): number | null => {
      const m = new RegExp(`^\\s*${key}\\s*=\\s*(-?\\d+)`, 'mi').exec(section);
      return m ? Number(m[1]) : null;
    };
    const num = value('packet_num');
    const minHp = value('min_hp');
    if (num !== null && minHp !== null) packets.set(num, { minHp });
  }
  return packets;
}
