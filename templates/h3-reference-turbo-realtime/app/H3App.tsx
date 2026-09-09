"use client";

import { H3Provider } from "./lib/model";
import { Header } from "./components/Header";
import { StatusBadge } from "./components/StatusBadge";
import { CommandError } from "./components/CommandError";
import { ClipComposer } from "./components/ClipComposer";
import { NowPlaying } from "./components/NowPlaying";
import { QueuePanel } from "./components/QueuePanel";
import { SnapClip } from "./components/SnapClip";
import { Video } from "./components/Video";

// The memoized token resolver handed to <H3Provider jwtToken>.
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
      if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
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

// No `autoConnect` and no Connect button: a session starts when you queue a
// clip, because that is the first moment there is work for it. Uploading
// references needs a session too, so the composer connects before it uploads
// — see ClipComposer.queueClip. StatusBadge reports the lifecycle and offers
// Disconnect.
export function H3App() {
  return (
    <H3Provider jwtToken={fetchToken}>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
          <aside className="flex w-full flex-col gap-4 lg:w-[26rem] lg:shrink-0">
            <StatusBadge />
            <CommandError />
            <NowPlaying />
            <ClipComposer />
            <QueuePanel />
            <SnapClip />
          </aside>
          <section className="flex-1">
            <Video />
          </section>
        </main>
      </div>
    </H3Provider>
  );
}
