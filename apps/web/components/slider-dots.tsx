/** The slide dots under a slider: real buttons, the current one `aria-current`. The slider's lazy script makes them work. */
export function SliderDots({ count, label = "Show slide", ...props }: { count: number; label?: string } & React.ComponentProps<"div">) {
  if (count < 2) return null;
  return (
    <div className="slider-dots" {...props}>
      {Array.from({ length: count }, (_, i) => (
        <button type="button" key={i} data-slider-dot aria-label={`${label} ${i + 1}`} aria-current={i === 0 ? "true" : undefined} />
      ))}
    </div>
  );
}
