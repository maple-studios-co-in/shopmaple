export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}
export const categoryNames: Record<string, string> = {
  all: "All Furniture",
  sofas: "Sofas",
  chairs: "Chairs",
  tables: "Tables",
  beds: "Beds",
  storage: "Storage",
  outdoors: "Outdoors",
};
export const shopFile = (filename: string) =>
  "https://shop.maplefurnishers.com/cdn/shop/files/" + filename;

// The existing shop displays decimal rupees with international grouping.
export function shopMoney(paise: number) {
  return (
    "Rs. " +
    (paise / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
