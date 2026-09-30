// What the app knows about an edit, in the model's own terms.
//
// The model's `session_state` is the one snapshot to mirror. Its `phase`
// arrives as a string; `phaseOf` narrows it to the seven phases the model
// documents, and every predicate below reads that.

import type {
  FileRef,
  ViduS2EditingSessionStateMessage,
  ViduS2EditingStartEditParams,
} from "./model";

export type EditingType =
  | "style_transfer"
  | "virtual_tryon"
  | "subject_replacement"
  | "background_replacement";

/** The four scenarios, in the order the picker shows them. */
export const SCENARIOS: ReadonlyArray<{
  editingType: EditingType;
  label: string;
  hint: string;
}> = [
  {
    editingType: "subject_replacement",
    label: "Character swap",
    hint: "A character replaces you and follows your movement.",
  },
  {
    editingType: "virtual_tryon",
    label: "Try-on",
    hint: "You wear the garment in the image.",
  },
  {
    editingType: "style_transfer",
    label: "Style",
    hint: "The whole scene takes on the image's look.",
  },
  {
    editingType: "background_replacement",
    label: "Background",
    hint: "You stay; the scene behind you changes.",
  },
];

export type Phase =
  | "idle"
  | "starting"
  | "warming_up"
  | "live"
  | "ending"
  | "ended"
  | "failed";

const PHASES: ReadonlyArray<Phase> = [
  "idle",
  "starting",
  "warming_up",
  "live",
  "ending",
  "ended",
  "failed",
];

export function phaseOf(
  snapshot: ViduS2EditingSessionStateMessage | null,
): Phase | null {
  if (!snapshot) return null;
  return (PHASES as ReadonlyArray<string>).includes(snapshot.phase)
    ? (snapshot.phase as Phase)
    : "failed";
}

/** `start_edit` is accepted from these phases, and only these. */
export function editStartable(phase: Phase | null): boolean {
  return phase === "idle" || phase === "ended" || phase === "failed";
}

/** An edit exists: `end_edit` is accepted and the source is locked. */
export function editActive(phase: Phase | null): boolean {
  return (
    phase === "starting" ||
    phase === "warming_up" ||
    phase === "live" ||
    phase === "ending"
  );
}

/** `switch_reference` needs this. */
export function editLive(
  snapshot: ViduS2EditingSessionStateMessage | null,
): boolean {
  return phaseOf(snapshot) === "live" && snapshot?.control_ready === true;
}

/** The images the model accepts as a reference. */
export function acceptsImage(file: File): boolean {
  return (
    ["image/png", "image/jpeg", "image/webp"].includes(file.type) &&
    file.size <= 10 * 1024 * 1024
  );
}

/** The `start_edit` / `switch_reference` payload. Never carries a null. */
export function referenceParams(
  editingType: EditingType,
  image: FileRef,
): ViduS2EditingStartEditParams {
  return { editing_type: editingType, reference_image: image };
}

// ── What to tell the person ────────────────────────────────────────────────

const END_REASONS: Record<string, string> = {
  ended_by_client: "Edit stopped.",
  max_duration: "The edit reached its time limit.",
  content_policy: "The edit was stopped by content moderation.",
  upstream_quota:
    "The edit stopped because the generation service ran out of quota. This is not something you did.",
  upstream_interrupted: "The generation service dropped the edit. Start it again.",
  media_lost: "The edited video stopped arriving. Start the edit again.",
  bridge_failed: "The edit failed on Reactor's side. Start it again.",
};

export function endReasonLine(reason: string | null): string {
  return (reason && END_REASONS[reason]) ?? "Edit stopped.";
}

export function phaseLine(
  snapshot: ViduS2EditingSessionStateMessage | null,
): string {
  switch (phaseOf(snapshot)) {
    case null:
    case "idle":
      return "Pick a source and a reference, then start.";
    case "starting":
      return "Starting the edit…";
    case "warming_up":
      return "Warming up…";
    case "live":
      if (!snapshot?.camera_forwarding) return "Waiting for your camera to reach the editor…";
      return snapshot.video_receiving ? "Live." : "Waiting for the first edited frame…";
    case "ending":
      return "Stopping…";
    case "failed":
      return "The edit failed to start.";
    case "ended":
      return endReasonLine(snapshot?.end_reason ?? null);
  }
}

/** `mm:ss`, for the time an edit has left. */
export function clock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
