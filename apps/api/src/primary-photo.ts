/**
 * Which photo leads (owner, 14 Nov 2026): "the primary product photo must lead, with dimension or diagram images never
 * first". Keeri labels each photo's role (front, angle, lifestyle, dimension ...); its dimension drawings follow every
 * photograph, and within each group staff's order (position, then id) holds. A design with only drawings still shows
 * them. Used for the product's photos, each variant's photos and the product page gallery, so cards, the product page,
 * the bag, the order emails and the WhatsApp picture all start with a photograph of the piece.
 */
export const drawingRoles: ReadonlySet<string> = new Set(["dimension"]);

type Ordered = { role?: string | null; position: number; id: string };
const isDrawing = (row: Ordered) => drawingRoles.has(row.role?.trim().toLowerCase() ?? "");

export function compareLeadPhoto(a: Ordered, b: Ordered) {
  return Number(isDrawing(a)) - Number(isDrawing(b)) || a.position - b.position || a.id.localeCompare(b.id);
}
export function leadPhotoOrder<T extends Ordered>(rows: readonly T[]): T[] {
  return [...rows].sort(compareLeadPhoto);
}
