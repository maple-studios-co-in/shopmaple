import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useAdminRequest } from "../components/admin/use-admin-request";
const dom = new JSDOM('<div id="root"></div>');
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  IS_REACT_ACT_ENVIRONMENT: true,
});
function Probe() {
  const send = useAdminRequest();
  const [result, setResult] = useState("Pending");
  useEffect(() => {
    void send("/api/admin/test")
      .then(async (response) =>
        setResult(
          `${response.status}:${response.body === null ? "bodyless" : "stream"}:${await response.text()}`,
        ),
      )
      .catch(() => setResult("Request failed"));
  }, [send]);
  return <p role="status">{result}</p>;
}
for (const status of [204, 205, 304])
  test(`HTTP ${status} returns a usable bodyless response when transport exposes an empty stream`, async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = async () => {
      const response = new Response("");
      Object.defineProperty(response, "status", { value: status });
      return response;
    };
    const container = document.getElementById("root")!;
    const root = createRoot(container);
    try {
      await act(async () => root.render(<Probe />));
      assert.equal(container.textContent, `${status}:bodyless:`);
    } finally {
      await act(async () => root.unmount());
      globalThis.fetch = previous;
    }
  });
