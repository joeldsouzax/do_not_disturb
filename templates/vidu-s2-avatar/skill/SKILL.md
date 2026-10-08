---
name: building-do-not-disturb-frontends
description: Extend the camera and voice tabletop prototype with human DM authority, H3 reference-conditioned story shots, Nano Banana anchors, pause detection and server-side model authentication.
---

# Building on Do Not Disturb

`app/page.tsx` mounts `VoiceTable.tsx`. The default view is a full-viewport TV/game HUD, without a website header or footer.
Native fullscreen is requested from the start gesture and is not required for that layout.
The title/waiting screen loops public/examples/trailer.webm, a one-time generated
promotional asset. Never feed its cast or scenery into campaign context. Hide and
pause it only when live game frames arrive; resume it after disconnect/end.
The primary interaction is camera plus
voice: one start, introduce miniatures, narrate/play aloud, pause, watch the
adjudicated story. `/studio` mounts the optional manual `AdventureTable` with
world-model experiments. Archived Vidu components are not the main product.

## Model selection

H3 Reference Turbo Realtime is the default story renderer. Voice turns send
renderImage:false: cast photos and narration suffice; do not insert a slow Nano
Banana generation before video. Nano Banana anchors remain optional in /studio.
An absent scene image is valid for H3, and party updates preserve an existing
location reference. Do not film a saved cast before the current camera capture. Location images guide scenery only, never override cast IDs. Before changing its
commands, read the installed `@reactor-models/h3-reference-to-video-turbo-realtime`
package schema and README. Its 0.5.5 schema supports optional audio references
and text-only generation. This app supplies ordered miniature references. A location image is optional
for an independent opening shot and omitted on continuations to prevent stale
opening props from resetting later beats. Continue only within the same location.
Do not port command names from fast-h3; it is a different model.

- Model-specific imports come from typed `@reactor-models/*` packages.
- Prepare the connection in parallel with speech startup after media permission
  succeeds. Preparing never generates a scene or hides the trailer; require
  a real clip_started revision and playing frames. Connect before upload.
  Upload sequentially; order binds `Picture N`.
- Guard prepare, upload, generation waits and command results with a session
  epoch. End or transport loss invalidates pending work; an old finally/catch
  cannot alter a new session. Clear idle/prepare work and playback revisions.
- Reuse uploaded FileRefs only inside the same session. Clear them on disconnect.
- Enable autoplay before enqueue. Set flush-on-clip-end false to hold boundaries.
- Await command replies and surface command_error; refusals can resolve undefined.
- Enqueue replies give effective duration. Story clips request five seconds, not an
  entire unbounded narration. Never synthesize extra game events to fill silence.
- Buffer one ambient continuation only after a human DM scene exists. Preserve
  completed outcomes and final positions; animate only breathing, existing
  weather and flame flicker. Do not repeat the actions in the scene context.
  Buffer at most one ambient build. Keep it playing while a real beat builds;
  discarding a running build wastes compute and exposes a frozen frame. Queue
  a new real beat at position zero only when no earlier real beat is building.
  Otherwise append to preserve human narration order across location cuts.
  Serialize ambient enqueue commands with story commands.
  Pause/end/disconnect must stop ambient scheduling and clear all snapshots.
- Continue only from a generated clip. The adapter waits for the preceding
  queued clip's generated event, surfaces failures and never pretends queueing
  is successful playback. Repeat cast, appearance and lighting per shot.
- Mirror state_update for playback/queue status. Clear snapshots after disconnect.
- Use main_video plus synchronized main_audio. Prompts request ambient effects;
  humans at the table already provide dialogue and narration.

Optional world adapters remain in `world-models.tsx`. Read each installed typed
package’s schema and README before modification: LingBot World 2 requires accepted image/prompt setup and
explicit movement stops; Helios uses setConditioning; HappyOyster uses directing
mode and explicitly passes the JWT resolver to facade connect(). Do not send
commands from disposed React teardown.

## Voice lifecycle

`table-listener.ts` records before speech starts, uses RMS energy relative to a
noise floor, closes after 1.8 seconds of silence and records a fresh container
for each turn. Very brief noise is discarded. Idle recordings reset every ten
seconds; voiced recordings are bounded at one minute. Keep those boundaries and
headers; arbitrary WebM byte slices are not valid independent recordings.

`VoiceTable` interprets turns in order while a separate ordered video queue
waits for generation. Video latency must not block later interpretation. Camera
frames are captured at each utterance boundary, not after a long server request.
The sample automatically pauses at each detected turn boundary. Resume only
after interpretation completes and, for a DM beat, clip_started confirms that
scene revision. Do not mistake enqueue or an earlier held frame for readiness.
Explicit manual pauses must override automatic resume.

The sample WAV uses an HTMLAudioElement -> MediaElementAudioSourceNode ->
analyser and MediaStreamDestination -> the same MediaRecorder path as the
microphone. Its pause/resume controls stop only the sample element, allowing
silence detection and video processing to continue. Do not suspend AudioContext
to pause the sample; that blocks the turn needed to produce buffered video. Never bypass speech interpretation
with a hardcoded demo script. Its synthetic voices and five-second gaps are real. The four-turn recording
introduces a miniature and DM setting, a player intent, its DM result, then a
DM-directed move from forest to crypt. Preserve the pause/resume controls.

`live-transcription.ts` streams 16 kHz PCM to Gemini 3.5 Transcribe Live over
a constrained WebSocket. `/live-token` issues a single-use ephemeral token
locked to transcription setup; the full key remains server-side. Interim text
is display-only. Only finalized text drives interpretation. Manual activity
boundaries follow VAD; retain the valid independent audio recording as fallback
if a live finalization fails. Stop/reconnect cannot attribute an old final to a
new turn. Camera/audio interpretation and visual planning share one Gemini 3.8 Flash
call: low thinking for ordinary interpretation, medium when pending intents
need adjudication. Clearly labeled first-person player requests bypass the LLM
and enter pending directly; they can never commit a scene or resolve an action. Reuse finalized text as the transcript instead of asking the
model to echo it. Send a camera image only for capture/setup (or audio fallback),
not every subsequent text turn. Explicit spoken labels establish attribution;
uncertain player outcomes and unclear camera details must not lower speaker
confidence or cause a redundant speaker question.

The server signs the plan so scene commits do not add a second LLM wait.

`listen/route.ts` sends finalized text (or fallback audio) and camera pixels to Gemini with structured
classification. Explicitly distinguish DM narration, player intent, setup and
uncertainty. Speaker names/labels identify authority, not voice biometrics. Low
confidence asks a spoken question and preserves context for the next answer.
Validate normalized boxes, transcript size, known speakers and resolved IDs.

Close timers, MediaRecorder, camera/mic tracks, sample source and AudioContext;
abort fetches and invalidate old async results on end/unmount. Revoke audio URLs.
Do not silently drop queued utterances during model latency. Error paths must
allow retry without committing the same story twice.

## Authoritative state

`adventure-server.ts` owns two isolated records and atomic saves.
`X-Adventure-Mode: live|example` scopes table, listen, scene and speech vocabulary.
Default live campaigns in `.adventure/table.json` begin with empty party/scene.
The example starts empty too; the WAV establishes all facts and writes only
`.adventure/example-table.json`. Reset is permitted only for the example and
keeps scene revisions monotonic. Archive legacy unscoped records intact. Never
invent a tavern, hero, quest or room geometry before the DM establishes it.
Do not film setup-only speech before a DM setting exists. Recent DM events and
previous heard turn help resolve continuity across pauses, without giving
player requests authority. This is one
local Node process, not distributed multiplayer storage. Preserve original DM
narration separately from the compact `visualBeat`. Player speech is intent;
only explicitly addressed IDs leave pending on a spoken DM ruling.

Party capture matches established names to IDs and cannot replace a hero with a
waiting intent. Scene builds snapshot the cast/revision/selected actions and
recheck them before commit. Actions arriving during generation remain pending.
Generated assets and state remain ignored. Provider API keys stay server-side;
the browser holds scoped session credentials.

`dnd-context.ts` is the shared source for general paraphrased
SRD guidance and visual constraints. See `../../../docs/dnd-context.md` for sources
and attribution. Preserve identity, room geometry, DM authority and period
materials. Use pre-industrial visual defaults unless the DM explicitly defines another
setting. Visible flame/daylight/moonlight; exclude neon, bulbs, LEDs,
wires, modern signs and fixtures. Magic is not permission to invent electricity.
Full context goes to Gemini planning/interpretation and Nano Banana. Bounded
visual prompts preserve the established beat rather than copy whole rulebooks.

## Authentication

The token route allowlists five engines and scopes JWTs to their exact provider
model names. Return `{ jwt, expires_at }` with private/no-store. The resolver
memoizes per engine in module scope until shortly before expiry. Every hop of a
session needs the token that created it. Never rely on browser HTTP caching or
mint unscoped browser tokens. Both provider keys remain server-side.

## Verification

Run the template production build. Exercise the actual example WAV and confirm
pause-separated setup, pending player intent, explicit DM resolution, ordered
cast references, moving H3 frames and cleanup/reconnect. Surface capacity errors
honestly. Verify absent keys render setup, scene conflicts preserve actions and
runtime state/credentials stay ignored. Keep detailed runtime evidence in the
project records; do not claim a complete rules engine or tracked physical board.

## Repository layout

This is the only retained app under `templates/`. Its adapters import installed
`@reactor-models/*` packages, not sibling template source. Keep model contracts
in this skill and consult the installed packages; do not refer contributors to
removed template folders. Run app checks from `templates/vidu-s2-avatar`.
