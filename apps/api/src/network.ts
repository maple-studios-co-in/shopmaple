import { isIPv4, isIPv6 } from "node:net";

/**
 * Client networks for per-network limits (security review, 11 Nov 2026). One household or phone usually holds a whole
 * IPv6 /64 and can pick any address in it, so counting full IPv6 addresses would let one client look like millions.
 */

const bare = (address: string) => {
  const unbracketed = address.trim().replace(/^\[(.*)\]$/, "$1");
  const zone = unbracketed.indexOf("%");
  return zone >= 0 ? unbracketed.slice(0, zone) : unbracketed;
};

/** The eight 16-bit groups of a valid IPv6 address (an embedded dotted IPv4 tail becomes the last two groups). */
function ipv6Groups(address: string): number[] | null {
  if (!isIPv6(address)) return null;
  let text = address;
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = "", tail] = text.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array<string>(8 - front.length - back.length).fill("0");
  const groups = [...front, ...fill, ...back].map((group) => parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff) ? groups : null;
}

/** ::ffff:a.b.c.d as a.b.c.d. */
function mappedIPv4(groups: number[]) {
  if (!groups.slice(0, 5).every((group) => group === 0) || groups[5] !== 0xffff) return null;
  const [high, low] = [groups[6]!, groups[7]!];
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

/** An IPv4 address as itself (/32); an IPv6 address by its /64, as "2001:db8:abcd:12::/64"; an IPv4-mapped IPv6 address
 * (::ffff:a.b.c.d, as dual-stack sockets report IPv4 clients) as its IPv4 address. Anything else is kept as given. */
export function networkKey(address: string): string {
  const ip = bare(address);
  if (isIPv4(ip)) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip.slice(0, 100);
  return mappedIPv4(groups) ?? `${groups.slice(0, 4).map((group) => group.toString(16)).join(":")}::/64`;
}

/** 127.0.0.0/8 or ::1, plain or IPv4-mapped. */
export function isLoopbackAddress(address?: string): boolean {
  if (!address) return false;
  const ip = bare(address);
  if (isIPv4(ip)) return ip.startsWith("127.");
  const groups = ipv6Groups(ip);
  if (!groups) return false;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  return mappedIPv4(groups)?.startsWith("127.") ?? false;
}
