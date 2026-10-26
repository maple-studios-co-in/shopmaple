const link = (
  id: string,
  label: string,
  href = "/pages/contact",
  enabled = true,
) => ({ id, label, href, enabled });
export function customChrome() {
  return {
    announcement: {
      text: "Visit our new showroom",
      href: "/pages/our-story",
      enabled: true,
    },
    utilityLinks: [
      link("service", "Ask our team"),
      link("hidden", "Hidden utility", "/account", false),
    ],
    navigation: [
      {
        id: "living",
        label: "Lounge",
        href: "/collections/all",
        enabled: true,
        feature: "living" as const,
        columns: [
          {
            id: "seats",
            links: [
              {
                ...link("seating", "New seating", "/collections/sofas"),
                parent: true,
              },
              {
                ...link("hidden", "Hidden seat", "/collections/all", false),
                parent: false,
              },
            ],
          },
        ],
      },
      {
        id: "hide",
        label: "Hidden category",
        href: "/collections/all",
        enabled: false,
        feature: "none" as const,
        columns: [],
      },
    ],
    desktopDiscovery: [
      {
        ...link("custom", "Made for you"),
        enquirySubject: "A & B? #é",
        cta: "Ask us",
      },
    ],
    mobileQuickLinks: [
      link("saved", "My picks", "/favourites"),
      link("disabled", "Hidden quick", "/account", false),
    ],
    footer: {
      columns: [
        { key: "care" as const, enabled: true },
        { key: "shop" as const, enabled: true },
        { key: "help" as const, enabled: false },
      ],
      contactColumns: [
        { key: "marketplace" as const, enabled: false },
        { key: "service" as const, enabled: true },
        { key: "bulk" as const, enabled: true },
      ],
      shopHeading: "Explore Maple",
      helpHeading: "Hidden help",
      careHeading: "Talk to us",
      shopLinks: [
        link("story", "Meet Maple", "/pages/our-story"),
        link("hide", "Hidden shop", "/account", false),
      ],
      helpLinks: [link("help", "Hidden help link")],
      policyLinks: [
        link("privacy", "Your privacy", "/policies/privacy-policy"),
      ],
      addressLines: ["New showroom", "Delhi"],
      customerPhone: "+919876543210",
      customerPhoneLabel: "Customer telephone",
      customerEmail: "help@example.com",
      contactHeading: "Let us help",
      bulkHeading: "Business enquiries",
      serviceHeading: "Customer enquiries",
      findUsHeading: "Hidden marketplace",
      bulkPhone: "+919876543211",
      bulkPhoneLabel: "Business telephone",
      bulkEmail: "business@example.com",
      copyrightName: "Maple Studio",
      instagram: null,
      linkedin: "https://www.linkedin.com/company/maplefurnishers/",
    },
    whatsapp: {
      enabled: true,
      phone: "+919876543212",
      label: "Ask Maple on WhatsApp",
    },
  };
}
