// The scene each mode opens with.
//
// A demo that starts empty asks the reader to invent a subject, a place, and a
// shot before it does anything, so every mode loads a working scene from the
// images vendored in `public/presets`. Replace them with your own: a preset is
// three or four strings and a file path.
//
// The descriptions read as noun phrases because the prompt builder drops them
// into "<Subject N> is <description>, shown in <Picture N>, preserving …".

import type { Mode } from "./shot";

export interface PresetSlot {
  /** Path under `public/`. Fetched and turned into a File on load. */
  src: string;
  description: string;
}

export interface Preset {
  slots: PresetSlot[];
  action: string;
  sound: string;
  seconds: number;
}

const HUNTER: PresetSlot = {
  src: "/presets/hunter.jpg",
  description:
    "the long-haired hunter in the black leather combat suit and tattered cloak, carrying a single silver short blade",
};

const TECH_HUNTER: PresetSlot = {
  src: "/presets/tech-hunter.jpg",
  description:
    "the short-haired tech hunter in the white fox mask and black trench coat lit by cyan circuit lines, carrying a single blue energy dagger",
};

const INTERSECTION: PresetSlot = {
  src: "/presets/intersection.jpg",
  description:
    "the rainy night intersection under a giant blue-purple holographic billboard, with neon signs, wet reflective asphalt and drifting fog",
};

export const PRESETS: Record<Mode, Preset> = {
  "one-subject": {
    slots: [HUNTER],
    action:
      "she walks slowly toward the camera through heavy rain, rainwater running off her cloak, then stops an arm's length away and looks directly into the lens. The camera holds at chest height and drifts a few centimetres closer as she stops.",
    sound:
      "Heavy rain on asphalt and wet fabric, slow deliberate footfalls, and the low hum of neon. No dialogue.",
    seconds: 7,
  },
  "two-subjects": {
    slots: [HUNTER, TECH_HUNTER, INTERSECTION],
    action:
      "the two of them stand five metres apart in a tense standoff, circle each other slowly through the rain with their weapons held low, and end by raising them without striking. The camera tracks sideways at waist height, keeping both in frame while the billboard throws shifting light across their shoulders.",
    sound:
      "Heavy rain on asphalt and fabric, slow deliberate wet footfalls, the low hum of neon signs, distant traffic, and one soft electrical crackle as the energy dagger ignites. No dialogue.",
    seconds: 10,
  },
  // Free style sends the text exactly as typed, so this one carries the whole
  // six-section prompt rather than the parts.
  free: {
    slots: [
      { src: HUNTER.src, description: "" },
      { src: TECH_HUNTER.src, description: "" },
      { src: INTERSECTION.src, description: "" },
    ],
    action: `subject_definitions:
<Subject 1> is the long-haired hunter in <Picture 1>, preserving her face, long wet black hair, black leather combat suit, tattered black cloak, black gloves, and single silver short blade.
<Subject 2> is the tech hunter in <Picture 2>, preserving her face, short black hair, white fox mask with red markings, black trench coat with cyan circuit lines, black boots, and single blue energy dagger.
<Subject 3> is the rainy intersection in <Picture 3>, preserving its skyscrapers, giant blue-purple holographic billboard, neon signs, wet reflective asphalt, rain, and drifting fog.

summary:
In one continuous 10-second shot, <Subject 1> and <Subject 2> face each other in <Subject 3>, circle slowly through the rain, and end with their weapons raised.

retention_analysis:
<Subject 1> (appears throughout): fully_preserved - retain the same face, long hair, black combat suit, cloak, body proportions, and one silver blade.
<Subject 2> (appears throughout): fully_preserved - retain the same face, short hair, fox mask, cyan-lit trench coat, body proportions, and one energy dagger.
<Subject 3> (appears throughout): fully_preserved - retain the wet intersection, billboard, neon palette, rain, fog, and reflective pavement.

detailed_description:
Photorealistic live-action cinema, high contrast purple-and-cyan night lighting, heavy rain, physically coherent motion, stable identities. One continuous shot with no cuts, no duplicate people, no duplicate weapons, no costume changes, and no readable text.

[Shot 1] A low wide camera frames both fighters five metres apart on the rain-soaked street. They circle each other slowly and counter-clockwise, boots pressing ripples into the standing water, eyes locked. The camera tracks sideways at waist height while the billboard throws shifting blue-purple light across their shoulders. In the final seconds each raises a weapon to guard height and the shot holds on the unresolved standoff.

overall_soundscape:
Heavy rain on asphalt and fabric, slow deliberate wet footfalls, the low hum of neon signs, distant traffic, and one soft electrical crackle as the energy dagger ignites. No dialogue.

non_diegetic_music:
A low sustained synth drone, slowly rising in pitch, with no percussion.`,
    sound: "",
    seconds: 10,
  },
};

/** Fetch a vendored preset image and hand back a File the slots can hold. */
export async function loadPresetFile(src: string): Promise<File> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Preset image ${src} failed: ${res.status}`);
  const blob = await res.blob();
  const name = src.split("/").pop() ?? "reference.jpg";
  return new File([blob], name, { type: blob.type || "image/jpeg" });
}
