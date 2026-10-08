import { randomUUID } from "node:crypto";
import {
  asset,
  body,
  failure,
  google,
  imagePart,
  InputError,
  json,
  lock,
  save,
  readPlan,
  table,
  tableMode,
  text,
  type GeminiResponse,
} from "../../../lib/adventure-server";
import { DND_CONTEXT } from "../../../lib/dnd-context";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let unlock: (() => void) | undefined;
  try {
    const mode = tableMode(request);
    const input = await body(request);
    const title = text(input.title, "Scene title", 100);
    const narration = text(input.narration, "Dungeon Master narration", 4000);
    const current = table(mode);
    if (input.sceneRevision !== current.scene.revision)
      throw new InputError(
        "The scene changed on another screen. Reload its narration before continuing.",
        409
      );
    if (
      !Array.isArray(input.actionIds) ||
      input.actionIds.some((id) => typeof id !== "string")
    )
      throw new InputError("Select the actions to resolve.");
    const ids = new Set(input.actionIds as string[]);
    const actions = current.pending.filter((a) => ids.has(a.id));
    if (actions.length !== ids.size)
      throw new InputError("A selected action has already been resolved.", 409);
    unlock = lock("scene", mode);
    const revision = current.scene.revision;
    const cast = current.heroes.slice();
    let visualBeat = readPlan(input.plan, title, narration);
    if (!visualBeat) {
      const plan = (await (
        await google(
          `models/${process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash"}:generateContent`,
          {
            systemInstruction: { parts: [{ text: DND_CONTEXT }] },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `Compile the complete Dungeon Master narration into a precise visual beat for a real-time world model. Return JSON with one field, visualBeat, no longer than 800 characters. Keep every established action, result, location, character, prop and magical effect that matters. Do not add events, successful rolls, creatures or modern lighting. Focus on what is visible now; avoid restaging events the DM says already finished. Prefer a steady camera and small, specific motions. Selected player intents are context only; the DM narration decides whether they succeed.\nLocation: ${title}\nPrevious established scene: ${JSON.stringify(current.scene)}\nRecent established events: ${JSON.stringify(current.journal.slice(-12))}\nNewest DM narration: ${narration}\nPlayer intents: ${JSON.stringify(actions.map((a) => ({ name: cast.find((h) => h.id === a.heroId)?.name, text: a.text })))}\nParty: ${JSON.stringify(cast.map(({ name, ancestry, heroClass, backstory }) => ({ name, ancestry, heroClass, backstory })))}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: { visualBeat: { type: "STRING" } },
                required: ["visualBeat"],
              },
            },
          }
        )
      ).json()) as GeminiResponse;
      const planText = plan.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("");
      try {
        visualBeat = text(
          JSON.parse(planText ?? "{}").visualBeat,
          "Visual beat",
          850
        );
      } catch {
        throw new InputError(
          "The scene planner did not produce a usable visual beat. Your current scene is unchanged; try again.",
          502
        );
      }
    }
    let nextImage = title === current.scene.title ? current.scene.image : null;
    if (input.renderImage !== false) {
      const parts: unknown[] = [
        {
          text: `Create one cinematic 16:9 fantasy adventure frame for a shared tabletop roleplaying game displayed on a TV. Original high-end dark fantasy game art, richly detailed, warm practical light, dramatic composition. NO text, UI, captions, collage, character sheet, dice, or modern objects. The Dungeon Master's narration is the authority on events; player actions are intent, not proof of success. Never invent dice outcomes or game statistics. Preserve established character identity and appearance from their miniature references, but depict them as living full-size people in the world, not plastic toys or miniature bases.\nScene: ${title}\nDungeon Master's narration: ${narration}\nPlayer intents being resolved in this beat: ${JSON.stringify(actions.map((a) => ({ character: cast.find((h) => h.id === a.heroId)?.name, intent: a.text })))}\nParty: ${JSON.stringify(cast.map(({ name, ancestry, heroClass, backstory }) => ({ name, ancestry, heroClass, backstory })))}. Reference photos follow in party order.`,
        },
      ];
      for (const hero of cast)
        parts.push(
          { text: `Miniature reference for ${hero.name}:` },
          imagePart(hero.photo)
        );
      if (current.scene.image)
        parts.push(
          {
            text: "Previous scene for visual continuity; change the location and action only as the new narration requires.",
          },
          imagePart(current.scene.image)
        );
      const response = await google(
        `models/${process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image"}:generateContent`,
        {
          systemInstruction: { parts: [{ text: DND_CONTEXT }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: "16:9", imageSize: "2K" },
          },
        }
      );
      const result = (await response.json()) as GeminiResponse;
      const image = result.candidates?.[0]?.content?.parts?.find((p) =>
        p.inlineData?.mimeType.startsWith("image/")
      )?.inlineData;
      if (!image)
        throw new InputError(
          "The image model did not return a scene. Try a different description.",
          502
        );
      if (!["image/png", "image/jpeg"].includes(image.mimeType))
        throw new InputError(
          "The image model returned an unsupported image type.",
          502
        );
      nextImage = asset(
        Buffer.from(image.data, "base64"),
        image.mimeType === "image/png" ? "png" : "jpg"
      );
    }
    if (!nextImage && input.renderImage !== false)
      throw new InputError("Create the opening scene image first.");
    const state = table(mode);
    if (
      state.scene.revision !== revision ||
      cast.map((h) => h.id).join() !== state.heroes.map((h) => h.id).join() ||
      actions.some((a) => !state.pending.some((p) => p.id === a.id))
    ) {
      throw new InputError(
        "The table changed while this scene was rendering. Review the latest table and try again.",
        409
      );
    }
    const storyChanged =
      state.scene.narration !== narration ||
      actions.length > 0 ||
      !state.journal.length;
    state.scene = {
      title,
      narration,
      visualBeat,
      image: nextImage,
      revision: revision + 1,
    };
    for (const action of actions)
      state.journal.push({
        id: randomUUID(),
        speaker: cast.find((h) => h.id === action.heroId)?.name ?? "Player",
        text: action.text,
      });
    if (storyChanged)
      state.journal.push({
        id: randomUUID(),
        speaker: "Dungeon Master",
        text: narration,
      });
    state.pending = state.pending.filter((a) => !ids.has(a.id));
    return json(save(mode));
  } catch (error) {
    return failure(error);
  } finally {
    unlock?.();
  }
}
