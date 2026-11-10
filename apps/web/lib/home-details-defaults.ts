import type { HomeDetails } from "@shopmaple/contracts";

/** Details with the parts added after the first published documents filled in. */
export type ResolvedHomeDetails = Omit<HomeDetails, "cities"> & Required<Pick<HomeDetails, "editorial" | "compare">> & { cities: Required<HomeDetails["cities"]> };

const citiesPromise = "Delivering comfort and elegance across India.";

/** Original rendered homepage copy, including spaces around the emphasized response time. */
export const defaultHomeDetails: HomeDetails = {
  hero: {
    cta: "Explore Collection",
    tiles: [
      { key: "sofas", label: "Sofas", priceLabel: "Starting from ₹25,000" },
      { key: "chairs", label: "Chairs", priceLabel: "Starting from ₹8,000" },
      { key: "tables", label: "Tables", priceLabel: "Starting from ₹12,000" },
      { key: "beds", label: "Beds", priceLabel: "Starting from ₹55,000" },
    ],
  },
  difference: {
    eyebrow: "The Maple Difference", heading: "Every element is yours to reshape", cta: "Tell Us About Your Space",
    promises: ["Fully Customizable", "Delivery Across India", "In-House Crafted in Delhi", "36-Month Warranty"],
  },
  nimbus: {
    heading: "The Nimbus Collection", tagline: "Soft presence. Strong craftsmanship.",
    features: ["Cloud Like Comfort", "Soft Silhouettes", "Airy Luxury", "Modern Spaces"], cta: "Explore",
    // The frame's second collection (Figma 1:1069), photographed in a sunlit travertine lobby. It opens the Terra page
    // (Figma 311:921, 10 Nov 2026).
    slides: [{
      heading: "The Terra Collection", tagline: "Soft presence. Strong craftsmanship.",
      features: ["Earthy Textures", "Organic Curves", "Warm Woods", "Grounded Comfort"], cta: "Explore", href: "/terra-collection",
      image: "/media/home/nimbus-terra.webp", mobileImage: "/media/home/nimbus-terra-mobile.webp",
      alt: "A curved olive sofa with floral cushions and a round walnut table in a sunlit travertine lobby",
    }],
  },
  testimonial: {
    title: "Getting our sofa made by Maple was a completely hassle-free experience.",
    paragraphs: [
      "From the first conversation to the final delivery, the process felt smooth and well-managed.",
      "What we appreciated most was the guidance. They didn’t just take the order, they helped us choose the right size, fabric, colour tone, and overall look according to our space.",
      "The final sofa feels premium, comfortable, and beautifully finished. The quality is visible in the stitching, cushioning, and overall build.",
      "Delivery was on time, and everything was handled professionally. Truly a no-stress experience from start to finish.",
    ],
    name: "Anjali Gupta", attribution: " — Verified Customer",
  },
  newsletter: {
    heading: "Soft presence. Strong craftsmanship.",
    body: "Furniture made for rooms that feel as good as they look.",
    signupHeading: "New Collections. Early Access. No Noise.",
  },
  values: [
    { key: "quiet-luxury", title: "Quiet Luxury", body: "Furniture that doesn’t shout, but makes the room feel complete" },
    { key: "real-living", title: "Built for Real Living", body: "Not made only for photographs. Made for everyday comfort and use" },
    { key: "ages-beautifully", title: "Ages Beautifully", body: "Wood grains deepen. Fabrics soften. The piece becomes better with time" },
    { key: "strength", title: "Strength You Don’t See", body: "A solid frame, lasting structure, and details that stay quiet for years." },
  ],
  cities: { eyebrow: "We Are Serving", heading: "20+ Cities", description: citiesPromise },
  project: {
    heading: "Have a Space in Mind?",
    introBefore: "Describe your project to us and our team will come back within ",
    responseTime: "24 hours",
    introAfter: " with options, pricing, and a clear timeline.",
    body: "Whether the brief is a single statement chair or a complete room, the process starts the same way: with a conversation.",
  },
  editorial: {
    title: "Pull up a chair", text: "There's always something worth staying for.", cta: "Shop Dining", href: "/collections/dinings",
    leftImage: "/media/home/editorial-left.webp", leftAlt: "A marble dining table on a fluted pedestal beside a tall window",
    rightImage: "/media/home/editorial-right.webp", rightAlt: "A woman pouring coffee at a dining table with sunflowers, cream upholstered chairs and a pug",
  },
  compare: {
    eyebrow: "Find your feel", heading: "Two ways to unwind",
    lede: "Explore distinct silhouettes and choose the one that feels at home in your space.",
    left: { handle: "aera-swivel-lounge-chair", label: "Aera" }, right: { handle: "caro", label: "Caro" },
  },
};

export function resolveHomeDetails(value?: HomeDetails): ResolvedHomeDetails {
  // Documents published before the editorial and compare sections carry neither: they start from the defaults. The same
  // goes for the promise under the cities' figure, added later still.
  const details = { ...defaultHomeDetails, ...value } as ResolvedHomeDetails;
  return structuredClone({ ...details, cities: { ...details.cities, description: details.cities.description ?? citiesPromise } });
}
