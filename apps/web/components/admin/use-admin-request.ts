"use client";
import { useCallback, useEffect, useRef } from "react";

export class AdminRequestTimeout extends Error {
  constructor() {
    super("Admin request timed out");
    this.name = "AdminRequestTimeout";
  }
}
/** Bound the entire response, including a body that stalls after headers arrive. */
export function useAdminRequest() {
  const pending = useRef(new Set<AbortController>());
  useEffect(
    () => () => {
      for (const controller of pending.current) controller.abort();
      pending.current.clear();
    },
    [],
  );
  return useCallback(
    async (path: string, options?: Omit<RequestInit, "signal">) => {
      const controller = new AbortController();
      pending.current.add(controller);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15_000);
      try {
        const response = await fetch(path, {
          ...options,
          signal: controller.signal,
        });
        // Fetch transports may expose an empty stream for a bodyless status.
        // Response construction forbids even an empty ArrayBuffer for these codes.
        const bodyless = [204, 205, 304].includes(response.status);
        const body =
          !bodyless && response.body ? await response.arrayBuffer() : null;
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        if (timedOut) throw new AdminRequestTimeout();
        throw error;
      } finally {
        clearTimeout(timer);
        pending.current.delete(controller);
      }
    },
    [],
  );
}
