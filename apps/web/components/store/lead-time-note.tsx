/** A made-to-order piece's approved making time, as Keeri states it. Delivery comes after. */
export function LeadTimeNote({ variant, className = "text-meta text-taupe" }: { variant?: { stockPolicy: string; leadTimeDays?: number | null }; className?: string }) {
  if (variant?.stockPolicy !== "made_to_order" || !variant.leadTimeDays) return null;
  return (
    <p data-lead-time className={className}>
      Made to order: allow {variant.leadTimeDays} days for making, then delivery.
    </p>
  );
}
