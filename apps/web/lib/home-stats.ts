export type HomeStat = { value: string; label: string; description: string };

const sentence = (words: string) => words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();

/**
 * The figures the numbers band shows, read from words the admin already wrote: a "36-Month
 * Warranty" promise and a "20+ Cities" heading. A line that states no figure adds nothing, so
 * the band never shows a number nobody entered. Each figure carries the frame's line beneath it.
 */
export function homeStats(promises: string[], citiesHeading: string): HomeStat[] {
  const stats: HomeStat[] = [];
  for (const promise of promises) {
    const warranty = /^(\d+\+?)[-\s]+(months?)\s+(warranty)$/i.exec(promise.trim());
    if (warranty) {
      stats.push({ value: warranty[1]!, label: sentence(`${warranty[2]} ${warranty[3]}`), description: "Built with lasting structure and care." });
      break;
    }
  }
  const cities = /^(\d+\+?)\s+(\S.*)$/.exec(citiesHeading.trim());
  // The frame reads "Cities served"; a heading that already says so is kept as written.
  if (cities) stats.push({ value: cities[1]!, label: /\bserved\b/i.test(cities[2]!) ? cities[2]! : `${cities[2]} served`, description: "Delivery across India." });
  return stats;
}

/** A figure split for the count-up: the whole number it climbs to and what follows it ("20+" is 20 and "+"). */
export function countTarget(value: string): { to: number; suffix: string } | null {
  const match = /^(\d{1,6})(\D*)$/.exec(value.trim());
  return match ? { to: Number(match[1]), suffix: match[2]! } : null;
}
