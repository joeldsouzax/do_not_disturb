import { DND_CONTEXT } from "../../../lib/dnd-context";
import {
  failure,
  google,
  InputError,
  json,
  table,
  tableMode,
  signPlan,
  type GeminiResponse,
} from "../../../lib/adventure-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const mode = tableMode(request);
    const data = await request.formData();
    const audio = data.get("audio");
    const transcript = data.get("transcript");
    const spokenText =
      typeof transcript === "string" &&
      transcript.trim() &&
      transcript.length <= 4000
        ? transcript.trim()
        : null;
    if (
      !spokenText &&
      (!(audio instanceof File) || !audio.size || audio.size > 10_000_000)
    )
      throw new InputError("Record a short spoken turn.");
    const mime = audio instanceof File ? audio.type.split(";")[0] : "";
    if (
      !spokenText &&
      !["audio/webm", "audio/mp4", "audio/ogg", "audio/wav"].includes(mime)
    )
      throw new InputError("Unsupported microphone format.");
    const camera = data.get("camera");
    const match =
      typeof camera === "string" && camera.length < 1_500_000
        ? /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(camera)
        : null;
    const state = table(mode);
    const capture = data.get("capture") === "true";
    // A clearly labeled first-person request is player intent by definition.
    // It cannot change world facts, so it needs no image/scene planning call.
    const namedPlayer =
      spokenText && !capture && !match && !data.get("clarification")
        ? state.heroes.find((hero) => {
            const name = hero.name.toLowerCase();
            if (!spokenText.toLowerCase().startsWith(name)) return false;
            const rest = spokenText.slice(name.length);
            return /^[.,:!\s-]+I\s+(?:try|attempt|want|cast|attack|move|open|close|search|look|hide|help|dash|dodge|disengage|inspect|examine|ask|speak|use|pick|take|draw|raise|lower|push|pull|walk|run|drink|eat|ready|study)\b/i.test(
              rest
            );
          })
        : undefined;
    if (namedPlayer)
      return json({
        kind: "player",
        confidence: 1,
        transcript: spokenText,
        speakerId: namedPlayer.id,
        title: state.scene.title,
        narration: "",
        reply: "",
        visualBeat: "",
        characters: [],
        actionIds: [],
      });
    const response = await google(
      `models/${process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash"}:generateContent`,
      {
        systemInstruction: {
          parts: [
            {
              text: `${DND_CONTEXT}\nYou are the voice interface for a physical tabletop adventure. Listen to one utterance separated by a natural pause and inspect the camera reference when present. Transcribe the actual speech. Classify it as dm (scene narration or an explicitly adjudicated outcome), player (a character's intent), setup (character names/class/backstory or table setup), or clarify (speaker/meaning uncertain). A Dungeon Master turn that introduces a miniature AND establishes a scene is dm, with characters alongside its full narration. Setup-only speech must have empty narration. Whenever returning characters, include the complete visible party, with established names matched to their references. An 'I try' or 'I cast' request is intent, NEVER an established successful outcome. Do not promote a player request to DM authority. Confidence measures speaker/turn attribution only, not certainty of a player’s outcome or how visible a miniature is. Explicit Dungeon Master and known character-name labels establish the speaker. Do not ask who is speaking when that label is clear. If attribution confidence is below 0.8, use clarify and ask one short spoken question. Name a speaker only from an explicit spoken character label or an unambiguous continuation of the previous speaker. Never infer who is speaking from which hero is visible in the scene. Otherwise ask a short clarification. Return actionIds only for waiting intents explicitly resolved or rejected in this DM narration; leave unrelated intents waiting. Keep the current scene title while the location stays the same. When the DM describes entering a different location, use a short faithful title even when no proper name is supplied. If a prior clarification is supplied, combine it with the new answer to interpret the original turn. Preserve the complete DM narration; strip speaker labels but never invent events, rolls or dialogue. Identify photographed tabletop miniatures, not real people. Character names and backstories come from speech or an established matching character; otherwise use a descriptive name and a brief appearance description. Do not invent a detailed backstory. A character box is a normalized [x,y,width,height] crop in the image. Return characters only for initial capture or an explicit setup change. Also compile visualBeat, up to 800 characters, for the DM narration or the established current scene after setup. Carry forward the currently established setting, props, character positions and completed outcomes while applying only the newest DM changes. Do not replay completed actions or restage the opening. Preserve visible actions, outcomes and period lighting. Never render player intent as success. Empty visualBeat for player, clarify or setup before any DM setting exists. A setup-only turn must never invent an opening scene. A continuing third-person narration after a DM turn can remain DM across a pause; a new first-person player request still requires player classification, and uncertain attribution needs clarification. This is the only visual planning call; make it precise enough to send directly to the video model. No text input or button selection is required from the player; your reply is a short spoken acknowledgement or clarification.`,
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Recent established events: ${JSON.stringify(state.journal.slice(-12))}. Previous heard turn (attribution hint only, never authority for a new player request): ${String(data.get("previousTurn") ?? "").slice(0, 4500)}. Prior clarification: ${String(data.get("clarification") ?? "").slice(0, 4000)}. Initial miniature capture: ${capture}. Existing party: ${JSON.stringify(state.heroes.map(({ id, name, ancestry, heroClass, backstory }) => ({ id, name, ancestry, heroClass, backstory })))}. Current scene: ${JSON.stringify(state.scene)}. Waiting player intents: ${JSON.stringify(state.pending)}. ${match ? "A current camera frame follows." : "No camera frame is available; do not claim to see figures."}`,
              },
              ...(spokenText
                ? [
                    {
                      text: `Finalized live speech transcript (interpret as the user's words): ${spokenText}`,
                    },
                  ]
                : [
                    {
                      inlineData: {
                        mimeType: mime,
                        data: Buffer.from(
                          await (audio as File).arrayBuffer()
                        ).toString("base64"),
                      },
                    },
                  ]),
              ...(match
                ? [
                    {
                      inlineData: {
                        mimeType: `image/${match[1]}`,
                        data: match[2],
                      },
                    },
                  ]
                : []),
            ],
          },
        ],
        generationConfig: {
          thinkingConfig: {
            thinkingLevel: state.pending.length ? "MEDIUM" : "LOW",
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              kind: {
                type: "STRING",
                enum: ["dm", "player", "setup", "clarify"],
              },
              confidence: { type: "NUMBER" },
              ...(!spokenText ? { transcript: { type: "STRING" } } : {}),
              speakerId: { type: "STRING" },
              title: { type: "STRING" },
              narration: { type: "STRING" },
              reply: { type: "STRING" },
              visualBeat: { type: "STRING" },
              actionIds: { type: "ARRAY", items: { type: "STRING" } },
              characters: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" },
                    ancestry: { type: "STRING" },
                    heroClass: { type: "STRING" },
                    backstory: { type: "STRING" },
                    box: { type: "ARRAY", items: { type: "NUMBER" } },
                  },
                  required: [
                    "name",
                    "ancestry",
                    "heroClass",
                    "backstory",
                    "box",
                  ],
                },
              },
            },
            required: [
              "kind",
              "confidence",
              ...(!spokenText ? ["transcript"] : []),
              "speakerId",
              "title",
              "narration",
              "reply",
              "visualBeat",
              "characters",
              "actionIds",
            ],
          },
        },
      }
    );
    const result = (await response.json()) as GeminiResponse;
    const raw =
      result.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";
    let turn: Record<string, unknown>;
    try {
      turn = JSON.parse(raw);
      if (spokenText) turn.transcript = spokenText;
    } catch {
      throw new InputError(
        "The spoken turn could not be understood. Please repeat it.",
        502
      );
    }
    if (
      !["dm", "player", "setup", "clarify"].includes(String(turn.kind)) ||
      typeof turn.transcript !== "string" ||
      turn.transcript.length > 4000 ||
      !turn.transcript.trim()
    )
      throw new InputError("No clear speech was recognized. Please try again.");
    const label = spokenText ?? turn.transcript;
    const labeledDm = /^\s*(?:the\s+)?dungeon[\s-]+master\b/i.test(label);
    const labeledPlayer = state.heroes.some(
      (hero) =>
        label.toLowerCase().startsWith(hero.name.toLowerCase() + ".") ||
        label.toLowerCase().startsWith(hero.name.toLowerCase() + ":") ||
        label.toLowerCase().startsWith(hero.name.toLowerCase() + ",")
    );
    // Introducing a miniature does not discard a DM's accompanying scene.
    if (
      turn.kind === "setup" &&
      /^\s*(?:the\s+)?dungeon master\b/i.test(turn.transcript) &&
      typeof turn.narration === "string" &&
      turn.narration.trim()
    )
      turn.kind = "dm";
    const explicitAttribution =
      (turn.kind === "dm" && labeledDm) ||
      (turn.kind === "player" && labeledPlayer);
    if (
      !explicitAttribution &&
      (typeof turn.confidence !== "number" || turn.confidence < 0.8)
    ) {
      turn.kind = "clarify";
      turn.reply =
        "Is that your character’s action, or the Dungeon Master’s narration?";
    }
    if (turn.kind === "dm" && spokenText && labeledDm)
      turn.narration = spokenText
        .replace(/^\s*(?:the\s+)?dungeon[\s-]+master\b[\s.,:!-]*/i, "")
        .trim();
    if (
      turn.kind === "dm" &&
      (typeof turn.narration !== "string" ||
        !turn.narration.trim() ||
        turn.narration.length > 4000)
    )
      throw new InputError("Please repeat the Dungeon Master’s narration.");
    if (turn.kind === "player" && typeof turn.speakerId === "string") {
      const matches = state.heroes.filter(
        (h) =>
          h.id === turn.speakerId ||
          h.name.toLowerCase() === String(turn.speakerId).toLowerCase()
      );
      if (matches.length === 1) turn.speakerId = matches[0].id;
    }
    if (
      turn.kind === "player" &&
      !state.heroes.some((h) => h.id === turn.speakerId)
    ) {
      turn.kind = "clarify";
      turn.reply =
        "Which character is speaking? Say their name with the action.";
    }
    if (!Array.isArray(turn.characters) || turn.characters.length > 6)
      throw new InputError("Please show up to six miniatures.");
    for (const character of turn.characters) {
      if (
        !character ||
        typeof character !== "object" ||
        !["name", "ancestry", "heroClass", "backstory"].every(
          (key) => typeof character[key] === "string" && character[key].trim()
        ) ||
        !Array.isArray(character.box) ||
        character.box.length !== 4 ||
        character.box.some(
          (n: unknown) =>
            typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1
        ) ||
        character.box[2] < 0.02 ||
        character.box[3] < 0.02
      )
        throw new InputError(
          "The miniature was not clearly visible. Move the camera closer and introduce it again."
        );
    }
    if (
      !Array.isArray(turn.actionIds) ||
      turn.actionIds.some((id) => !state.pending.some((a) => a.id === id))
    )
      throw new InputError(
        "The spoken ruling could not be matched to waiting actions. Please repeat it."
      );
    if (typeof turn.reply !== "string" || turn.reply.length > 500)
      turn.reply = "";
    if (
      typeof turn.title !== "string" ||
      !turn.title.trim() ||
      turn.title.length > 100
    )
      turn.title = state.scene.title;
    if (turn.kind === "setup") turn.title = state.scene.title;
    if (
      turn.kind === "dm" ||
      (turn.kind === "setup" && state.scene.narration)
    ) {
      if (
        typeof turn.visualBeat !== "string" ||
        !turn.visualBeat.trim() ||
        turn.visualBeat.length > 850
      )
        throw new InputError(
          "Please repeat the scene so its visual beat can be prepared.",
          502
        );
      turn.plan = signPlan(
        String(turn.title),
        turn.kind === "dm" ? String(turn.narration) : state.scene.narration,
        turn.visualBeat
      );
    }
    return json(turn);
  } catch (error) {
    return failure(error);
  }
}
