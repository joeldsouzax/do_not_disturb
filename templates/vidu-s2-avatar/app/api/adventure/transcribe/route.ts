import {
  failure,
  google,
  InputError,
  json,
  type GeminiResponse,
} from "../../../lib/adventure-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const file = (await request.formData()).get("audio");
    if (!(file instanceof File) || !file.size || file.size > 10_000_000)
      throw new InputError("Record up to one minute of speech.");
    const mime = file.type.split(";")[0];
    if (
      ![
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
        "audio/wav",
        "audio/mpeg",
      ].includes(mime)
    )
      throw new InputError("This audio format is unsupported.");
    const result = (await (
      await google(
        `models/${process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash"}:generateContent`,
        {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: "Transcribe only the spoken words in this recording. Keep fantasy names and roleplaying actions as spoken. Do not answer the speaker, invent speech, interpret actions, or add commentary. Return an empty response if there is no speech.",
                },
                {
                  inlineData: {
                    mimeType: mime,
                    data: Buffer.from(await file.arrayBuffer()).toString(
                      "base64"
                    ),
                  },
                },
              ],
            },
          ],
        }
      )
    ).json()) as GeminiResponse;
    const transcript =
      result.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";
    if (!transcript)
      throw new InputError(
        "No speech was recognized. Try again or type your action."
      );
    return json({ text: transcript.slice(0, 4000) });
  } catch (error) {
    return failure(error);
  }
}
