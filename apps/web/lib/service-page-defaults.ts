import { bulkSectionKeys, contactSectionKeys, type ServicePagesContent } from "@shopmaple/contracts";
import { contactCategories } from "../app/pages/contact-content";

/** Original rendered copy; images, routes, contact destinations and operations stay fixed. */
export const defaultServicePages: ServicePagesContent = {
  contact: {
    title: "Contact Us",
    eyebrow: "GET IN TOUCH",
    heading: "Tell us what you need. We’ll help you shape it",
    helpEyebrow: "Everything we do starts with why",
    helpHeading: "Browse from category",
    cities: { eyebrow: "We Are Serving", heading: "20+ Cities" },
    sections: contactSectionKeys.map(key => ({ key, enabled: true })),
    categories: contactCategories.map((category, index) => ({
      key: (["tracking", "payment", "account", "warranty", "damage"] as const)[index]!,
      title: category.title,
      subtitle: category.subtitle,
      questions: category.questions.map((question, questionIndex) => ({
        key: (["q1", "q2", "q3", "q4", "q5"] as const)[questionIndex]!,
        question: question.question,
        answer: question.answer,
      })),
    })),
  },
  bulk: {
    title: "Bulk Enquiry",
    eyebrow: "Place Your Bulk Orders",
    heading: "Home Interior",
    subtitle: "Work 1:1 with expert interior designers",
    sections: bulkSectionKeys.map(key => ({ key, enabled: true })),
    cities: { eyebrow: "We Are Serving", heading: "20+ Cities" },
    trust: {
      heading: "Trusted By Designers, Businesses & Modern Spaces",
      metricValue: "100+",
      metricLabel: "Projects Delivered",
      items: [
        { key: "price", title: "Price match guarantee" },
        { key: "quality", title: "250+ Steps Quality Check" },
        { key: "materials", title: "Premium Materials" },
        { key: "custom", title: "Custom Solutions" },
      ],
    },
    process: {
      eyebrow: "Here’s How We Bring Your Dream Space to Life",
      heading: "How it Works",
      steps: [
        { key: "meet", title: "Meet Your Designer", body: "Bring your ideas, inspirations, and budget. Our expert designer will understand your needs and start shaping a plan that fits your lifestyle." },
        { key: "design", title: "Finalize Your Design", body: "Work one-on-one with your designer to refine the details. Get realistic 3D renders so you can visualize your space before it comes to life." },
        { key: "deliver", title: "Bring It Home", body: "Relax while we handle the rest — from crafting to installation. Shop directly from your design and watch your dream home come alive." },
      ],
    },
    business: {
      badge: "★ TRUSTED BY BUSINESSES",
      heading: "Looking for Bulk Orders?",
      body: "Source directly from one of India's trusted furnishing suppliers. Hotels, Interior Designers, Contractors, Offices, Retailers & Project Buyers can place large-volume requirements through our IndiaMART business channel.",
      features: ["Factory & Wholesale Pricing", "Bulk Quantity Support", "Custom Sizes & Specifications", "Dedicated Business Assistance", "PAN India Delivery"],
      cta: "Request Bulk Quote",
      trust: "Secure • Verified • Trusted by Businesses",
    },
  },
  returns: {
    title: "Return & Exchange",
    heading: "Return & Exchange",
    policyLabel: "Cancellation, Return & Refund Policy",
    intro: "Contact our team about your order.",
  },
};

export function resolveServicePages(value?: ServicePagesContent): ServicePagesContent {
  return structuredClone(value ?? defaultServicePages);
}
