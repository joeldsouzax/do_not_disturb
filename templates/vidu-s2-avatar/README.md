# Vidu S2-Avatar

Turn one photo into a character you can call. Pick one of ten example
characters or upload a photo of one person, give it a persona and a voice,
and start a call: it hears you through your microphone, answers with its own
voice and lip-synced video, and in video mode sees you through your camera.
Built on [Reactor](https://reactor.inc) and Vidu S2-Avatar.

```
┌──────────────────────┬──────────────────────────────────────────┐
│ Character            │ ● Connected · Live.          [Disconnect]│
│ [Guard][Baker][DJ][…]│ ┌──────────────────────────────────────┐ │
│ [Upload a photo]     │ │                                      │ │
├──────────────────────┤ │          the character, live         │ │
│ Call  (before)       │ │                               [you]  │ │
│  persona · greeting  │ └──────────────────────────────────────┘ │
│  voice · audio/video │ Transcript                               │
│  [Start call]        │  You  What is fresh today?               │
│ Call  (during)       │  Baker  The first batch just came out…   │
│  say · interrupt     │                                          │
│  mute · voice · end  │ Capture  [Snap last 10s]                 │
│ Reference images     │                                          │
└──────────────────────┴──────────────────────────────────────────┘
```

## Quick start

```bash
cp .env.example .env.local
# add REACTOR_API_KEY=rk_... from https://www.reactor.inc/account/api-keys
pnpm install
pnpm dev
```

Open http://localhost:3000, allow the microphone, and pick a character.

## What you can do with it

- **Make a character from a photo.** Picking one connects the session and
  builds the character in a few seconds. An example also fills in its
  persona, greeting and voice.
- **Call it.** Talk into your microphone or type. It answers out loud, and
  both sides land in the transcript.
- **Let it see you.** Switch the call to video mode and your camera reaches
  the character too.
- **Steer it live.** Interrupt it mid-sentence, change its voice without
  restarting the call, or choose an object, outfit, or background from the
  example gallery. A public image URL works too.
- **Call again.** An ended call keeps the character, so the next call is one
  click.
- **Snap a clip.** A "Capture" panel under the transcript grabs the last 10
  seconds of the stream, opens a preview, and offers an MP4 download.

## Architecture at a glance

The model reports one `session_state` snapshot, and the UI is two phases of
it. **Setup** (`idle`, `preparing_avatar`, `avatar_ready`, `ended`, `failed`)
shows the character picker and the call form. **Call** (`starting`,
`warming_up`, `live`, `ending`) shows the call controls and reference images.
Each component decides for itself whether it shows. The session connects when
you pick a character and disconnects after two quiet minutes, because a
connected session bills whether or not a call is running.

## Code tour

| File | What it does |
| --- | --- |
| [`app/lib/model.ts`](app/lib/model.ts) | Re-exports the published `@reactor-models/vidu-s2-avatar` provider, typed commands, message hooks, track definitions and types. |
| [`app/lib/session.tsx`](app/lib/session.tsx) | The call flow: connect, voices, bind the character, publish the microphone and camera, start, talk, end. Holds the snapshot and clears it on disconnect. |
| [`app/lib/call.ts`](app/lib/call.ts) | Phases, the `start_call` payload (no explicit nulls), limits, voices, end reasons. |
| [`app/lib/characters.ts`](app/lib/characters.ts) | The ten example characters: portrait, persona, greeting, voice hint. |
| [`app/components/Header.tsx`](app/components/Header.tsx) | Product title and the supplied Reactor logo, with the SVG symbol on small screens. The assets live in `public/brand/` so the scaffold keeps them. |
| [`app/components/CharacterPicker.tsx`](app/components/CharacterPicker.tsx) | Setup: examples and upload. |
| [`app/components/CallSetup.tsx`](app/components/CallSetup.tsx) | Setup: persona, greeting, voice, audio or video, Start call. |
| [`app/components/CallControls.tsx`](app/components/CallControls.tsx) | Call: say, interrupt, mute, change voice, time left, End call. |
| [`app/components/VoiceOptions.tsx`](app/components/VoiceOptions.tsx) | Both voice pickers: example character voices first, then the rest of the live catalog. Option values remain the API voice names. |
| [`app/lib/references.ts`](app/lib/references.ts) | Example objects, outfits, and backgrounds: local thumbnails and public URLs for the generation service. |
| [`app/components/References.tsx`](app/components/References.tsx) | Call: choose, replace, and remove reference images, or use a public URL. |
| [`app/components/Stage.tsx`](app/components/Stage.tsx) | The character's video and voice, the portrait until frames arrive, stall and warm-up captions, your camera. |
| [`app/components/Transcript.tsx`](app/components/Transcript.tsx) | Both sides of the conversation. |
| [`app/components/CommandError.tsx`](app/components/CommandError.tsx) | Every refused command, with its code, whose fault it was, and a trace id. |
| [`app/components/SnapClip.tsx`](app/components/SnapClip.tsx) | Model-agnostic. Captures the last N seconds via `requestClip(...)` and previews them with the SDK's `<ClipPlayer>` and `<ClipDownloadButton>`. |
| [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts) | Mints a short-lived JWT scoped to `reactor/vidu-s2-avatar`, `no-store`. The API key never reaches the browser. |

## Going further

[`skill/SKILL.md`](skill/SKILL.md) is the guide for extending this app: the
lifecycle, which commands answer, how refusals arrive, the null rule, and the
knobs this app does not expose yet (`attach_avatar` across visits,
`update_call` for persona and turn-taking, reply tuning, voice cloning).

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 ·
`@reactor-models/vidu-s2-avatar` 0.4.0 (the model surface) ·
`@reactor-team/js-sdk` (model-agnostic recording primitives) ·
`@reactor-team/ui` (design tokens only) · `hls.js` (clip preview on Chromium
and Firefox).
