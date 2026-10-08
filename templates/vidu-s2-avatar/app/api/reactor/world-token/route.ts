import { NextResponse } from "next/server";

const MODELS: Record<string, string> = {
  fast: "reactor/fast-h3",
  h3: "reactor/h3-reference-to-video-turbo-realtime",
  lingbot: "reactor/lingbot-world-2",
  oyster: "reactor/happy-oyster-director",
  helios: "reactor/helios",
};

export async function GET(request: Request) {
  const model = MODELS[new URL(request.url).searchParams.get("engine") ?? ""];
  if (!model)
    return NextResponse.json(
      { error: "Choose a supported world engine." },
      { status: 400 }
    );
  const apiKey = process.env.REACTOR_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { error: "Set REACTOR_API_KEY in the root .env to open the live world." },
      { status: 503 }
    );
  try {
    const response = await fetch("https://api.reactor.inc/tokens", {
      method: "POST",
      headers: {
        "Reactor-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: 6 * 60 * 60,
        authorization_details: [
          {
            type: "session",
            resources: { models: { match: [model] } },
            constraints: { max_sessions: 10 },
          },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      return NextResponse.json(
        { error: `Reactor returned ${response.status}.` },
        { status: 502 }
      );
    const { jwt, expires_at } = (await response.json()) as {
      jwt: string;
      expires_at: number;
    };
    return NextResponse.json(
      { jwt, expires_at },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Reactor could not be reached. Try opening the world again." },
      { status: 502 }
    );
  }
}
