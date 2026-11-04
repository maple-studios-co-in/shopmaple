/** The "You may also like" row: other pieces from the product's category, never the piece itself, at most `limit`. */
export function otherPieces<T extends { id: string }>(cards: T[], product: { id: string }, limit = 4): T[] {
  return cards.filter((card) => card.id !== product.id).slice(0, limit);
}

// The rooms a piece is styled with: a chair with a table and a sofa, a bed with storage, and so on.
const lookRooms: Record<string, [string, string]> = {
  chairs: ["tables", "sofas"],
  sofas: ["tables", "chairs"],
  tables: ["chairs", "storage"],
  beds: ["storage", "chairs"],
  storage: ["tables", "chairs"],
  outdoors: ["chairs", "tables"],
};

/**
 * The two categories "Complete the look" draws from for a piece of `category`. An uncategorised piece is styled with
 * chairs and tables, so it too has a look and a bundle (owner, 4 Nov 2026).
 */
export function completeLookCategories(category: string | null | undefined): string[] {
  return category && Object.hasOwn(lookRooms, category) ? [...lookRooms[category]!] : ["chairs", "tables"];
}

/** "Complete the look": the rooms' pieces taken in turn (one from each, then the next), never the piece itself, at most `limit`. */
export function lookPieces<T extends { id: string }>(rooms: T[][], product: { id: string }, limit = 4): T[] {
  const lists = rooms.map((cards) => cards.filter((card) => card.id !== product.id));
  const pieces: T[] = [];
  for (let i = 0; pieces.length < limit && lists.some((cards) => i < cards.length); i++)
    for (const cards of lists) if (i < cards.length && pieces.length < limit && !pieces.some((piece) => piece.id === cards[i]!.id)) pieces.push(cards[i]!);
  return pieces;
}
