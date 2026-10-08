import { randomUUID } from "node:crypto";
import {
  asset,
  body,
  failure,
  imagePart,
  InputError,
  json,
  save,
  table,
  tableMode,
  resetExample,
  text,
} from "../../lib/adventure-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    return json(table(tableMode(request)));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = await body(request);
    const mode = tableMode(request);
    if (input.type === "reset-example") {
      if (mode !== "example")
        throw new InputError("Only the example can be reset here.");
      return json(resetExample());
    }
    const state = table(mode);
    if (input.type === "action") {
      if (state.pending.length >= 16)
        throw new InputError(
          "Resolve the waiting actions before adding more.",
          409
        );
      const hero = state.heroes.find((h) => h.id === input.heroId);
      if (!hero) throw new InputError("Choose a character at the table.");
      const action = {
        id: randomUUID(),
        heroId: hero.id,
        text: text(input.text, "Action", 2000),
      };
      state.pending.push(action);
    } else if (input.type === "dismiss") {
      const action = state.pending.find((a) => a.id === input.id);
      if (!action)
        throw new InputError("That action has already been resolved.", 409);
      const hero = state.heroes.find((h) => h.id === action.heroId);
      state.journal.push({
        id: randomUUID(),
        speaker: "Dungeon Master",
        text: `${hero?.name ?? "Player"}’s proposed action was set aside: ${action.text}`,
      });
      state.pending = state.pending.filter((a) => a.id !== action.id);
    } else if (input.type === "party") {
      if (
        !Array.isArray(input.heroes) ||
        !input.heroes.length ||
        input.heroes.length > 6
      )
        throw new InputError("Show between one and six miniatures.");
      const heroes = input.heroes.map((raw: Record<string, unknown>) => {
        if (!raw || typeof raw !== "object")
          throw new InputError("The miniature could not be identified.");
        const name = text(raw.name, "Character name", 60);
        const ancestry = text(raw.ancestry, "Ancestry", 60);
        const heroClass = text(raw.heroClass, "Class", 60);
        const backstory = text(raw.backstory, "Character description", 2000);
        const reference = text(raw.photo, "Miniature photo", 1_500_000);
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
          reference
        );
        if (!match) throw new InputError("The camera image could not be read.");
        const bytes = Buffer.from(match[1], "base64");
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8)
          throw new InputError("Invalid camera image.");
        const previous = state.heroes.find(
          (h) => h.name.toLowerCase() === name.toLowerCase()
        );
        return {
          id: previous?.id ?? randomUUID(),
          name,
          ancestry,
          heroClass,
          backstory,
          photo: asset(bytes, "jpg"),
        };
      });
      if (state.pending.some((a) => !heroes.some((h) => h.id === a.heroId)))
        throw new InputError(
          "Resolve the waiting actions before replacing those characters.",
          409
        );
      state.heroes = heroes;
      state.scene = {
        ...state.scene,
        visualBeat: undefined,
        revision: state.scene.revision + 1,
      };
    } else if (input.type === "hero") {
      if (state.heroes.length >= 6)
        throw new InputError("This prototype supports six adventurers.", 409);
      const name = text(input.name, "Character name", 60);
      const ancestry = text(input.ancestry, "Ancestry", 60);
      const heroClass = text(input.heroClass, "Class", 60);
      const backstory = text(input.backstory, "Backstory", 2000);
      const reference = text(input.photo, "Miniature photo", 1_500_000);
      let photo: string;
      if (reference === "/miniatures/wizard.jpg") photo = reference;
      else {
        const match =
          /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
            reference
          );
        if (!match)
          throw new InputError("Upload a JPG or PNG miniature photo.");
        const bytes = Buffer.from(match[2], "base64");
        const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
        const isPng = bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        if ((match[1] === "jpeg" && !isJpeg) || (match[1] === "png" && !isPng))
          throw new InputError(
            "The miniature photo is not a valid JPG or PNG."
          );
        photo = asset(bytes, match[1] === "png" ? "png" : "jpg");
      }
      imagePart(photo); // Ensure the reference can be read before joining.
      state.heroes.push({
        id: randomUUID(),
        name,
        ancestry,
        heroClass,
        backstory,
        photo,
      });
    } else throw new InputError("Unknown table action.");
    return json(save(mode));
  } catch (error) {
    return failure(error);
  }
}
