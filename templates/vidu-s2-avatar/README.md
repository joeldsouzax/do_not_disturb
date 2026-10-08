# Do Not Disturb — your table, a cinematic adventure

Keep the miniatures, dice, player voices and human Dungeon Master at the physical
D&D table. The screen films the story as it is narrated. It is not a call with an
avatar, and players do not steer an exploratory world with movement buttons.

## Run

```bash
cd templates/vidu-s2-avatar
pnpm install --frozen-lockfile
pnpm dev --hostname 127.0.0.1 --port 3000
```

Open http://127.0.0.1:3000. In this checkout, ignored `.env.local` links to root
`.env`. Standalone copies need both server-side keys in their `.env.local`:

```dotenv
REACTOR_API_KEY=your_reactor_key
GOOGLE_AI_STUDIO_KEY=your_google_ai_studio_key
```

The folder retains its upstream public identifier. Keys never reach the browser.

## Play

1. **Begin adventure**, allow camera and microphone access, and point the camera
   at up to six miniatures. Introduce their names and classes aloud.
2. The waiting screen loops the bundled trailer. No character or location is
   assumed. Capture the actual miniatures and let the DM establish the setting
   aloud before filming. Say **Dungeon Master** before narrating a scene or ruling. Players say their
   character's name before an action. This identifies intent and authority;
   the app does not infer that anyone holding the microphone is the DM.
3. Pause when finished. About 1.8 seconds of silence closes a spoken turn;
   live transcription and visual planning run while the microphone keeps listening.
4. The app recognizes and crops miniature references from the camera. H3 uses
   the ordered cast references and narration directly; a location
   image is optional on the first shot and is omitted on continuation. There is no image-generation wait before requesting video.
5. Player intents wait for the human DM. A spoken ruling resolves only the
   intents it addresses and queues the next cinematic beat. H3 continues from
   a generated clip within the same location. Five-second story shots reduce
   build time. One ambient continuation is buffered between turns: breathing,
   existing weather and flame flicker, without advancing the story.
6. New locations follow the DM’s narration. **End session** releases
   camera/microphone, audio context and the Reactor session.

There are no text fields, character selectors, model menus or per-turn record
buttons on the main screen. Uncertain speech produces a spoken clarification.
Turn attribution uses speech labels, not biometric speaker identification.
Overlapping conversation and very long pauses inside a sentence remain limitations.

**Play the spoken example** feeds [spoken-example.wav](public/examples/spoken-example.wav)
through the same audio analyser, silence detector, recorder and interpretation
route as the microphone. It uses a clearly labeled sample miniature photo rather
than claiming access to a real camera. The recording contains DM introduction,
player intent and DM ruling, a narrated move into a crypt, with five-second gaps. Its accessible transcript is
[spoken-example.txt](public/examples/spoken-example.txt). It resets only `.adventure/example-table.json` and generates real video;
your DM’s campaign in `.adventure/table.json` stays separate. **Pause example**
stops the WAV while listening, interpretation and video generation continue.
At each turn boundary, the example also pauses automatically until interpretation
finishes and, for a DM beat, that exact scene starts playing. **Keep example
paused** converts automatic buffering to a manual pause.
**Resume example** continues at the same position, so you can wait for video.

The TV layout fills the browser by default, with small party/listening overlays
and no website header or footer. Begin adventure requests native fullscreen;
browsers that decline still keep the full TV layout.

The bundled [trailer](public/examples/trailer.webm) is generated once with H3
from a promotional fantasy prompt, then played locally as a muted loop. Page
loads spend no generation credits. It stays visible until actual game video
starts and returns after ending a session. Its cast and scenery never enter
the DM’s record.

## Model choices

| Role                                                                      | Model                                              |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| Live speech transcription                                                 | Gemini 3.5 Transcribe Live                         |
| Camera/audio interpretation, authority classification and visual planning | Gemini 3.8 Flash (low; medium for pending rulings) |
| Miniature-derived opening and new locations                               | Nano Banana Pro                                    |
| Story-following video with synchronized ambient audio and cast references | H3 Reference Turbo Realtime                        |
| Spoken clarification and sample voices                                    | Gemini 3.8 Flash TTS                               |

H3 is the default because the screen follows adjudicated game events rather than
being explored as a separate game. It generates bounded story shots and ambient continuations that preserve the
last DM-established outcome during silence. Ambient generation ends with the
session. It can take time to build a shot. Capacity and failures
are shown, with an explicit retry when enqueueing fails. Generated sound is
ambient; the humans supply narration and dialogue at the table.

The optional `/studio` retains manual controls and the LingBot World 2,
HappyOyster Director and Helios experiments. `/studio?engine=fast` selects the
Fast H3 continuous-scene experiment; `/studio?engine=h3` selects reference H3. The old Vidu app is retained as
reference code. Google model IDs can be overridden server-side with
`GEMINI_IMAGE_MODEL`, `GEMINI_TEXT_MODEL` and `GEMINI_TTS_MODEL`.

## Contracts and limits

One local Node process owns `.adventure/table.json`, pending actions, cast,
original DM narration, compact visual beats and a journal. Real campaigns start
with an empty party and setting. Only camera captures and human narration add
those facts. Older records that mixed demo and real speech are preserved as
`.adventure/legacy-<uuid>.json`, rather than imported into a real campaign.
Atomic replacement
survives restarts. Scene revision checks preserve concurrent actions and refuse
stale renders. Replacing a party cannot erase its pending intents. Generated
media and credentials are ignored by Git.

This is a local prototype without campaign accounts, DM authentication,
distributed state, physical position tracking or a full numerical rules engine.
Dice, character-sheet numbers and adjudication belong to the human DM. Each
browser session creates its own model output; shared video broadcasting is not
implemented. Do not run multiple voice controllers over the same table.

Read [skill/SKILL.md](skill/SKILL.md) before extending it. D&D sources,
SRD attribution and the medieval visual defaults are recorded in
[the context notes](../../docs/dnd-context.md). The
[sample wizard](https://em4miniatures.com/en-us/products/elfsera-the-wise-wizard)
is from em4miniatures; players supply their own figures in the intended game.

## Verification record — 2026-10-08

Production build and type checks passed. Chrome runtime checks confirmed:

- TV stage and viewport both 900 px high, with no header/footer or page scroll.
- Real H3 video at 1344×768; generated output was recorded to a saved WebM.
- The sample paused at 22.489 seconds for eight seconds without advancing,
  while the video session and speech interpretation continued, then resumed.
- Three recorded turns classified as DM, player intent and DM ruling. Both DM
  scenes committed; the intent remained pending until the ruling, then cleared.
- End/reconnect produced fresh moving output. Camera/microphone tracks both
  reported ended after closing the camera session.
- A stale scene request returned 409. Missing provider keys rendered setup with
  disabled start and a 503 token response rather than a failed page.

An earlier run encountered Google's explicit temporary-capacity 503. Provider
requests now make up to two bounded retries for that response. They do not retry
ambiguous network failures or successful generations. Video capacity and build
latency remain provider-dependent; the WAV pause control provides manual pacing.

### Trailer and DM ownership verification

The updated production build passed. Chrome decoded the local 1344×768 trailer,
advanced playback time and made zero Reactor token requests on the waiting
screen. Before connection preparation was added, beginning with a fake camera displayed
no sample photo or preloaded party and made no video request before introduction;
both tracks ended on close. Preparing now opens only the transport, keeping
generation and game frames gated on a real captured party and DM beat.
The updated WAV is 89.84 seconds at 24 kHz with three inserted five-second gaps.
An offline RMS check found exactly three silence boundaries above the 1.8-second
turn threshold. The recording was updated without playing it automatically.
Its four transcripts were exercised against the actual interpretation and scene
APIs: DM setup/narration, pending player intent, explicit resolution, then crypt
location change. All passed; a before/after comparison confirmed the real record
was untouched. The real API refused an example reset with HTTP 400.

Live transcription probes finalized 8-second test utterances 365–569 ms after
explicit activity end. These are two local measurements, not a latency guarantee.
A small comparison rejected Gemini 3.5 Flash Lite for authority/planning because
it invented story details and resolved an unrelated intent. Gemini 3.8 Flash
remains the planner. TTS Lite showed no material speed improvement in the short
clarification probes; ordinary DM beats do not wait for synthesized speech.

### Latency and pacing verification

An isolated Chrome example run showed the original 10-second shot ending and
then holding at 243 decoded frames while later narration was still being
processed. During actual playback the receiver ran at 22–24 fps with no dropped
frames: the main stall was the empty generation/playout queue, not decoding.

The updated four-turn run buffered audio automatically at utterance boundaries,
accepted DM/player/DM/DM without a speaker question, preserved an explicit manual
pause until resume, and committed all three scenes in order. Ambient output
continued across the narration and location transition, reaching 2,647 decoded
frames at 24 fps, with zero drops and 1.4 seconds of aggregate receiver freezes
over roughly 110 seconds of video. This is one local run, not a latency guarantee.
The labeled player-intent endpoint completed in 6 ms without an LLM or scene
mutation. A separate two-character check left unrelated intents pending and
asked for clarification for an unlabeled ambiguous request.

Ordinary interpretation uses low thinking; adjudication with waiting intents
keeps medium thinking. Small probes of Gemini 3.5 and 3.6 at minimal thinking
were quicker but misclassified DM speech or guessed ambiguous speakers, so they
were not selected. Initial connection preparation now overlaps introductions;
it never supplies a cast or setting. Scene generation still takes provider time.

The final preparation check confirmed the trailer stayed visible and the game
layer hidden while the connection waited for narration. Ending during a shot
build closed the peer connection. Starting again showed no stale scene/error,
then produced fresh 1344×768 video. Final production build and type checks passed.
