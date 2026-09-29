// What the app knows about a call, in the model's own terms.
//
// The model's `session_state` is the one snapshot to mirror. Its `phase`
// arrives as a string; `phaseOf` narrows it to the nine phases the model
// documents, and every predicate below reads that. Anything else becomes
// `unknown`, which counts as an active call: the app then neither sends a
// second `start_call` into a call it cannot see nor drops the microphone,
// and End call and Disconnect stay available.

import type {
  ViduS2AvatarSessionStateMessage,
  ViduS2AvatarStartCallParams,
  ViduS2AvatarVoicesMessage,
} from "./model";

export type Phase =
  | "idle"
  | "preparing_avatar"
  | "avatar_ready"
  | "starting"
  | "warming_up"
  | "live"
  | "ending"
  | "ended"
  | "failed"
  | "unknown";

const PHASES: ReadonlyArray<Phase> = [
  "idle",
  "preparing_avatar",
  "avatar_ready",
  "starting",
  "warming_up",
  "live",
  "ending",
  "ended",
  "failed",
];

export function phaseOf(snapshot: ViduS2AvatarSessionStateMessage | null): Phase | null {
  if (!snapshot) return null;
  return (PHASES as ReadonlyArray<string>).includes(snapshot.phase)
    ? (snapshot.phase as Phase)
    : "unknown";
}

/** `start_call` is accepted from these phases, and only these. */
export function callStartable(phase: Phase | null): boolean {
  return phase === "avatar_ready" || phase === "ended" || phase === "failed";
}

/** A call exists, or may (`unknown`): the setup is locked and `end_call` is offered. */
export function callActive(phase: Phase | null): boolean {
  return (
    phase === "starting" ||
    phase === "warming_up" ||
    phase === "live" ||
    phase === "ending" ||
    phase === "unknown"
  );
}

/** `say`, `interrupt`, `update_call` and the reference images need this. */
export function callLive(snapshot: ViduS2AvatarSessionStateMessage | null): boolean {
  return phaseOf(snapshot) === "live" && snapshot?.control_ready === true;
}

// The limits the schema declares, so the inputs can hold the line before the
// model has to refuse.
export const LIMITS = {
  persona: 50_000,
  greeting: 200,
  say: 2_000,
  referenceImages: 3,
  referenceText: 200,
} as const;

export type CallMode = "audio" | "video";

export interface CallSetup {
  persona: string;
  greeting: string;
  voice: string;
  callMode: CallMode;
}

/**
 * The `start_call` payload. Fields the user left empty are omitted, never
 * sent as null: a payload carrying an explicit null is dropped whole before
 * it reaches the model, silently.
 */
export function startCallParams(setup: CallSetup): ViduS2AvatarStartCallParams {
  const greeting = setup.greeting.trim();
  return {
    persona: setup.persona.trim(),
    call_mode: setup.callMode,
    transcripts: true,
    ...(setup.voice !== "" && { voice: setup.voice }),
    ...(greeting !== "" && { greeting }),
  };
}

// ── Voices ─────────────────────────────────────────────────────────────────

export interface Voice {
  voice: string;
  description?: string;
  accent?: string;
}

/** The schema types catalog entries as `unknown`; keep the ones with a name. */
export function systemVoices(voices: ViduS2AvatarVoicesMessage | null): Voice[] {
  if (!voices) return [];
  return voices.system.flatMap((entry) => {
    const record = entry as Partial<Voice> | null;
    return record && typeof record.voice === "string"
      ? [
          {
            voice: record.voice,
            ...(typeof record.description === "string" && {
              description: record.description,
            }),
            ...(typeof record.accent === "string" && { accent: record.accent }),
          },
        ]
      : [];
  });
}

/** Keep useful regional detail without repeating the catalog's language on every row. */
export function voiceLabel({ voice, accent }: Voice): string {
  const detail = accent?.trim();
  if (!detail || detail === "Chinese") return voice;
  const regional = /^Chinese \((.+)\)$/.exec(detail);
  return `${voice} · ${regional?.[1] ?? detail}`;
}

/** The catalog voice matching a character's hint, or the catalog default. */
export function matchVoice(voices: ViduS2AvatarVoicesMessage, hint: string): string {
  const query = hint.trim().toLowerCase();
  const match = query
    ? systemVoices(voices).find((entry) =>
        [entry.voice, entry.accent, entry.description].some((part) =>
          part?.toLowerCase().includes(query),
        ),
      )
    : undefined;
  return match?.voice ?? voices.default_voice;
}

// ── Reference images ───────────────────────────────────────────────────────

export type ReferenceKind = "object" | "garment" | "background";

export interface ReferenceInEffect {
  image_id: string;
  kind: string | null;
}

export function referencesInEffect(
  snapshot: ViduS2AvatarSessionStateMessage | null,
): ReferenceInEffect[] {
  return (snapshot?.reference_images ?? []).flatMap((entry) => {
    const record = entry as { image_id?: unknown; kind?: unknown } | null;
    return record && typeof record.image_id === "string"
      ? [
          {
            image_id: record.image_id,
            kind: typeof record.kind === "string" ? record.kind : null,
          },
        ]
      : [];
  });
}

// ── What to tell the person ────────────────────────────────────────────────

const END_REASONS: Record<string, string> = {
  ended_by_client: "Call ended.",
  max_duration: "The call reached its time limit.",
  idle_timeout: "The call ended after a long silence.",
  content_policy: "The call was ended by content moderation.",
  upstream_quota: "The call ended because the generation service ran out of quota. This is not something you did.",
  upstream_interrupted: "The generation service dropped the call. Start it again.",
  media_lost: "The character's video stopped arriving. Start the call again.",
  bridge_failed: "The call failed on Reactor's side. Start it again.",
};

export function endReasonLine(reason: string | null): string {
  return (reason && END_REASONS[reason]) ?? "Call ended.";
}

export function phaseLine(snapshot: ViduS2AvatarSessionStateMessage | null): string {
  switch (phaseOf(snapshot)) {
    case null:
    case "idle":
      return "Pick a character, or upload a photo of one person.";
    case "preparing_avatar":
      return "Preparing the character…";
    case "avatar_ready":
      return "Character ready. Start the call when you are.";
    case "starting":
      return "Starting the call…";
    case "warming_up":
      return snapshot && snapshot.warmup_attempts > 2
        ? "Still warming up. This is taking longer than usual."
        : "Warming up…";
    case "live":
      return "Live.";
    case "ending":
      return "Ending the call…";
    case "failed":
      return "The call failed to start.";
    case "ended":
      return endReasonLine(snapshot?.end_reason ?? null);
    case "unknown":
      return `The model reported a phase this app does not know (${snapshot?.phase}). End the call or disconnect.`;
  }
}

/** `mm:ss`, for the time a call has left. */
export function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** The microphone the model wants: one channel, cleaned up by the browser. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};
