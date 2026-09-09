// Starting points for the composer.
//
// Both presets are written in the six-section shape the model responds well
// to: define the subjects and bind each to its picture, summarise the clip,
// say which traits must not drift, then describe the look, the beats, and the
// sound. The sections are a convention, not syntax — the model reads the
// prompt as plain text — but they cover the decisions it has to make.
//
// `references` is how many pictures the preset expects. The composer names
// them `Picture 1`, `Picture 2`, … in list order, so a preset written for two
// pictures needs two uploads before it can be queued.

export interface ScenePreset {
  id: string;
  title: string;
  blurb: string;
  references: number;
  prompt: string;
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: "portrait",
    title: "One subject, one shot",
    blurb: "A single reference. The camera does the work.",
    references: 1,
    prompt: `subject_definitions:
<Subject 1> is the person in <Picture 1>, preserving their face, hair, and clothing.

summary:
In one continuous shot, <Subject 1> looks off camera, then turns to face it and holds the look.

retention_analysis:
<Subject 1> (appears throughout): fully_preserved - retain the same face, hair, clothing, and body proportions.

detailed_description:
Photorealistic portrait cinema, soft window light from the left, shallow depth of field, physically
coherent motion, stable identity. One continuous shot with no cuts, no duplicate people, no costume
changes, and no readable text.

[Shot 1] A chest-height camera holds <Subject 1> slightly off centre, looking away from the lens.
They breathe once, then turn their head toward the camera and settle into a steady look as the
camera drifts a few centimetres closer.

overall_soundscape:
Quiet room tone, one soft breath, and the faint rustle of clothing. No dialogue.

non_diegetic_music:
A single sustained piano note that fades in and holds.`,
  },
  {
    id: "two-subjects-one-place",
    title: "Two subjects and a place",
    blurb: "Three references: a character each, plus the setting they meet in.",
    references: 3,
    prompt: `subject_definitions:
<Subject 1> is the person in <Picture 1>, preserving their face, hair, and clothing.
<Subject 2> is the person in <Picture 2>, preserving their face, hair, and clothing.
<Subject 3> is the place in <Picture 3>, preserving its architecture, surfaces, colour palette, and
light direction.

summary:
In one continuous shot, <Subject 1> and <Subject 2> meet in <Subject 3>, greet each other, and stand
together as the camera settles into a two-shot.

retention_analysis:
<Subject 1> (appears throughout): fully_preserved - retain the same face, hair, clothing, and body proportions.
<Subject 2> (appears throughout): fully_preserved - retain the same face, hair, clothing, and body proportions.
<Subject 3> (appears throughout): fully_preserved - retain the architecture, surfaces, palette, and light direction.

detailed_description:
Photorealistic live-action cinema, natural light, physically coherent motion, stable identities. One
continuous shot with no cuts, no duplicate people, no costume changes, and no readable text.

[Shot 1] A waist-height camera frames <Subject 3> with <Subject 1> entering from frame left.
<Subject 2> is already standing near the centre and turns as <Subject 1> approaches. They stop an
arm's length apart and greet each other with a short nod. The camera tracks sideways and settles
into a medium two-shot with both faces visible.

overall_soundscape:
Ambient room or street tone appropriate to the place, two sets of footsteps, and the rustle of
clothing. No dialogue.

non_diegetic_music:
A warm sustained pad that rises as they meet and holds under the two-shot.`,
  },
];
