"use client";
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  maxLength = 1000,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  maxLength?: number;
}) {
  const props = {
    "aria-label": label,
    value,
    maxLength,
    onInput: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.currentTarget.value),
  };
  return (
    <label className="admin-field">
      <span>{label}</span>
      {multiline ? (
        <textarea {...props} rows={4} />
      ) : (
        <input {...props} type="text" />
      )}
    </label>
  );
}
