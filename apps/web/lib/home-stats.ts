export type HomeStat = { value: string; label: string };

const sentence = (words: string) => words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();

/**
 * The figures the numbers band shows, read from words the admin already wrote: a "36-Month
 * Warranty" promise and a "20+ Cities" heading. A line that states no figure adds nothing, so
 * the band never shows a number nobody entered.
 */
export function homeStats(promises: string[], citiesHeading: string): HomeStat[] {
  const stats: HomeStat[] = [];
  for (const promise of promises) {
    const warranty = /^(\d+\+?)[-\s]+(months?)\s+(warranty)$/i.exec(promise.trim());
    if (warranty) { stats.push({ value: warranty[1]!, label: sentence(`${warranty[2]} ${warranty[3]}`) }); break; }
  }
  const cities = /^(\d+\+?)\s+(\S.*)$/.exec(citiesHeading.trim());
  if (cities) stats.push({ value: cities[1]!, label: cities[2]! });
  return stats;
}
