// Fixes for translation typos in the player's copy (Opus's decision): where a script glues a phrase together from pieces, the fan
// translation sometimes loses a space or a preposition. We fix only on an exact line match, so in another copy of the game
// (the official one, a different translation) nothing changes. The list with explanations is docs/ORIGINAL-FIXES.md.

/** Script → line number → [as in the copy, as it should be]. */
const FIXES: Record<string, Record<number, [string, string]>> = {
  // Caravan drivers name the departure date: "in January, "… "in November, ", but December has lost its preposition.
  KERI: { 228: ['декабре, ', 'в декабре, '] },
  FGTCARVN: { 215: ['декабре, ', 'в декабре, '] },
  // The Hub water caravan driver: "We're departing" gets glued both to the previous phrase ("…round trip.We"),
  // and to the month, with no spaces on either side.
  // "Please come" gets glued to the month, "We're departing today" to the previous phrase.
  WMCARVN: {
    107: ['Мы сегодня отправляемся. Интересует?', ' Мы сегодня отправляемся. Интересует?'],
    108: ['Мы отправляемся', ' Мы отправляемся '],
    146: ['Невероятно. Пожалуйста, приходи', 'Невероятно. Пожалуйста, приходи '],
    215: ['декабре, ', 'в декабре, '],
  },
};

/**
 * An empty critter line (list 0, line 0): in the original it means "back to the questions", and the dialogue window is left without
 * an answer, as if the critter said nothing to what the hero said. Where that looks broken, a line from the same script with the right meaning
 * (message list, line number). A line number, not text: it works with any copy of the game.
 */
const EMPTY_REPLIES: Record<string, [number, number]> = {
  // Killian: the hero introduced himself (and one more return to the questions): his usual question about how he can help.
  KILLIAN: [47, 115],
};

/** What to replace script name's empty line with; no replacement means undefined. */
export function emptyReplyOf(name: string): [number, number] | undefined {
  return EMPTY_REPLIES[name.toUpperCase()];
}

/** Fix the message lines of script name (in place). */
export function fixMessages(name: string, msg: Map<number, string>): void {
  const fixes = FIXES[name.toUpperCase()];
  if (!fixes) return;
  for (const [id, [was, fixed]] of Object.entries(fixes)) {
    if (msg.get(Number(id)) === was) msg.set(Number(id), fixed);
  }
}
