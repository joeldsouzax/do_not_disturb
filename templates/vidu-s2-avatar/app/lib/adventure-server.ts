import "server-only";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { type Adventure, type TableMode } from "./adventure";

// One local table, shared by tabs. Generated media and the authoritative
// record survive dev-server restarts; no credentials are written here.
export const DATA_DIR = path.join(process.cwd(), ".adventure");
const globalStore = globalThis as typeof globalThis & {
  adventures?: Partial<Record<TableMode, Adventure>>;
  sceneLocks?: Partial<Record<TableMode, boolean>>;
  planningKey?: Buffer;
};

export function tableMode(request: Request): TableMode {
  const mode = request.headers.get("X-Adventure-Mode") ?? "live";
  if (mode !== "live" && mode !== "example")
    throw new InputError("Unknown adventure mode.");
  return mode;
}
function record(mode: TableMode) {
  return path.join(
    DATA_DIR,
    mode === "live" ? "table.json" : "example-table.json"
  );
}
function emptyTable(mode: TableMode): Adventure {
  return {
    mode,
    revision: 0,
    heroes: [],
    scene: { title: "Your adventure", narration: "", image: null, revision: 0 },
    pending: [],
    journal: [],
  };
}

function planSignature(
  title: string,
  narration: string,
  visualBeat: string
): Buffer {
  globalStore.planningKey ??= randomBytes(32);
  return createHmac("sha256", globalStore.planningKey)
    .update(JSON.stringify({ title, narration, visualBeat }))
    .digest();
}
export function signPlan(title: string, narration: string, visualBeat: string) {
  return {
    visualBeat,
    signature: planSignature(title, narration, visualBeat).toString(
      "base64url"
    ),
  };
}
export function readPlan(
  input: unknown,
  title: string,
  narration: string
): string | null {
  if (!input || typeof input !== "object") return null;
  const plan = input as Record<string, unknown>;
  const visualBeat = text(plan.visualBeat, "Visual beat", 850);
  if (typeof plan.signature !== "string")
    throw new InputError(
      "Repeat the spoken scene to prepare its visual beat.",
      409
    );
  const supplied = Buffer.from(plan.signature, "base64url");
  const expected = planSignature(title, narration, visualBeat);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new InputError(
      "The scene plan changed or expired. Please repeat the narration.",
      409
    );
  return visualBeat;
}

export function table(mode: TableMode = "live"): Adventure {
  globalStore.adventures ??= {};
  let state = globalStore.adventures[mode];
  if (!state) {
    mkdirSync(DATA_DIR, { recursive: true });
    const filename = record(mode);
    if (existsSync(filename)) {
      const stored = JSON.parse(readFileSync(filename, "utf8")) as Adventure;
      if (stored.mode === mode) state = stored;
      else {
        // Legacy records mixed the demo with user narration. Keep all evidence
        // intact, but never silently treat that mixed story as a real campaign.
        renameSync(
          filename,
          path.join(DATA_DIR, `legacy-${randomUUID()}.json`)
        );
      }
    }
    state ??= emptyTable(mode);
    globalStore.adventures[mode] = state;
  }
  return state;
}

export function resetExample(): Adventure {
  if (globalStore.sceneLocks?.example)
    throw new InputError("The example is still preparing a scene.", 409);
  globalStore.adventures ??= {};
  const previous = table("example");
  const next = emptyTable("example");
  // Monotonic scene revisions prevent an old render committing after a reset.
  next.revision = previous.revision;
  next.scene.revision = previous.scene.revision + 1;
  globalStore.adventures.example = next;
  return save("example");
}

export function save(mode: TableMode = "live"): Adventure {
  const state = table(mode);
  state.revision += 1;
  state.journal = state.journal.slice(-100);
  const filename = record(mode);
  writeFileSync(`${filename}.tmp`, JSON.stringify(state));
  renameSync(`${filename}.tmp`, filename);
  return state;
}

export function lock(_kind: "scene", mode: TableMode = "live"): () => void {
  globalStore.sceneLocks ??= {};
  if (globalStore.sceneLocks[mode])
    throw new InputError(
      "This scene is already being prepared. Please wait.",
      409
    );
  globalStore.sceneLocks[mode] = true;
  return () => {
    globalStore.sceneLocks![mode] = false;
  };
}

export class InputError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new InputError(`${label} must contain 1–${max} characters.`);
  }
  return value.trim();
}

export function asset(bytes: Buffer, extension: "png" | "jpg" | "mp4"): string {
  mkdirSync(DATA_DIR, { recursive: true });
  const name = `${randomUUID()}.${extension}`;
  writeFileSync(path.join(DATA_DIR, name), bytes);
  return `/api/adventure/assets/${name}`;
}

export function imagePart(url: string): {
  inlineData: { mimeType: string; data: string };
} {
  if (url === "/miniatures/wizard.jpg") {
    return {
      inlineData: {
        mimeType: "image/jpeg",
        data: readFileSync(
          path.join(process.cwd(), "public/miniatures/wizard.jpg")
        ).toString("base64"),
      },
    };
  }
  const match = /^\/api\/adventure\/assets\/([a-f0-9-]{36}\.(png|jpg))$/.exec(
    url
  );
  if (!match) throw new InputError("The scene reference is unavailable.");
  return {
    inlineData: {
      mimeType: match[2] === "png" ? "image/png" : "image/jpeg",
      data: readFileSync(path.join(DATA_DIR, match[1])).toString("base64"),
    },
  };
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
export interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
}

export async function google(
  endpoint: string,
  body?: unknown
): Promise<Response> {
  const key = process.env.GOOGLE_AI_STUDIO_KEY;
  if (!key)
    throw new InputError(
      "Set GOOGLE_AI_STUDIO_KEY in the root .env to render scenes and voices.",
      503
    );
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${endpoint}`,
      {
        method: body ? "POST" : "GET",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(180_000),
      }
    );
    // Retry explicit temporary-capacity refusals, never an ambiguous network
    // failure or a successful generation that might have already been billed.
    if (response.status !== 503 || attempt === 2) break;
    await response.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  if (!response) throw new InputError("The model could not be reached.", 502);
  if (!response.ok) {
    const info = await response.json().catch(() => ({}));
    const detail =
      typeof info.error?.message === "string"
        ? info.error.message.replaceAll(key, "[redacted]").slice(0, 500)
        : response.statusText;
    throw new InputError(
      `Google returned ${response.status}: ${detail}`,
      response.status === 429 ? 429 : 502
    );
  }
  return response;
}

export function failure(error: unknown): Response {
  return Response.json(
    {
      error:
        error instanceof Error
          ? error.message
          : "The story could not be updated.",
    },
    {
      status: error instanceof InputError ? error.status : 500,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}

export function json(value: unknown): Response {
  return Response.json(value, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 2_000_000)
    throw new InputError("This request is too large.", 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InputError("The request is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new InputError("A request object is required.");
  return parsed as Record<string, unknown>;
}
