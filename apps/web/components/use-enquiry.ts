"use client";
import { useRef, useState } from "react";
import type { EnquiryInput } from "@shopmaple/contracts";
import { createEnquirySender } from "@/lib/enquiry-client";
export function useEnquiry() {
  const sender = useRef<ReturnType<typeof createEnquirySender> | null>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(input: EnquiryInput) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage(""); setFailed(false);
    try {
      sender.current ??= createEnquirySender();
      const receipt = await sender.current(input);
      setMessage(`Saved in this development preview. Team notification is not confirmed. Reference: ${receipt.reference}`);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error && !error.message.startsWith("[") ? error.message : "Please check your details and try again.");
    } finally { busy.current = false; setPending(false); }
  }
  return { submit, pending, message, failed, clear: () => { if (!busy.current) setMessage(""); } };
}
