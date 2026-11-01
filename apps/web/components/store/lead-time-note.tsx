/** A made-to-order piece's approved making time, as Keeri states it. Delivery comes after. */
export function LeadTimeNote({ variant }: { variant?: { stockPolicy: string; leadTimeDays?: number | null } }) {
  if (variant?.stockPolicy !== "made_to_order" || !variant.leadTimeDays) return null;
  return (
    <p data-lead-time className="text-meta text-taupe">
      Made to order: allow {variant.leadTimeDays} days for making, then delivery.
    </p>
  );
}
