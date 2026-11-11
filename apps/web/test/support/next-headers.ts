// Standalone server-rendering tests run outside a Next request, where next/headers throws. This stand-in serves the
// request cookies a test sets with `setRequestCookies` (test/tsconfig.json maps next/headers here).
let jar = new Map<string, string>();

export function setRequestCookies(cookies: Record<string, string>) {
  jar = new Map(Object.entries(cookies));
}

export async function cookies() {
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    has: (name: string) => jar.has(name),
  };
}

export async function headers() {
  const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  return new Headers(cookie ? { cookie } : {});
}
