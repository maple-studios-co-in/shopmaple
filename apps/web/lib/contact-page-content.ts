import { contactSectionKeys, legacyContactSectionKeys, type ContactPageContent, type ContactSectionKey } from "@shopmaple/contracts";
import { contactCategories } from "./contact-content";

/** A contact page with every field present: what the page and its editor work from. */
export type ResolvedContactPage = { [K in keyof ContactPageContent]-?: NonNullable<ContactPageContent[K]> };
type Category = ContactPageContent["categories"][number];
type Section = ContactPageContent["sections"][number];

const categoryKeys = ["tracking", "payment", "account", "warranty", "damage"] as const;
const questionKeys = ["q1", "q2", "q3", "q4", "q5"] as const;

/** The original template's copy, which the live store had published unchanged. */
export const legacyContactPage: ContactPageContent = {
  title: "Contact Us",
  eyebrow: "GET IN TOUCH",
  heading: "Tell us what you need. We’ll help you shape it",
  helpEyebrow: "Everything we do starts with why",
  helpHeading: "Browse from category",
  cities: { eyebrow: "We Are Serving", heading: "20+ Cities" },
  sections: legacyContactSectionKeys.map(key => ({ key, enabled: true })),
  categories: contactCategories.map((category, index) => ({
    key: categoryKeys[index]!,
    title: category.title,
    subtitle: category.subtitle,
    questions: category.questions.map((question, questionIndex) => ({
      key: questionKeys[questionIndex]!,
      question: question.question,
      answer: question.answer,
    })),
  })),
};

// The help centre's topics and questions as the design words them; the answers stay the store's own.
const topicTitles: Record<Category["key"], string> = {
  tracking: "Orders & delivery", payment: "Payments", account: "Your account", warranty: "Warranty", damage: "Damaged items",
};
const designQuestions: Partial<Record<Category["key"], Partial<Record<(typeof questionKeys)[number], string>>>> = {
  tracking: { q1: "How do I track my order?", q3: "What if I miss my delivery?", q5: "Can I update my delivery address?" },
  warranty: { q1: "Where can I check my warranty?" },
  damage: { q1: "What if my furniture arrives damaged?" },
};
// The design lists delivery's questions as track, timing, a missed delivery and the address; the distribution centre follows.
const designOrder: Partial<Record<Category["key"], string[]>> = { tracking: ["q1", "q4", "q3", "q5", "q2"] };
const inDesignOrder = (key: Category["key"], questions: Category["questions"]) => {
  const order = designOrder[key];
  return order ? order.map(name => questions.find(question => question.key === name)!) : questions;
};

/** The owner's redesign (Figma 298:511 "Maple / Contact / Desktop"; 10 Nov 2026). A line break in a heading stays a line break. */
export const defaultContactPage: ResolvedContactPage = {
  title: "Contact Us",
  eyebrow: "Contact / Maple Furnishers",
  heading: "A conversation.\nA considered beginning.",
  introBody: "For your home, your project, or a piece you have in mind.",
  reach: {
    call: { title: "Call us", note: "Speak to the Maple team" },
    write: { title: "Write to us", note: "For questions and support" },
    visit: { title: "Find us in Delhi", detail: "Kirti Nagar, New Delhi", note: "A-2/56–57, W.H.S, Delhi 110015" },
  },
  enquiryEyebrow: "Start a conversation",
  enquiryHeading: "Let’s shape\nsomething personal.",
  enquiryBody: "Whether you are choosing a finish or need help with an existing order, we’ll help you find the next step.",
  guidance: [
    { key: "order", title: "For an existing order", body: "Include your order number so our team can find the details." },
    { key: "project", title: "Planning a larger project?", body: "For designers, businesses and multi-piece requirements, explore Bulk Enquiry." },
  ],
  bulkCta: "Explore bulk enquiries",
  formHeading: "Send us a message",
  formNote: "We’ll use these details to respond to your enquiry.",
  helpEyebrow: "A little help, right here",
  helpHeading: "Find your next step.",
  helpBody: "Choose a topic, or browse a few common questions.",
  categories: legacyContactPage.categories.map(category => ({
    ...category,
    title: topicTitles[category.key],
    questions: inDesignOrder(category.key, category.questions).map(question => ({
      ...question,
      question: designQuestions[category.key]?.[question.key] ?? question.question,
    })),
  })),
  visitEyebrow: "Made in Delhi",
  visitHeading: "A real workshop. Real people.",
  visitBody: "Call the team to coordinate your visit.",
  visitCta: "Get directions",
  cities: { eyebrow: "We Are Serving", heading: "20+ Cities" },
  sections: contactSectionKeys.map(key => ({ key, enabled: key !== "cities" })),
};

/**
 * The template's wording before 1 Nov 2026, which the live store had published: it sent customers to an account the
 * store does not have. It counts as the original copy too.
 */
const earlierWording: Partial<Record<Category["key"], Partial<Record<(typeof questionKeys)[number], { question?: string; answer?: string }>>>> = {
  tracking: { q1: { answer: "Go to My Orders in your Maple Furnishers account to track your order." } },
  account: {
    q1: {
      question: "How to Create an Account with Maple Furnishers?",
      answer: "Click on the signup link, present at the top right corner of our maplefurnishers. This will show a pop-up menu where you can register from either of the following ways to get on board.\n\nManual form filling: You can manually fill up the form to register yourself by filling the general details.\n\nSign up through Gmail: You can also sign up through your Gmail account by clicking on “or continue with Gmail”, presented at the below side of the popup menu.\nYour maplefurnishers account is now ready.",
    },
  },
};
const retiredCopy = ["eyebrow", "heading", "helpEyebrow", "helpHeading"] as const;
const legacyKeys: readonly ContactSectionKey[] = legacyContactSectionKeys;

/**
 * An older list of regions in the redesign's terms: the old introduction carried the contact details, the form and the
 * address, so the ways to reach us and the enquiry follow it and the Delhi address follows the help, each shown as it
 * was. The redesign has no cities band; staff can show it again. A newer list keeps its order, gaining any region it lacks.
 */
function resolveSections(listed: readonly Section[]): Section[] {
  if (listed.every(item => legacyKeys.includes(item.key))) {
    const shown = listed.find(item => item.key === "intro")?.enabled ?? true;
    return listed.flatMap((item): Section[] => item.key === "intro" ? [{ ...item }, { key: "reach", enabled: shown }, { key: "enquiry", enabled: shown }]
      : item.key === "help" ? [{ ...item }, { key: "visit", enabled: shown }]
      : [{ key: item.key, enabled: false }]);
  }
  const sections = listed.map(item => ({ ...item }));
  for (const item of defaultContactPage.sections) if (!sections.some(section => section.key === item.key)) sections.push({ ...item });
  return sections;
}

/**
 * The page as it renders. Copy a revision still holds word for word from the original template reads as the redesign
 * does (the live store had published that copy unchanged), and delivery's questions take the design's order; anything
 * staff wrote stays. The redesign's new words fill in where an older revision has none.
 */
export function resolveContactPage(value?: ContactPageContent): ResolvedContactPage {
  if (!value) return structuredClone(defaultContactPage);
  const page: ResolvedContactPage = { ...structuredClone(defaultContactPage), ...structuredClone(value) } as ResolvedContactPage;
  for (const key of retiredCopy) if (value[key] === legacyContactPage[key]) page[key] = defaultContactPage[key];
  page.categories = value.categories.map(category => {
    const was = legacyContactPage.categories.find(item => item.key === category.key)!;
    const now = defaultContactPage.categories.find(item => item.key === category.key)!;
    const inKeyOrder = category.questions.map(question => question.key).join() === was.questions.map(question => question.key).join();
    return {
      key: category.key,
      title: category.title === was.title ? now.title : category.title,
      subtitle: category.subtitle,
      questions: (inKeyOrder ? inDesignOrder(category.key, category.questions) : category.questions).map(question => {
        const before = was.questions.find(item => item.key === question.key)!;
        const after = now.questions.find(item => item.key === question.key)!;
        const earlier = earlierWording[category.key]?.[question.key];
        const original = (field: "question" | "answer") => question[field] === before[field] || question[field] === earlier?.[field];
        return {
          key: question.key,
          question: original("question") ? after.question : question.question,
          answer: original("answer") ? after.answer : question.answer,
        };
      }),
    };
  });
  page.sections = resolveSections(value.sections);
  return page;
}
