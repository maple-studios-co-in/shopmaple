import assert from "node:assert/strict";
import { test } from "node:test";
import type { EditorialNode } from "@shopmaple/contracts";
import { policyOutline, readingSection } from "../lib/policy-outline";

const p = (...children: EditorialNode[]): EditorialNode => ({ tag: "p", children });
const h2 = (...children: EditorialNode[]): EditorialNode => ({ tag: "h2", children });
const ul = (...items: string[]): EditorialNode => ({ tag: "ul", children: items.map(item => ({ tag: "li", children: [item] })) });

// Catches the page losing the opening text, or numbering, naming or filling sections wrongly.
test("a policy opens with the text before its first heading, then one numbered section per heading", () => {
  const outline = policyOutline([
    p("Learn how we use your information."),
    h2("Your Privacy Matters"),
    p("We respect your privacy."),
    p("By using our website, you agree."),
    h2("Information We Collect"),
    { tag: "h3", children: ["Personal Information"] },
    ul("Name", "Email address"),
  ]);
  assert.deepEqual(outline.intro, [p("Learn how we use your information.")]);
  assert.deepEqual(outline.sections, [
    { id: "your-privacy-matters", number: "01", title: "Your Privacy Matters", nodes: [p("We respect your privacy."), p("By using our website, you agree.")] },
    { id: "information-we-collect", number: "02", title: "Information We Collect", nodes: [{ tag: "h3", children: ["Personal Information"] }, ul("Name", "Email address")] },
  ]);
});

// Catches section links that break on punctuation, formatting inside a heading, or a repeated heading.
test("each section gets a readable address of its own, even when headings repeat or carry formatting", () => {
  const { sections } = policyOutline([
    h2("Cookies & Tracking"),
    h2({ tag: "strong", children: ["Eligible Cases for Return / Replacement"] }),
    h2("Contact Us"),
    h2("Contact  ", { tag: "em", children: ["Us"] }),
    h2("Main"),
    h2("Customer care"),
  ]);
  assert.deepEqual(sections.map(({ id, title }) => [id, title]), [
    ["cookies-and-tracking", "Cookies & Tracking"],
    ["eligible-cases-for-return-replacement", "Eligible Cases for Return / Replacement"],
    ["contact-us", "Contact Us"],
    ["contact-us-2", "Contact Us"],
    // The store already uses id="main" for the page's main landmark.
    ["main-2", "Main"],
    // The Help pages' care block is labelled by id="customer-care-title".
    ["customer-care-2", "Customer care"],
  ]);
});

// Catches a tenth section numbered "010" or "1", and an empty heading becoming a blank entry in "On this page".
test("sections are numbered with two digits, and a heading with no words opens no section", () => {
  const nodes = Array.from({ length: 11 }, (_, index) => h2(`Part ${index + 1}`));
  nodes.splice(3, 0, h2("   "), "\n  ");
  const { intro, sections } = policyOutline(nodes);
  assert.deepEqual(sections.map(section => `${section.number} ${section.title}`), [
    "01 Part 1", "02 Part 2", "03 Part 3", "04 Part 4", "05 Part 5", "06 Part 6", "07 Part 7", "08 Part 8", "09 Part 9", "10 Part 10", "11 Part 11",
  ]);
  assert.deepEqual(intro, []);
  assert.deepEqual(sections[2]!.nodes, []);
});

// Catches a page that lost its text when the editor saved it without any headings.
test("a policy without headings keeps all of its text as the opening, with no sections", () => {
  const nodes = [p("One paragraph."), ul("A point")];
  assert.deepEqual(policyOutline(nodes), { intro: nodes, sections: [] });
});

// Catches "On this page" marking the wrong entry: a section scrolled past, or a short last section never lit.
test("the section being read is the last one whose heading has reached the reading line", () => {
  const line = 120;
  assert.equal(readingSection([300, 900, 1500], line, false), 0, "before the first heading arrives, the first section");
  assert.equal(readingSection([-400, 80, 700], line, false), 1);
  assert.equal(readingSection([-900, -300, 120], line, false), 2, "a heading exactly on the line counts");
  assert.equal(readingSection([-900, 200, 500], line, true), 2, "at the bottom of the page, the last section");
  assert.equal(readingSection([], line, true), -1, "no sections, nothing to mark");
});
