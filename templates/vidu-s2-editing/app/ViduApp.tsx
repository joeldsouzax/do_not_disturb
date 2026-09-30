"use client";

import { ViduS2EditingProvider } from "./lib/model";
import { SessionProvider } from "./lib/session";
import { CommandError } from "./components/CommandError";
import { EditControls } from "./components/EditControls";
import { Header } from "./components/Header";
import { ReferencePicker } from "./components/ReferencePicker";
import { SourcePicker } from "./components/SourcePicker";
import { Stage } from "./components/Stage";
import { StatusBadge } from "./components/StatusBadge";

// The memoized token resolver handed to <ViduS2EditingProvider jwtToken>.
//
// The token is memoized in module scope, not the browser's HTTP cache (the
// route is no-store). A session can only be operated by the exact token
// that created it, and the SDK calls the resolver again on every later hop
// the session makes — so the resolver must return the SAME token until the
// session closes. A fresh token then gives the next session a fresh budget.
let cachedToken: string | null = null;
let inflightToken: Promise<string> | null = null;
let tokenGeneration = 0;

function clearTokenAfterDisconnect() {
  tokenGeneration += 1;
  cachedToken = null;
  inflightToken = null;
}

async function fetchToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (inflightToken) return inflightToken; // coalesce parallel hops
  const generation = tokenGeneration;
  const request = (async () => {
    const r = await fetch("/api/reactor/token", { cache: "no-store" });
    if (!r.ok) throw new Error(`Token fetch failed: ${r.status}`);
    const { jwt } = (await r.json()) as { jwt: string };
    if (generation === tokenGeneration) cachedToken = jwt;
    return jwt;
  })();
  inflightToken = request;
  try {
    return await request;
  } finally {
    if (inflightToken === request) inflightToken = null;
  }
}

// No `autoConnect` and no Connect button: Start editing connects, because
// the session has nothing to do before there is a source and a reference.
export function ViduApp() {
  return (
    <ViduS2EditingProvider jwtToken={fetchToken}>
      <SessionProvider onDisconnected={clearTokenAfterDisconnect}>
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex flex-1 flex-col gap-5 p-4 lg:flex-row lg:gap-6 lg:p-6">
            <aside className="flex w-full flex-col gap-4 lg:w-[24rem] lg:shrink-0">
              <SourcePicker />
              <ReferencePicker />
              <EditControls />
            </aside>
            <section className="flex min-w-0 flex-1 flex-col gap-3">
              <StatusBadge />
              <CommandError />
              <Stage />
            </section>
          </main>
        </div>
      </SessionProvider>
    </ViduS2EditingProvider>
  );
}
