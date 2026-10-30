// Necropolis, hotel (HOTEL, floor 1) → necro-hotel.
import type { LevelConfig } from '../map-to-level.ts';

const config: LevelConfig = {
  id: 'necro-hotel',
  constName: 'NECRO_HOTEL',
  title: { ru: 'Некрополис, гостиница', en: 'Necropolis, hotel' },
  doc: 'Necropolis, hotel (map HOTEL, elevation 1): the town\'s upper level: streets, houses and an exit to the wasteland.',
  music: '14NECRO',
  outdoor: true,
  wallTexture: 'ruin',
  floor: 'asphalt',
  blockers: [0x02000043, 0x02000158],
  skipItems: [0x94, 0x96],
  marks: {
    X: "{ kind: 'exit', to: { map: 'wasteland', entry: 'necropolis' } }",
  },
  entrances: { 0: 'wasteland', 3: 'wasteland' },
  entries: {
    // From the wasteland: the map's starting cell per the HOTELMAP script (default entrance).
    wasteland: { tile: 27294, facing: 'west' },
    t16307: { tile: 16307, facing: 'south' },
    t19146: { tile: 19146, facing: 'south' },
    t22298: { tile: 22298, facing: 'south' },
  },
  extraObjects: [
    // Ladder or hatch (script NHUP2DN1 in the original): press E.
    (o) => `{ kind: 'exit', x: ${25.5 - o.ox}, y: ${33.5 - o.oy}, use: true, to: { map: 'necro-hotel-low', entry: 't15499' } },`,
    // Ladder or hatch (script NHUP2DN2 in the original): press E.
    (o) => `{ kind: 'exit', x: ${32.5 - o.ox}, y: ${53.5 - o.oy}, use: true, to: { map: 'necro-hotel-low', entry: 't19139' } },`,
    // Ladder or hatch (script NHUP2DN3 in the original): press E.
    (o) => `{ kind: 'exit', x: ${40.5 - o.ox}, y: ${29.5 - o.oy}, use: true, to: { map: 'necro-hotel-low', entry: 't22698' } },`,
  ],
};

export default config;
