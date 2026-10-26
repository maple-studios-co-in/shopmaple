import type { HomeCityKey, HomeCitiesLayout } from "@shopmaple/contracts";

/** Stable identities in the original artwork order. Unknown illustrations retain neutral labels. */
export const defaultHomeCitiesLayout: HomeCitiesLayout = [
  { key: "delhi", enabled: true },
  { key: "kolkata", enabled: true },
  { key: "hyderabad", enabled: true },
  { key: "varanasi", enabled: true },
  { key: "mumbai", enabled: true },
  { key: "jaipur", enabled: true },
  { key: "bengaluru", enabled: true },
  { key: "chennai", enabled: true },
  { key: "gujarat", enabled: true },
  { key: "artwork-1", enabled: true },
  { key: "artwork-2", enabled: true },
  { key: "artwork-3", enabled: true },
  { key: "artwork-4", enabled: true },
  { key: "artwork-5", enabled: true },
  { key: "artwork-6", enabled: true },
  { key: "artwork-7", enabled: true },
  { key: "artwork-8", enabled: true },
  { key: "agra", enabled: true },
];

export const homeCityNames: Record<HomeCityKey, string> = {
  delhi: "Delhi", kolkata: "Kolkata", hyderabad: "Hyderabad", varanasi: "Varanasi",
  mumbai: "Mumbai", jaipur: "Jaipur", bengaluru: "Bengaluru", chennai: "Chennai", gujarat: "Gujarat",
  "artwork-1": "City artwork 1", "artwork-2": "City artwork 2", "artwork-3": "City artwork 3",
  "artwork-4": "City artwork 4", "artwork-5": "City artwork 5", "artwork-6": "City artwork 6",
  "artwork-7": "City artwork 7", "artwork-8": "City artwork 8", agra: "Agra",
};
