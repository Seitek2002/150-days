// A stub "game" for script tests: everything neutral, whatever the test needs is overridden.
import { callGameFunction, type ScriptContext, type ScriptObject } from '../../src/script/game-functions.ts';
import { ScriptVM } from '../../src/script/vm.ts';
import { program, type Asm } from './asm.ts';

export const dudeObject = (): ScriptObject => ({ kind: 'dude', pid: 0, name: () => 'Hero' });
export const critterObject = (pid = 0x01000001): ScriptObject => ({ kind: 'critter', pid, name: () => 'Critter' });

/** A context with neutral answers; `over` overrides any of them. */
export function makeContext(over: Partial<ScriptContext> = {}): ScriptContext {
  const vars = new Map<string, number>();
  return {
    scriptName: 'TEST',
    self: critterObject(),
    dude: dudeObject(),
    globalVar: (n) => vars.get(`g${n}`) ?? 0,
    setGlobalVar: (n, v) => void vars.set(`g${n}`, v),
    mapVar: (n) => vars.get(`m${n}`) ?? 0,
    setMapVar: (n, v) => void vars.set(`m${n}`, v),
    localVar: (n) => vars.get(`l${n}`) ?? 0,
    setLocalVar: (n, v) => void vars.set(`l${n}`, v),
    message: () => '',
    loadMessages: async () => {},
    stat: () => 5,
    skill: () => 40,
    countItems: () => 0,
    addItems: () => {},
    removeItems: () => {},
    item: async (pid) => ({ pid, messageId: 0, fid: 0, type: 5, weight: 0, cost: 0, inventoryFid: 0 }),
    itemName: () => 'item',
    say: () => {},
    giveExperience: () => {},
    attack: () => {},
    heal: () => {},
    gameSeconds: () => 0,
    requestTalk: () => {},
    dialogue: { open: () => {}, ask: async () => 0, close: () => {} },
    log: () => {},
    random: (min) => min,
    date: () => ({ month: 12, day: 5 }),
    advanceTime: () => {},
    daysSinceVisited: () => -1,
    isFirstRun: () => true,
    partyCount: () => 0,
    usedWith: () => null,
    partyAdd: () => {},
    partyRemove: () => {},
    partyMember: () => null,
    isLoadGame: () => false,
    signalEndGame: () => {},
    playMovie: async () => {},
    pcStat: () => 0,
    modifySkill: () => {},
    modifyStat: () => true,
    hasTrait: () => false,
    perkLevel: () => 0,
    objectTrait: () => 0,
    isAlive: () => true,
    onScreen: () => false,
    equipped: () => null,
    inventoryCount: () => 0,
    protoData: async () => 0,
    action: () => 0,
    tileOf: () => -1,
    elevationOf: () => 0,
    rotationOf: () => 0,
    lineOfSight: () => true,
    mapIndex: () => -1,
    fixedParam: () => 0,
    addTimer: () => {},
    removeTimers: () => {},
    float: () => {},
    setVisible: () => {},
    destroy: () => {},
    moveTo: () => -1,
    walkTo: () => {},
    stopMoving: () => {},
    setRotation: () => {},
    setObjectTrait: () => {},
    kill: () => {},
    killType: () => {},
    damage: () => {},
    endCombat: () => {},
    loadMap: () => {},
    moveInventory: () => {},
    wield: () => {},
    placeNear: () => -1,
    calm: () => {},
    setFleeing: () => {},
    condition: () => 0,
    setCondition: () => {},
    playSound: () => {},
    explode: () => {},
    setBarterMod: () => {},
    isOpen: () => false,
    setOpen: () => {},
    isLocked: () => false,
    setLocked: () => {},
    jamLock: () => {},
    overrideDefault: () => {},
    skillBeingUsed: () => -1,
    source: () => dudeObject(),
    // As in the game, when the target has no action of its own: open or close.
    useObject(o) {
      if (o.kind === 'scenery') this.setOpen(o, !this.isOpen(o));
    },
    barter: async () => {},
    openWorldMap: () => {},
    createObject: async (pid) => ({ kind: pid >>> 24 === 1 ? 'critter' : pid >>> 24 === 0 ? 'item' : 'scenery', pid, name: () => 'object' }),
    ...over,
  };
}

/**
 * Builds a script with a single procedure `test`, runs it and returns the machine.
 * The `body` pushes the function's result onto the stack (and nothing else): it is written to the first global variable,
 * and can be read as `vm.stack[vm.bp]`.
 */
export async function runScript(body: (a: Asm) => void, ctx: ScriptContext = makeContext()): Promise<ScriptVM> {
  const vm = new ScriptVM(
    program((a) => {
      a.proc('test').op('push_base');
      body(a);
      a.push(0).op('store_global').ret();
    }),
    { call: (machine, code, args) => callGameFunction(ctx, machine, code, args), now: () => 0 },
  );
  await vm.init();
  await vm.call('test');
  return vm;
}
