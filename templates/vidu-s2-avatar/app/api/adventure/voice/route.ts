import { VOICES } from "../../../lib/adventure";
import {
  body,
  failure,
  google,
  InputError,
  text,
  type GeminiResponse,
} from "../../../lib/adventure-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const input = await body(request);
    const narration = text(input.text, "Narration", 4000);
    if (!VOICES.some((v) => v.name === input.voice))
      throw new InputError("Choose a narrator voice.");
    const result = (await (
      await google(
        `models/${process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-tts"}:generateContent`,
        {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: narration,
                  speech_metadata: {
                    style:
                      "An evocative fantasy Dungeon Master telling an adventure around the table. Warm, measured, dramatic, natural. Read the text exactly.",
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { voice: input.voice } },
          },
        }
      )
    ).json()) as GeminiResponse;
    const audio = result.candidates?.[0]?.content?.parts?.find((p) =>
      p.inlineData?.mimeType.startsWith("audio/")
    )?.inlineData;
    if (!audio)
      throw new InputError("The voice model did not return narration.", 502);
    const bytes = Buffer.from(audio.data, "base64");
    let wav: Buffer;
    if (bytes.subarray(0, 4).toString() === "RIFF") wav = bytes;
    else if (/audio\/(L16|pcm)/i.test(audio.mimeType)) {
      const rate = Number(/rate=(\d+)/.exec(audio.mimeType)?.[1] ?? 24000);
      const header = Buffer.alloc(44);
      header.write("RIFF", 0);
      header.writeUInt32LE(bytes.length + 36, 4);
      header.write("WAVEfmt ", 8);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(rate, 24);
      header.writeUInt32LE(rate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write("data", 36);
      header.writeUInt32LE(bytes.length, 40);
      wav = Buffer.concat([header, bytes]);
    } else
      throw new InputError(
        "The voice model returned an unsupported audio format.",
        502
      );
    return new Response(new Uint8Array(wav), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
