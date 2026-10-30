// All game levels. A new level: a file in this folder + a line here.
import type { LevelDef } from '../defs.ts';
import { CAVE } from './cave.ts';
import { POLYGON } from './polygon.ts';
import { HUB_DOWNTOWN, HUB_DOWNTOWN_2, HUB_ENT, HUB_HEIGHTS, HUB_MISSION, HUB_OLDTOWN, HUB_OLDTOWN_2, HUB_WATER } from './hub.ts';
import { JUNKTOWN_CASINO, JUNKTOWN_CENTER, JUNKTOWN_ENT, JUNKTOWN_ENT_2 } from './junktown.ts';
import { SHADY_SANDS_E, SHADY_SANDS_W } from './shady-sands.ts';
import { VAULT13_1, VAULT13_2, VAULT13_3 } from './vault13.ts';
import { VAULT15_1, VAULT15_2, VAULT15_3, VAULT15_ENTRANCE } from './vault15.ts';
import { RAIDERS, RAIDERS_ARENA } from './raiders.ts';
import { CATHEDRAL_DEAD, MBASE_DEAD } from './after-end.ts';
import { CARAVAN_DESERT_1, CARAVAN_DESERT_2, CARAVAN_DESERT_3, CARAVAN_DESERT_4, CARAVAN_MOUNTAIN_1, CARAVAN_MOUNTAIN_2, CARAVAN_MOUNTAIN_3, CARAVAN_MOUNTAIN_4 } from './encounters.ts';
import { NECRO_HALL, NECRO_HALL_LOW, NECRO_HOTEL, NECRO_HOTEL_LOW, NECRO_WATER, NECRO_WATER_LOW } from './necropolis.ts';
import { VAULT12_1, VAULT12_2, VAULT12_3 } from './vault12.ts';
import { BROTHERHOOD_1, BROTHERHOOD_2, BROTHERHOOD_3, BROTHERHOOD_4, BROTHERHOOD_ENT } from './brotherhood.ts';
import { GLOW_1, GLOW_2, GLOW_3, GLOW_4, GLOW_5, GLOW_6, GLOW_ENT } from './glow.ts';
import { BONEYARD_ADYTUM, BONEYARD_ADYTUM_2, BONEYARD_BLADES, BONEYARD_DEATHCLAW, BONEYARD_FOLLOWERS, BONEYARD_FOLLOWERS_2, BONEYARD_GUNRUNNERS, BONEYARD_RIPPERS, BONEYARD_RIPPERS_2, BONEYARD_RIPPERS_3 } from './boneyard.ts';
import { MBASE_1, MBASE_2, MBASE_3, MBASE_4, MBASE_ENT } from './mbase.ts';
import { CATHEDRAL_1, CATHEDRAL_ENT, CATHEDRAL_TOWER_1, CATHEDRAL_TOWER_2, CATHEDRAL_TOWER_3, MASTER_1, MASTER_2, MASTER_3, MASTER_4 } from './cathedral.ts';
import { SHADY_CAVES } from './shady-caves.ts';

export const LEVELS: Record<string, LevelDef> = Object.fromEntries(
  [
    CAVE,
    VAULT13_1,
    VAULT13_2,
    VAULT13_3,
    VAULT15_ENTRANCE,
    VAULT15_1,
    VAULT15_2,
    VAULT15_3,
    SHADY_SANDS_E,
    SHADY_SANDS_W,
    JUNKTOWN_ENT,
    JUNKTOWN_ENT_2,
    JUNKTOWN_CENTER,
    JUNKTOWN_CASINO,
    HUB_ENT,
    HUB_DOWNTOWN,
    HUB_OLDTOWN,
    HUB_HEIGHTS,
    HUB_WATER,
    HUB_DOWNTOWN_2,
    HUB_OLDTOWN_2,
    POLYGON,
    RAIDERS,
    RAIDERS_ARENA,
    MBASE_DEAD,
    CATHEDRAL_DEAD,
    CARAVAN_DESERT_1,
    CARAVAN_DESERT_2,
    CARAVAN_DESERT_3,
    CARAVAN_DESERT_4,
    CARAVAN_MOUNTAIN_1,
    CARAVAN_MOUNTAIN_2,
    CARAVAN_MOUNTAIN_3,
    CARAVAN_MOUNTAIN_4,
    HUB_MISSION,
    NECRO_HOTEL,
    NECRO_HOTEL_LOW,
    NECRO_HALL,
    NECRO_HALL_LOW,
    NECRO_WATER,
    NECRO_WATER_LOW,
    VAULT12_1,
    VAULT12_2,
    VAULT12_3,
    BROTHERHOOD_ENT,
    BROTHERHOOD_1,
    BROTHERHOOD_2,
    BROTHERHOOD_3,
    BROTHERHOOD_4,
    GLOW_ENT,
    GLOW_1,
    GLOW_2,
    GLOW_3,
    GLOW_4,
    GLOW_5,
    GLOW_6,
    BONEYARD_ADYTUM,
    BONEYARD_ADYTUM_2,
    BONEYARD_BLADES,
    BONEYARD_RIPPERS,
    BONEYARD_RIPPERS_2,
    BONEYARD_RIPPERS_3,
    BONEYARD_GUNRUNNERS,
    BONEYARD_FOLLOWERS,
    BONEYARD_FOLLOWERS_2,
    BONEYARD_DEATHCLAW,
    MBASE_ENT,
    MBASE_1,
    MBASE_2,
    MBASE_3,
    MBASE_4,
    CATHEDRAL_ENT,
    CATHEDRAL_1,
    CATHEDRAL_TOWER_1,
    CATHEDRAL_TOWER_2,
    CATHEDRAL_TOWER_3,
    MASTER_1,
    MASTER_2,
    MASTER_3,
    MASTER_4,
    SHADY_CAVES,
  ].map((level) => [level.id, level]),
);

/** Which map and point a new game starts from. */
export const NEW_GAME = { map: 'cave', entry: 'start' } as const;

/** Test range (main menu): for testing mechanics. */
export const POLYGON_START = { map: 'polygon', entry: 'start' } as const;
