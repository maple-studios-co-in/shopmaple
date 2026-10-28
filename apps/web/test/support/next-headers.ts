// Server request headers for the preview page tests: the staff cookie the
// browser would send is set on globalThis by each test.
export async function headers() {
  const cookie = (globalThis as { __testCookie?: string }).__testCookie;
  return new Headers(cookie ? { cookie } : {});
}
