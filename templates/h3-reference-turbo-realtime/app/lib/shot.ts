// A shot, and how it becomes a prompt.
//
// The model reads the prompt as plain text and stores it unchanged, so the
// section labels below are a convention rather than syntax. They earn their
// place by covering the decisions the model has to make, in the order it
// helps to make them, and by keeping a subject bound to the picture it came
// from. The UI collects the parts; this file assembles them.

export type Mode = "one-subject" | "two-subjects" | "free";

export type SlotRole = "subject" | "place";

/** One reference image and what the prompt should call it. */
export interface Slot {
  /** 1-based position in the reference list. Binds to `Picture N`. */
  index: number;
  role: SlotRole;
  /** Fixed label for the guided modes ("the character", "the setting"). */
  hint: string;
  /** What the user typed about this reference. */
  description: string;
  /** Local file, before upload. */
  file: File | null;
}

export interface ShotDraft {
  mode: Mode;
  slots: Slot[];
  /** What happens in the clip. In free mode this is the whole prompt. */
  action: string;
  /** Optional, and worth having: the model generates audio in the same pass. */
  sound: string;
  seconds: number;
  /** Empty string means let the session pick and advance its own seed. */
  seed: string;
}

export const MODES: Array<{
  id: Mode;
  label: string;
  blurb: string;
}> = [
  {
    id: "one-subject",
    label: "1 subject, 1 shot",
    blurb: "One reference. Describe who it is, then what they do.",
  },
  {
    id: "two-subjects",
    label: "2 subjects, 1 place",
    blurb: "Two characters and the setting they meet in.",
  },
  {
    id: "free",
    label: "Free style",
    blurb: "Up to nine references and the prompt written your way.",
  },
];

/** The fixed slot layout for each guided mode. Free mode grows on demand. */
export function slotsForMode(mode: Mode): Slot[] {
  if (mode === "one-subject") {
    return [
      {
        index: 1,
        role: "subject",
        hint: "The subject",
        description: "",
        file: null,
      },
    ];
  }
  if (mode === "two-subjects") {
    return [
      {
        index: 1,
        role: "subject",
        hint: "First subject",
        description: "",
        file: null,
      },
      {
        index: 2,
        role: "subject",
        hint: "Second subject",
        description: "",
        file: null,
      },
      {
        index: 3,
        role: "place",
        hint: "The place",
        description: "",
        file: null,
      },
    ];
  }
  return [
    { index: 1, role: "subject", hint: "Reference", description: "", file: null },
  ];
}

export const MAX_SLOTS = 9;

/** Durations offered in the picker. The model rounds to its own frame grid. */
export const DURATIONS = [5, 7, 10, 12, 15] as const;

function subjectLine(slot: Slot): string {
  const name = slot.role === "place" ? "the place" : "the person";
  const described = slot.description.trim() || `${name} shown`;
  const preserve =
    slot.role === "place"
      ? "preserving its architecture, surfaces, colour palette, and light direction"
      : "preserving their face, hair, clothing, and any object they carry";
  return `<Subject ${slot.index}> is ${described}, shown in <Picture ${slot.index}>, ${preserve}.`;
}

function retentionLine(slot: Slot): string {
  const traits =
    slot.role === "place"
      ? "retain the architecture, surfaces, palette, and light direction"
      : "retain the same face, hair, clothing, and body proportions";
  return `<Subject ${slot.index}> (appears throughout): fully_preserved - ${traits}.`;
}

/**
 * Assemble the prompt.
 *
 * Free mode returns the action text untouched, so a prompt written by hand is
 * sent exactly as typed. The guided modes build the sections from the slots,
 * which is what keeps `Picture N` bound to the description the user wrote for
 * that image.
 *
 * `continuing` switches the wording to the next stretch of the same shot. It
 * pairs with `continue_from_clip_id` on the enqueue: restating the subjects
 * and the look is what keeps the seam quiet, since each clip is prompted on
 * its own.
 */
export function buildPrompt(
  draft: ShotDraft,
  options: { continuing?: boolean } = {},
): string {
  if (draft.mode === "free") return draft.action;

  const filled = draft.slots.filter((s) => s.file !== null);
  const action = draft.action.trim();
  const sound =
    draft.sound.trim() ||
    "Ambient sound appropriate to the scene, and the movement of the subjects. No dialogue.";

  const summary = options.continuing
    ? `Continuing the same shot, ${action}`
    : `In one continuous ${draft.seconds}-second shot, ${action}`;

  const look = options.continuing
    ? "Photorealistic live-action cinema, the same lighting and palette as the preceding shot, physically coherent motion, stable identities."
    : "Photorealistic live-action cinema, natural light, physically coherent motion, stable identities.";

  const beat = options.continuing
    ? `[Shot 1] The shot continues from the previous clip. ${action}`
    : `[Shot 1] ${action}`;

  return [
    "subject_definitions:",
    filled.map(subjectLine).join("\n"),
    "",
    "summary:",
    summary,
    "",
    "retention_analysis:",
    filled.map(retentionLine).join("\n"),
    "",
    "detailed_description:",
    `${look} One continuous shot with no cuts, no duplicate people, no costume changes, and no readable text.`,
    "",
    beat,
    "",
    "overall_soundscape:",
    sound,
    "",
    "non_diegetic_music:",
    "None.",
  ].join("\n");
}

/** What still blocks a queue, in the order worth telling the user about. */
export function draftProblem(draft: ShotDraft): string | null {
  const filled = draft.slots.filter((s) => s.file !== null);
  if (filled.length === 0) return "Add a reference image.";
  if (draft.mode === "one-subject" && !draft.slots[0].description.trim())
    return "Describe the subject in the reference.";
  if (draft.mode === "two-subjects" && filled.length < 3)
    return "All three references are needed: two subjects and a place.";
  if (
    draft.mode === "two-subjects" &&
    filled.some((s) => !s.description.trim())
  )
    return "Describe each reference.";
  if (!draft.action.trim())
    return draft.mode === "free"
      ? "Write the prompt."
      : "Describe what happens in the shot.";
  return null;
}
