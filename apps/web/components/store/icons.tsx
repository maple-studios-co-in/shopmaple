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

/*
 * The header's line icons from "MF / Main navigation" (search 18 px, account and bag 21 px), drawn
 * inline in the current colour so hover and the brand colour come from the button.
 */
const line = { fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" className={className}>
      <path {...line} d="M15.75 15.75L12 12M13.5 7.5C13.5 9.0913 12.8679 10.6174 11.7426 11.7426C10.6174 12.8679 9.0913 13.5 7.5 13.5C5.9087 13.5 4.38258 12.8679 3.25736 11.7426C2.13214 10.6174 1.5 9.0913 1.5 7.5C1.5 5.9087 2.13214 4.38258 3.25736 3.25736C4.38258 2.13214 5.9087 1.5 7.5 1.5C9.0913 1.5 10.6174 2.13214 11.7426 3.25736C12.8679 4.38258 13.5 5.9087 13.5 7.5Z" />
    </svg>
  );
}

export function AccountIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" width="21" height="21" aria-hidden="true" focusable="false" className={className}>
      <path {...line} d="M3.5 19.25V16.625C3.5 14.7685 4.2375 12.988 5.55025 11.6753C6.86301 10.3625 8.64348 9.625 10.5 9.625C12.3565 9.625 14.137 10.3625 15.4497 11.6753C16.7625 12.988 17.5 14.7685 17.5 16.625V19.25M14 5.25C14 6.17826 13.6313 7.0685 12.9749 7.72487C12.3185 8.38125 11.4283 8.75 10.5 8.75C9.57174 8.75 8.6815 8.38125 8.02513 7.72487C7.36875 7.0685 7 6.17826 7 5.25C7 4.32174 7.36875 3.4315 8.02513 2.77513C8.6815 2.11875 9.57174 1.75 10.5 1.75C11.4283 1.75 12.3185 2.11875 12.9749 2.77513C13.6313 3.4315 14 4.32174 14 5.25Z" />
    </svg>
  );
}

export function BagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" width="21" height="21" aria-hidden="true" focusable="false" className={className}>
      <path {...line} d="M7 6.125H4.375L2.625 19.25H18.375L16.625 6.125H14M7 6.125H14M7 6.125V7M7 6.125V4.375C7 3.44674 7.36875 2.5565 8.02513 1.90013C8.6815 1.24375 9.57174 0.875 10.5 0.875C11.4283 0.875 12.3185 1.24375 12.9749 1.90013C13.6313 2.5565 14 3.44674 14 4.375V6.125M14 6.125V7" />
    </svg>
  );
}
