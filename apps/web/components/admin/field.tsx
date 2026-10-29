"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** A labelled text field (shadcn form item anatomy): label above its control, a length hint near the limit. */
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  maxLength = 1000,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const props = {
    "aria-label": label,
    value,
    maxLength,
    onInput: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.currentTarget.value),
    // Edits arrive through onInput; this only tells React the value is controlled on purpose.
    onChange: () => {},
  };
  const near = value.length >= maxLength * 0.8;
  return (
    <div data-slot="form-item" data-span={multiline ? "full" : undefined} className={cn("relative grid min-w-0 gap-2", className)}>
      <label className="grid min-w-0 gap-2">
        <span className="pr-14 text-[12.5px] font-medium text-foreground">{label}</span>
        {multiline ? (
          <Textarea {...props} rows={4} className="min-h-24 bg-card text-[13.5px] leading-relaxed" />
        ) : (
          <Input {...props} type="text" className="h-10 bg-card text-[13.5px]" />
        )}
      </label>
      {near && <span className="absolute top-0 right-0 text-[11px] text-faint tabular-nums" aria-hidden="true">{value.length}/{maxLength}</span>}
    </div>
  );
}
