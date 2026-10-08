"use client";

import { ViduS2AvatarProvider } from "./lib/model";
import { SessionProvider } from "./lib/session";
import { MiniatureWorkshop } from "./components/MiniatureWorkshop";

// The memoized token resolver handed to <ViduS2AvatarProvider jwtToken>.
//
// The token is memoized in module scope, not the browser's HTTP cache (the
// route is no-store). A session can only be operated by the exact token
// that created it, and the SDK calls the resolver again on every later hop
// the session makes — so the resolver must return the SAME token for the
// token's whole life, and only re-mint close to expiry.
const TOKEN_REFRESH_SKEW_MS = 60_000;
let cachedToken: { jwt: string; expiresAtMs: number } | null = null;
let inflightToken: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  if (
    cachedToken &&
    Date.now() < cachedToken.expiresAtMs - TOKEN_REFRESH_SKEW_MS
  ) {
    return cachedToken.jwt;
  }
  if (inflightToken) return inflightToken; // coalesce parallel hops
  inflightToken = (async () => {
    try {
      const r = await fetch("/api/reactor/token", { cache: "no-store" });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Token fetch failed: ${r.status}`);
      }
      const { jwt, expires_at } = (await r.json()) as {
        jwt: string;
        expires_at: number;
      };
      cachedToken = { jwt, expiresAtMs: expires_at * 1000 };
      return jwt;
    } finally {
      inflightToken = null;
    }
  })();
  return inflightToken;
}

// No `autoConnect` and no Connect button: picking a character connects,
// because the session has work to do from that moment (fetch the voices,
// build the character). The setup column and the call column swap on the
// model's phase, so each component decides for itself whether it shows.
export function ViduApp({ configured }: { configured: boolean }) {
  return (
    <ViduS2AvatarProvider jwtToken={fetchToken}>
      <SessionProvider>
        <MiniatureWorkshop configured={configured} />
      </SessionProvider>
    </ViduS2AvatarProvider>
  );
}
