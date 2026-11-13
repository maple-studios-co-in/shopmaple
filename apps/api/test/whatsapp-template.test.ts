import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatDeliveryWindow,
  formatRupees,
  orderConfirmationBody,
  orderConfirmationButtons,
  orderConfirmationMediaPath,
  orderConfirmationSample,
  orderConfirmationTemplate,
  orderConfirmationVariables,
  orderConfirmationWhatsApp,
  piecesLine,
  type OrderConfirmationInput,
} from "@shopmaple/contracts/whatsapp";

// The WhatsApp order confirmation (Figma 394:1456 and 394:1477; owner, 11 Nov 2026): the template text submitted to Meta
// and the pure builder that fills it for one order.
const store = "https://shop.maplefurnishers.com";
const sample: OrderConfirmationInput = { ...orderConfirmationSample, origin: store, mediaUrl: `${store}/whatsapp/order-media/nola` };
const characters = (text: string) => Array.from(text).length;
const bodyValues = (input: OrderConfirmationInput) => orderConfirmationWhatsApp(input).template.components[1].parameters.map((parameter) => parameter.text);
// The invisible characters fed in below, by code point, so this file stays plain ASCII.
const [nextLine, noBreakSpace, lineSeparator, rightToLeftOverride] = [0x85, 0xa0, 0x2028, 0x202e].map((code) => String.fromCharCode(code)) as [
  string,
  string,
  string,
  string,
];
const lineBreaks = new Set([0x0a, 0x0d, 0x09, 0x85, 0x2028, 0x2029]);

// Catches drifting from the Figma message, or a body Meta would refuse (variables out of order, first or last, too long).
test("the body is the Figma message with its title as the bold first line", () => {
  assert.equal(
    orderConfirmationBody,
    [
      "*Order confirmed*",
      "",
      "Hi {{1}}, thank you for choosing Maple.",
      "",
      "#{{2}}",
      "{{3}}",
      "Amount paid: {{4}}",
      "",
      "Estimated delivery: {{5}}",
      "{{6}}",
      "",
      "We’ll send tracking once dispatched.",
    ].join("\n"),
  );
  assert.deepEqual([...orderConfirmationBody.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(orderConfirmationVariables.map((variable) => variable.placeholder), ["{{1}}", "{{2}}", "{{3}}", "{{4}}", "{{5}}", "{{6}}"]);
  assert.doesNotMatch(orderConfirmationBody, /^\{\{|\}\}$/, "a template may not start or end with a variable");
  const longest = orderConfirmationVariables.reduce((total, variable) => total + variable.maxLength, characters(orderConfirmationBody));
  assert.ok(longest <= 1024, `the fullest message is ${longest} characters, within WhatsApp's 1024`);
  for (const button of orderConfirmationButtons) assert.ok(button.text.length <= 25, "button text fits WhatsApp's 25 characters");
});

// Catches the preview and the sent message saying different things, or the submitted samples drifting from the builder.
test("the Figma sample order becomes the Cloud API template and the preview", () => {
  const { template, preview } = orderConfirmationWhatsApp(sample);
  const values = ["Aditi", "MF-10482", "Nola Accent Chair × 1", "₹26,400", "24–28 Nov 2026", "Bengaluru · 560001"];
  assert.deepEqual(template, {
    name: "order_confirmation",
    language: { code: "en" },
    components: [
      { type: "header", parameters: [{ type: "image", image: { link: `${store}/whatsapp/order-media/nola` } }] },
      { type: "body", parameters: values.map((text) => ({ type: "text", text })) },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: orderConfirmationSample.orderNumber }] },
    ],
  });
  assert.deepEqual(orderConfirmationVariables.map((variable) => variable.sample), values, "the samples Meta reviews are this message");
  assert.deepEqual(preview, {
    mediaUrl: `${store}/whatsapp/order-media/nola`,
    title: "Order confirmed",
    paragraphs: [
      { lines: ["Hi Aditi, thank you for choosing Maple."], muted: false },
      { lines: ["#MF-10482", "Nola Accent Chair × 1", "Amount paid: ₹26,400"], muted: false },
      { lines: ["Estimated delivery: 24–28 Nov 2026", "Bengaluru · 560001"], muted: true },
      { lines: ["We’ll send tracking once dispatched."], muted: true },
    ],
    buttons: [
      { text: "View order", url: `${store}/account/orders/${orderConfirmationSample.orderNumber}` },
      { text: "Contact Maple", url: `${store}/contact` },
    ],
    text: [
      "*Order confirmed*",
      "",
      "Hi Aditi, thank you for choosing Maple.",
      "",
      "#MF-10482",
      "Nola Accent Chair × 1",
      "Amount paid: ₹26,400",
      "",
      "Estimated delivery: 24–28 Nov 2026",
      "Bengaluru · 560001",
      "",
      "We’ll send tracking once dispatched.",
    ].join("\n"),
  });
});

// Catches a definition Meta would read differently from what the store sends.
test("the template definition is a utility template with an image header and two URL buttons", () => {
  const definition = orderConfirmationTemplate(`${store}/`);
  assert.equal(definition.name, "order_confirmation");
  assert.equal(definition.language, "en");
  assert.equal(definition.category, "UTILITY");
  assert.deepEqual(definition.components[0], { type: "HEADER", format: "IMAGE" });
  assert.deepEqual(definition.components[1], { type: "BODY", text: orderConfirmationBody, example: { body_text: [orderConfirmationVariables.map((v) => v.sample)] } });
  assert.deepEqual(definition.components[2], {
    type: "BUTTONS",
    buttons: [
      { type: "URL", text: "View order", url: `${store}/account/orders/{{1}}`, example: [`${store}/account/orders/${orderConfirmationSample.orderNumber}`] },
      { type: "URL", text: "Contact Maple", url: `${store}/contact` },
    ],
  });
  assert.throws(() => orderConfirmationTemplate("http://shop.maplefurnishers.com"), RangeError);
});

// Catches WhatsApp error 132018 (a parameter with a line break, a tab or a run of spaces) and over-long values.
test("every parameter is one trimmed line within its length", () => {
  const messy = bodyValues({
    ...sample,
    firstName: `  Aditi\n\tRao${lineSeparator} `,
    orderNumber: " MF-10482\r\n",
    pieces: [{ title: `Nola\tAccent\n\nChair${String.fromCharCode(0)} ${rightToLeftOverride}Teak`, quantity: 1 }],
    city: `Bengaluru${noBreakSpace.repeat(5)} Urban${nextLine}`,
  });
  assert.deepEqual(messy, ["Aditi Rao", "MF-10482", "Nola Accent Chair Teak × 1", "₹26,400", "24–28 Nov 2026", "Bengaluru Urban · 560001"]);
  const long = bodyValues({
    ...sample,
    firstName: "Venkata".repeat(20),
    orderNumber: "MF-9999999999",
    pieces: Array.from({ length: 12 }, (_, index) => ({ title: `Handcrafted Solid Sheesham Wood Piece ${index + 1}`, quantity: 2 })),
    city: "Thiruvananthapuram ".repeat(6),
  });
  for (const values of [messy, long, bodyValues(sample)]) {
    values.forEach((text, index) => {
      assert.ok(![...text].some((character) => lineBreaks.has(character.codePointAt(0)!)), "no line breaks");
      assert.doesNotMatch(text, / {2}/);
      assert.equal(text, text.trim());
      assert.ok(characters(text) <= orderConfirmationVariables[index]!.maxLength, `${orderConfirmationVariables[index]!.placeholder} fits`);
    });
  }
  assert.equal(long[0], "Venkata".repeat(20).slice(0, 39) + "…");
  assert.equal(long[5], "Thiruvananthapuram Thiruvananthapuram Thiruvananth… · 560001", "the city gives way, never the PIN code");
  assert.equal(long[2], "Handcrafted Solid Sheesham Wood Piece 1 × 2, Handcrafted Solid Sheesham Wood Piece 2 × 2 and 20 more pieces");
  assert.equal(bodyValues({ ...sample, firstName: " \n " })[0], "there", "no name reads “Hi there”");
  assert.equal(bodyValues({ ...sample, city: "" })[5], "560001");
});

// Catches several pieces spilling onto lines, or a long order losing count of its pieces.
test("several pieces share one line, and a long list ends with a count of the rest", () => {
  assert.equal(piecesLine([{ title: "Nola Accent Chair", quantity: 1 }, { title: "Oak Side Table", quantity: 2 }]), "Nola Accent Chair × 1, Oak Side Table × 2");
  const many = [
    { title: "Nola Accent Chair", quantity: 1 },
    { title: "Oak Side Table", quantity: 2 },
    { title: "Terra Three Seater Sofa in Sage Boucle", quantity: 1 },
    { title: "Nimbus Cloud Lounge Chair", quantity: 2 },
    { title: "Maple Walnut Dining Table for Six", quantity: 1 },
  ];
  assert.equal(piecesLine(many), "Nola Accent Chair × 1, Oak Side Table × 2, Terra Three Seater Sofa in Sage Boucle × 1 and 3 more pieces");
  assert.equal(piecesLine(many.slice(0, 4), 90), "Nola Accent Chair × 1, Oak Side Table × 2 and 3 more pieces");
  assert.equal(piecesLine([many[2]!, many[1]!], 40), "Terra Three Seate… × 1 and 2 more pieces", "a long first piece is shortened");
  assert.equal(piecesLine([many[2]!, many[0]!], 60), "Terra Three Seater Sofa in Sage Boucle × 1 and 1 more piece");
  for (const pieces of [[], [{ title: "Chair", quantity: 0 }], [{ title: "Chair", quantity: 1.5 }]])
    assert.throws(() => piecesLine(pieces), RangeError);
});

// Catches paise shown on whole amounts, Western digit grouping, and fractions of paise.
test("amounts are rupees with Indian grouping and paise only when there are some", () => {
  assert.equal(formatRupees(2_640_000), "₹26,400");
  assert.equal(formatRupees(2_640_050), "₹26,400.50");
  assert.equal(formatRupees(12_345_678), "₹1,23,456.78");
  assert.equal(formatRupees(1_234_567_800), "₹1,23,45,678");
  assert.equal(formatRupees(50), "₹0.50");
  assert.equal(formatRupees(0), "₹0");
  for (const paise of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => formatRupees(paise), RangeError);
});

// Catches a window across a month or a year losing its month or year, and impossible days.
test("delivery windows read as the Figma frame writes them, across months and years", () => {
  assert.equal(formatDeliveryWindow("2026-11-24", "2026-11-28"), "24–28 Nov 2026");
  assert.equal(formatDeliveryWindow("2026-11-28", "2026-12-02"), "28 Nov – 2 Dec 2026");
  assert.equal(formatDeliveryWindow("2026-12-30", "2027-01-02"), "30 Dec 2026 – 2 Jan 2027");
  assert.equal(formatDeliveryWindow("2026-11-24", "2026-11-24"), "24 Nov 2026");
  assert.equal(formatDeliveryWindow("2026-09-01", "2026-09-05"), "1–5 Sep 2026", "September is Sep, as the frames write it");
  for (const [from, to] of [["2026-11-28", "2026-11-24"], ["2026-02-30", "2026-03-02"], ["24/11/2026", "28/11/2026"], ["2026-11-24T00:00:00Z", "2026-11-28"]])
    assert.throws(() => formatDeliveryWindow(from!, to!), RangeError, `${from} – ${to}`);
});

// Catches a message pointing at another site, an http image, or a forged order path.
test("an order without what the message needs is refused", () => {
  const refused: Partial<OrderConfirmationInput>[] = [
    { origin: "http://shop.maplefurnishers.com" },
    { origin: `${store}/shop` },
    { origin: `${store}/?ref=1` },
    { origin: "not a URL" },
    { mediaUrl: "http://cdn.example.com/photo.png" },
    { mediaUrl: "/whatsapp/order-media/nola" },
    { orderNumber: "SO-2026-0042" },
    { orderNumber: "MF-10482/../../admin" },
    { orderNumber: " \n " },
    { pieces: [] },
    { pincode: "56001" },
    { amountPaidPaise: -5 },
    { delivery: { from: "2026-11-28", to: "2026-11-24" } },
  ];
  for (const patch of refused) assert.throws(() => orderConfirmationWhatsApp({ ...sample, ...patch }), RangeError, JSON.stringify(patch));
  const lower = orderConfirmationWhatsApp({ ...sample, orderNumber: " mf-10482 " });
  assert.equal(lower.template.components[2].parameters[0].text, "MF-10482", "the order path is the number as the account pages write it");
  // The development preview runs on this computer over http.
  const local = orderConfirmationWhatsApp({ ...sample, origin: "http://127.0.0.1:3100", mediaUrl: "http://127.0.0.1:3100/whatsapp/order-media/nola" });
  assert.equal(local.preview.buttons[1]!.url, "http://127.0.0.1:3100/contact");
  assert.equal(orderConfirmationMediaPath("nola"), "/whatsapp/order-media/nola");
  for (const handle of ["../secret", "Nola", "nola chair", ""]) assert.throws(() => orderConfirmationMediaPath(handle), RangeError);
});
