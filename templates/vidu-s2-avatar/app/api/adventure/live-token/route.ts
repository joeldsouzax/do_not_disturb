import {
  failure,
  InputError,
  json,
  table,
  tableMode,
} from "../../../lib/adventure-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const mode = tableMode(request);
    const key = process.env.GOOGLE_AI_STUDIO_KEY;
    if (!key)
      throw new InputError(
        "Set GOOGLE_AI_STUDIO_KEY to enable live speech.",
        503
      );
    const setup = {
      model: "models/gemini-3.5-transcribe-live",
      generationConfig: { responseModalities: ["TEXT"] },
      inputAudioTranscription: {
        mode: "VERBATIM",
        customVocabulary: [
          "Dungeon Master",
          "Dungeons and Dragons",
          ...table(mode).heroes.map((h) => h.name),
        ],
      },
      realtimeInputConfig: { automaticActivityDetection: { disabled: true } },
    };
    // This is the actual constrained-token REST shape used by the GenAI SDK;
    // liveConnectConstraints is its SDK option, not the REST request field.
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
      {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(Date.now() + 15 * 60_000).toISOString(),
          newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
          bidiGenerateContentSetup: setup,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!response.ok)
      throw new InputError(
        `Live speech token was refused (${response.status}). Recorded speech remains available.`,
        502
      );
    const data = await response.json();
    if (typeof data.name !== "string")
      throw new InputError("Live speech authentication failed.", 502);
    return json({ token: data.name, setup });
  } catch (error) {
    return failure(error);
  }
}
