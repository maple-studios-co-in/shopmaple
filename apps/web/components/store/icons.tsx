/** The design's save heart (Figma "Save product"), drawn inline so the saved state can fill it. */
export function HeartIcon({ filled = false, className }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M10 17.5C10 17.5 2.5 12.5 2.5 6.66667C2.5 5.79216 2.77516 4.93981 3.28649 4.23037C3.79783 3.52093 4.51942 2.99036 5.34905 2.71382C6.17868 2.43728 7.0743 2.42878 7.90903 2.68953C8.74376 2.95028 9.47529 3.46706 10 4.16667C10.5247 3.46706 11.2562 2.95028 12.091 2.68953C12.9257 2.42878 13.8213 2.43728 14.6509 2.71382C15.4806 2.99036 16.2022 3.52093 16.7135 4.23037C17.2248 4.93981 17.5 5.79216 17.5 6.66667C17.5 12.5 10 17.5 10 17.5Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
