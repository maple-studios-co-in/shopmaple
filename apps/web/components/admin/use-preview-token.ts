"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { previewTokenLeadMs, previewTokenState, type PreviewTokenState } from "@/lib/live-preview";

/** What minting a preview token came to; null means the session expired and the editor took over. */
export type MintResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; code: "draft-required" | "rate-limited" | "conflict" | "unavailable"; message: string };
export type MintError = Extract<MintResult, { ok: false }>;
export type PreviewToken = {
  /** A token for the current draft version, or null while there is none. */
  token: string | null;
  minting: boolean;
  error: MintError | null;
  retry: () => void;
};

const emptyToken: PreviewTokenState = { token: "", version: null, expiresAt: null };

/**
 * The one preview token the live preview and the section thumbnails share. Tokens are bound to
 * a draft version, so it mints once per version and attempt while `active`, never re-sends an
 * attempt that failed (a manual retry starts a new one), and mints again shortly before expiry.
 */
export function usePreviewToken({ version, draftRequired, active, mint }: {
  version: number | null;
  /** No draft has been saved yet (version 0): the API cannot mint until one explicit save. */
  draftRequired: boolean;
  /** Something on screen needs the token: the live preview or a visible thumbnail. */
  active: boolean;
  mint: (version: number) => Promise<MintResult | null>;
}): PreviewToken {
  const [tokenState, setTokenState] = useState<PreviewTokenState>(emptyToken);
  const [minting, setMinting] = useState(false);
  const [error, setError] = useState<MintError | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** The (version, attempt) pair already sent to the API; a failure never re-sends it. */
  const sent = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  /** The version on screen now; a mint that answers for an older one is dropped. */
  const latest = useRef(version);
  useEffect(() => { latest.current = version; }, [version]);

  useEffect(() => {
    if (!active || version === null || draftRequired || minting || error) return;
    if (previewTokenState(tokenState, version, Date.now()) !== "mint") return;
    const key = `${version}:${attempt}`;
    if (sent.current === key) return;
    sent.current = key;
    setMinting(true);
    void mint(version).then((result) => {
      if (!alive.current) return;
      setMinting(false);
      if (!result || latest.current !== version) return;
      if (!result.ok) { setError(result); return; }
      const expiresAt = Date.parse(result.expiresAt);
      setTokenState({ token: result.token, version, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + previewTokenLeadMs * 2 });
    });
  }, [active, version, draftRequired, tokenState, minting, error, attempt, mint]);
  useEffect(() => {
    if (tokenState.expiresAt === null) return;
    const delay = Math.max(0, tokenState.expiresAt - previewTokenLeadMs - Date.now());
    const timer = setTimeout(() => setAttempt((value) => value + 1), delay);
    return () => clearTimeout(timer);
  }, [tokenState]);
  // A new version is a new attempt; an error from an older version no longer applies.
  useEffect(() => { setError(null); }, [version]);
  const retry = useCallback(() => { setError(null); setAttempt((value) => value + 1); }, []);

  // An expired token (a sleeping laptop, a long stay on another screen) is never handed out:
  // a frame opened with it would show the preview's error page.
  const current = tokenState.token !== "" && tokenState.version === version && (tokenState.expiresAt ?? 0) > Date.now();
  return { token: current ? tokenState.token : null, minting, error, retry };
}
