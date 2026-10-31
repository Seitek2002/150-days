// The original's combat behavior packets (DATA\AI.TXT): min_hp — at how many hit points a critter turns to run; 1 or less — never
// (client, 2026-10-31: Gizmo ran away from the fight, while in the original he fights to the death).
import { describe, expect, it } from 'vitest';
import { parseAiPackets } from '../src/formats/ai-txt.ts';

const sample = [
  '[Player AI]\t; comment',
  'packet_num=0\t; player AI must be packet number 0',
  'min_hp=3',
  '',
  '[Gizmo]',
  'packet_num=60',
  'max_dist=15',
  'min_hp=1',
  '',
  '[Merchant]',
  'packet_num=50',
  'min_hp=20',
].join('\r\n');

describe('AI packets', () => {
  it('reads each packet number with its min_hp', () => {
    const packets = parseAiPackets(sample);
    expect(packets.get(0)?.minHp).toBe(3);
    expect(packets.get(60)?.minHp).toBe(1);
    expect(packets.get(50)?.minHp).toBe(20);
    expect(packets.size).toBe(3);
  });
});
