import { enquiryInputSchema, enquiryReceiptSchema, type EnquiryInput } from "@shopmaple/contracts";

export function createEnquirySender(transport: typeof fetch = fetch) {
  let previousPayload = "";
  let key = "";
  return async (input: EnquiryInput) => {
    const body = JSON.stringify(enquiryInputSchema.parse(input));
    if (body !== previousPayload) {
      key = crypto.randomUUID();
      previousPayload = body;
    }
    let response: Response;
    try {
      response = await transport("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body,
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error("We could not confirm your enquiry was saved. Please try again.");
    }
    if (response.status === 429) throw new Error("Too many enquiries. Please try again later.");
    if (!response.ok) throw new Error("Your enquiry could not be saved. Please check your details and try again.");
    try { return enquiryReceiptSchema.parse(await response.json()); }
    catch { throw new Error("We could not confirm your enquiry was saved. Please try again."); }
  };
}
