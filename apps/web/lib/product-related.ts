/** The "You may also like" row: other pieces from the product's category, never the piece itself, at most `limit`. */
export function otherPieces<T extends { id: string }>(cards: T[], product: { id: string }, limit = 4): T[] {
  return cards.filter((card) => card.id !== product.id).slice(0, limit);
}
