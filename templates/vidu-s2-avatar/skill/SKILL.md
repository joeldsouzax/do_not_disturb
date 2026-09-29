---
name: building-vidu-s2-avatar-frontends
description: Extend this cloned Vidu S2-Avatar example app — add controls, characters, or call features with the typed @reactor-models/vidu-s2-avatar SDK without breaking the patterns the existing code uses. Covers the model surface in app/lib/model.ts, the avatar-then-call lifecycle driven by session_state, which commands answer and which answer only on the tracks, the explicit-null rule, declaring every track, publishing the microphone and camera, reference images, idle billing, and the auth route.
---

# Building on this Vidu S2-Avatar app

You've cloned this folder and now you want to extend it. This guide explains
the patterns the existing code uses and the rules to follow so your additions
feel native instead of bolted on. All the code referenced below already exists
in this folder.

## What Vidu S2-Avatar is, in three sentences

It turns one photo of a person into a character you can hold a live call with:
you give it a persona and a voice, it hears your microphone (and, in video
mode, sees your camera), and it answers with lip-synced video on `main_video`
and its voice on `main_audio`. A session holds one bound character and at most
one call, and a call that ends keeps the character, so calling again is one
`start_call`. The frontend's job reduces to mirroring one `session_state`
snapshot, publishing your media, and sending a handful of commands.

## The model surface lives in one file

Every component imports the model from [`app/lib/model.ts`](../app/lib/model.ts)
and nowhere else. That file re-exports the published
`@reactor-models/vidu-s2-avatar` 0.4.0 package. Its generated model surface
provides:

| Export | What it is |
| --- | --- |
| `ViduS2AvatarProvider` | `ReactorProvider` with `modelName` and `modelTracks` bound. |
| `useViduS2Avatar()` | Store fields (`status`, `lastError`, `connect`, `disconnect`, `sendCommand`, `uploadFile`, `publish`, `unpublish`, `pauseTrack`, `resumeTrack`, `requestClip`) plus `createAvatar`, `attachAvatar`, `listVoices`, `cloneVoice`, `startCall`, `say`, `interrupt`, `updateCall`, `setReferenceImages`, `clearReferenceImages`, `endCall`, `getState`. |
| `useViduS2AvatarSessionState`, `…Transcript`, `…CommandError`, `…Message` | One hook per message. |
| `ViduS2AvatarMainVideoView` | `<ReactorView track="main_video">`. |
| `ViduS2Avatar…Message`, `ViduS2Avatar…Params` | The schema's types. |

Two behaviours in the generated package are load-bearing:

- **Messages are flattened.** The base SDK delivers `{ type, data }`. Typed
  hooks and replies hand back `{ type, ...data }`, so a field is at
  `msg.phase`, not `msg.data.phase`.
- **All four tracks are declared, `webcam` included.** An audio call never
  publishes `webcam`, but the session is refused on connect when the
  client's declared tracks and the model's differ.

The package exports `MODEL_NAME` (`reactor/vidu-s2-avatar`) and
`MODEL_VERSION` (`v0.4.0`). Keep the model name in the server token route in
sync. If the model gains a command or message, update the typed package
dependency after its schema is published; do not hand-write another generic
`sendCommand` wrapper in this app.

## The four concepts you'll touch

| Concept | In this model | API |
| --- | --- | --- |
| Connection | One session per visit: one character, one call at a time | `useViduS2Avatar().status`, `connect()`, `disconnect()` |
| Commands | `create_avatar`, `attach_avatar`, `list_voices`, `start_call`, `say`, `interrupt`, `update_call`, `set_reference_images`, `clear_reference_images`, `end_call`, `get_state`, `clone_voice` | The typed methods on `useViduS2Avatar()` |
| Messages | `session_state` (the snapshot), `transcript`, `command_error`, plus the replies below | `useViduS2AvatarSessionState` and friends |
| Tracks | In: `mic`, `webcam`. Out: `main_video`, `main_audio` | `publish("mic", track)`, `<ViduS2AvatarMainVideoView audioTrack="main_audio">` |

## The UI phase model

`session_state.phase` is one of nine values, and the app narrows the string
with `phaseOf()` in [`app/lib/call.ts`](../app/lib/call.ts). Anything else
becomes `unknown`, which the predicates treat as an active call: the app never
sends a second `start_call` into a call it cannot see, never drops the
microphone, and keeps End call and Disconnect on screen.

```
connect → idle
idle ── create_avatar / attach_avatar ──▶ preparing_avatar ──▶ avatar_ready
avatar_ready | ended | failed ── start_call ──▶ starting ──▶ warming_up ──▶ live
live ── end_call, or the call ends itself ──▶ ending ──▶ ended
starting | warming_up | live ── failure ──▶ failed
```

| UI phase | Backing model phase | Visible | Hidden |
| --- | --- | --- | --- |
| Setup | no snapshot, `idle`, `preparing_avatar`, `avatar_ready`, `ended`, `failed` | `CharacterPicker`, `CallSetup` | `CallControls`, `References` |
| Call | `starting`, `warming_up`, `live`, `ending` (`callActive`) | `CallControls`; `References` once `live` | `CharacterPicker`, `CallSetup` |

Three predicates cover almost every decision:

- `callStartable(phase)`: `avatar_ready`, `ended` or `failed`. The only phases
  `start_call` is accepted from.
- `callActive(phase)`: a call exists. The setup locks.
- `callLive(snapshot)`: `phase === "live"` **and** `control_ready`. `say`,
  `interrupt`, `update_call` and the reference images need both.

## Adding new controls

1. Decide the phase first. A control that edits the next call goes in setup
   and returns `null` when `callActive(phase)`. A control that steers the
   running call returns `null` unless `callActive(phase)`, and disables
   itself until `callLive(snapshot)`.
2. Read the snapshot through `useSession()`, never from your own subscription
   to `session_state`.
3. Add the action to [`app/lib/session.tsx`](../app/lib/session.tsx) if it
   touches the call flow; call the typed method directly if it does not.
4. Drop the component into the column that matches its phase in
   [`app/ViduApp.tsx`](../app/ViduApp.tsx).

## What's intentionally not exposed

| Knob | Typed method | Phase | Note |
| --- | --- | --- | --- |
| Reuse a character across visits | `attachAvatar({ avatar_id })` | Setup | Characters are kept 90 days. The app already reattaches within a visit (`boundRef` in `session.tsx`); persist that map to `localStorage` to reuse across visits. A stale id refuses with `AVATAR_NOT_FOUND`, which the app already handles by rebuilding. |
| Change the persona mid-call | `updateCall({ persona })` | Call | Lands after the current sentence. The reply's `applied` lists what changed. |
| Turn-taking | `startCall({ vad })`, `updateCall({ vad })` | Both | `type: "server"` (default; filters background noise, `threshold` 0–1, `silence_duration_ms` 200–6000) or `"semantic"` (interrupts as soon as you speak). Applies on the next turn. |
| Reply tuning | `startCall({ llm })`, `updateCall({ llm })` | Both | `temperature`, `top_p`, `top_k`, `max_tokens` (default 50), penalties, `seed`. Raise `max_tokens` carefully: every token is spoken. |
| Language | `startCall({ language })` | Setup | e.g. `"English"`, up to 40 characters. Defaults to English. |
| Expand a short persona | `startCall({ persona_enhance: true })` | Setup | Expands a one-liner before the call starts. |
| Clone a voice | `cloneVoice({ audio_url, name })` | Any | In the schema, so the typed package generates it, but absent from the public model reference: cloning is off, and the command refuses with `CLONING_DISABLED`. A 10–20 s public sample once it is on. |
| Save the character's id | read `snapshot.avatar_id` | Setup | Show it, or store it per user. |

## Auth — a no-store route and a memoized resolver

[`app/api/reactor/token/route.ts`](../app/api/reactor/token/route.ts) and the
resolver in [`app/ViduApp.tsx`](../app/ViduApp.tsx) are the same shape as every
other template. Keep all four rules:

1. **The route returns `{ jwt, expires_at }`.** The client memoizes for exactly
   the token's lifetime and never decodes the JWT to find it.
2. **`Cache-Control: private, no-store`.** The browser's HTTP cache must never
   hold the token.
3. **`authorization_details` scopes the token to this model**, with a bounded
   `max_sessions`. Never mint an unscoped token for a browser: that hands out
   the API key's full access.
4. **The scope names `reactor/vidu-s2-avatar`**, the exact name the provider
   connects with. A mismatch mints fine and 403s on `connect()`.

The resolver memoizes in module scope and re-mints only near expiry. That is
not an optimization: a session can only be operated by the token that created
it, and the SDK calls the resolver again for later hops (the portrait upload,
clip downloads, renegotiation). A resolver that refetched each time would hand
those hops a token with no session bound, and they 403.

## The state snapshot pattern

`session_state` arrives on connect and whenever anything in it changes. During
a call that is about once a second, because `call_elapsed_seconds` ticks. It
is the whole truth: phase, the bound character, the voice, what is reaching
the character, what is arriving, the time left, the reference images, why the
last call ended.

The snapshot is held once, in `SessionProvider`, because the flow itself reads
it (a call can only start from `callStartable` phases). It is cleared the
moment the session is not `ready`:

```tsx
useEffect(() => {
  if (status !== "ready") setSnapshot(null);
}, [status]);
```

That effect is mandatory. The SDK sends no final snapshot on disconnect, so
without it the UI keeps showing a live call that ended when the tab lost its
connection. Components get the snapshot from `useSession()` and inherit the
clearing for free.

Do not rebuild state from other messages. `call_ended` tells the caller how a
call it ended went; every other client in the session only sees the snapshot
move to `ended` with an `end_reason`.

## Sending commands

Every command goes through a typed method, and every one resolves; none
rejects. What it resolves with depends on the command:

| Command | Resolves with | Where the effect shows up |
| --- | --- | --- |
| `listVoices()` | `voices`: `{ system, cloned, default_voice }` | The reply itself. Read it off the await. |
| `updateCall(...)` | `call_updated`: `{ applied }` | The reply, then the snapshot's `voice`. |
| `setReferenceImages(...)`, `clearReferenceImages(...)` | `reference_images_applied`: `{ image_ids }` | The reply, then the snapshot's `reference_images`. |
| `endCall()` | `call_ended`: `{ end_reason, duration_seconds }` | The reply, then the snapshot moves to `ended`. |
| `getState()` | `session_state` | The reply. |
| `cloneVoice(...)` | `voice_cloned`: `{ voice }` | The reply. |
| `createAvatar`, `attachAvatar`, `startCall` | `undefined` once the handler ran | The snapshot's `phase`. |
| `say`, `interrupt` | `undefined` | The tracks, and `transcript`. |

**A command's result belongs on the awaited call, not on a subscription.** A
reply is addressed to the connection that asked. A listener on `voices` fires
for any `list_voices` on this connection and never on a second client, so the
app reads the catalog off `await listVoices()`.

The picker still offers every system voice returned by that call. It puts the
voices used by the example characters first and uses `voiceLabel()` to avoid
repeating the same language on every option. The option value is always the
unmodified API voice name passed to `startCall` or `updateCall`.

The example roster lives in [`app/lib/characters.ts`](../app/lib/characters.ts).
Its portraits are bundled under `public/characters/`; choosing one uploads the
local image as a file reference for `createAvatar`. Each preset also supplies a
short spoken greeting, a persona, and a voice hint matched against the live
catalog. When changing a preset, keep the greeting under the model's 200
character limit and make it something the character can say aloud.

**A refusal resolves `undefined` and broadcasts `command_error`.** A
`try/catch` never sees it. [`CommandError`](../app/components/CommandError.tsx)
renders it. Branch on `code` (stable), read `origin` for whose fault it was
(`request`, `state`, `upstream`, `platform`), honour `retryable`, and quote
`trace_id` in bug reports. The snapshot also keeps the latest one as
`last_error` until the next call starts.

### Omit fields; never send null

The schema types optional fields as `| null`, but **a payload that carries an
explicit `null` is dropped whole, silently**. Send `{ persona }`, not
`{ persona, voice: null }`. [`startCallParams()`](../app/lib/call.ts) spreads
optional fields in only when they have a value; copy that shape for any
payload you add.

### Wait for the first snapshot after connecting

`session_state` is sent on connect. `prepare()` in `session.tsx` parks a
resolver **before** calling `connect()` and waits for that first snapshot
before sending anything, so the first command is never sent before the model
is listening.

## Media: microphone and camera

The microphone is published **before** `start_call`, so the first thing you say
reaches the character. `openMedia()` in `session.tsx`:

- Asks for one mono channel with echo cancellation, noise suppression and gain
  control (`MIC_CONSTRAINTS`).
- In video mode, asks for the camera too and publishes it as `webcam`. A
  blocked camera falls back to an audio call instead of failing the call.
- A blocked microphone is not fatal. The call starts anyway and typed `say`
  still reaches the character.

Mute sets `track.enabled = false`, which stops sending sound without
renegotiating. Media is released when a call goes from active to over, when
`start_call` itself is refused, and on disconnect. It is not released on "no
call right now": the microphone is published while the phase is still
`avatar_ready`.

`call_mode` is fixed for the call. To switch between audio and video, end the
call and start another.

## Reference images

A reference image is an object for the character to hold, an outfit to wear,
or a background, and it renders within a few seconds without interrupting
speech. Rules:

- `app/lib/references.ts` supplies the example gallery. Its thumbnails live
  under `public/references/`, while command payloads use public Reactor CDN
  URLs. The gallery allows one active image per kind; choosing another clears
  the previous image in that kind before applying the new one. The URL field
  remains available under "Use your own public image URL".
- URL-only, fetched by the generation service. The URL must be public: a file
  under `public/` works once deployed, never from `localhost`.
- One to three per call to `setReferenceImages`. `image_id` is yours; reusing
  an id in effect replaces that image.
- `clearReferenceImages({ image_ids })` removes specific ones;
  `clearReferenceImages({})` undoes the latest change.
- What is in effect is the snapshot's `reference_images`. Render that, not your
  own list.
- An unreachable URL refuses with `PROMPT_OP_IMAGE_TRANSFER_FAILED`.

## Receiving messages

| Hook | Use it for |
| --- | --- |
| `useViduS2AvatarSessionState` | The snapshot. Held once, in `SessionProvider`. |
| `useViduS2AvatarCommandError` | Every refusal. Always render it somewhere visible. |
| `useViduS2AvatarTranscript` | Finished sentences from both sides, while `transcripts` is on (the app turns it on). Keep `final` lines only. A typed `say` is shown immediately and its echo is dropped. |
| `useViduS2AvatarMessage` | Everything, discriminated on `type`. Useful for a debug log. |

## When a call ends on its own

The snapshot moves to `ended` with an `end_reason`, and anything other than
`ended_by_client` also leaves a `last_error`:

| `end_reason` | What to tell the person |
| --- | --- |
| `max_duration` | It hit `call_max_seconds`, which the snapshot reports once the call starts. Offer to call again. |
| `idle_timeout` | Nobody said anything for too long. |
| `content_policy` | Moderated. Show `last_error.reason`. |
| `upstream_quota` | Not their fault. Report it. |
| `upstream_interrupted`, `media_lost` | Start the call again. |
| `bridge_failed` | Our side. Start again; report the trace id if it repeats. |

`endReasonLine()` in `call.ts` holds the copy. Above capacity, `start_call`
refuses with `UPSTREAM_CAPACITY` (`retryable: true`).

## Idle billing

A connected session bills whether or not a call is running. The app connects
only when a character is picked, shows a Disconnect button while connected,
and disconnects on its own after two minutes with no call (`IDLE_DISCONNECT_MS`
in `session.tsx`). Keep some version of that in your product.

## The stage

`main_video` and `main_audio` exist from connect but carry nothing until a call
is `live`; the first frame lands about two seconds after that. The SDK
subscribes to both on connect (`autoResumeTracks` defaults to true), but a live
call has been seen to stay black and silent until both are resumed again, so
`session.tsx` calls `resumeTrack` on each when the phase turns `live` and logs a
failure instead of hiding it. The stage keeps
the chosen portrait up until `video_receiving` flips, and mounts the video view
for the whole session so the audio is attached before the character first
speaks. The live frame is letterboxed (`object-fit: contain`), never cropped:
cropping cuts off the face being animated. The still example portrait uses
`object-fit: cover` to fill the stage. When `last_frame_age_ms` passes a
few seconds during a live call, the stage says the video paused.

## Brand alignment

`@reactor-team/ui` is imported for its CSS only (fonts and colour variables),
re-exposed as Tailwind utilities in `app/globals.css`: `bg-brand`,
`text-brand-fg`, `bg-active`, `font-mono`. Do not import its React components
into a Server Component: they use hooks, and the failure is at runtime, not
build time.

The header uses the supplied Reactor lockup and symbol from `public/brand/`.
Keep those files inside the template so a scaffolded copy retains its branding.

## Capturing clips

[`SnapClip`](../app/components/SnapClip.tsx) is the one place that imports
recording from `@reactor-team/js-sdk` directly: recording is the same for
every model, and the typed packages do not re-export it.

- It returns `null` unless `status === "ready"`.
- It calls `requestClip(seconds)` from the store and catches `RecordingError`
  (`DISCONNECTED`, `RECORDER_DISABLED`, `INVALID_DURATION`, `REQUEST_TIMEOUT`).
- The modal renders `<ClipPlayer>` and `<ClipDownloadButton>`, which inherit
  the token resolver from the provider. The SDK's components keep working on
  a `Clip` value after a disconnect, but `SnapClip` itself returns `null` off
  `ready`, so the panel and its modal unmount with the session. Hoist the
  clip into state above `SnapClip` if a download must survive hanging up.
- `hls.js` is a direct dependency so the preview plays on Chromium and
  Firefox; Safari plays HLS natively.
- `requestRecording()` returns the whole session instead; `useClipDownload` is
  the headless hook for a custom UI.

Clip URLs are short-lived, so a clip is not a shareable link.

## Common mistakes when extending

1. **Sending `null` for an optional field.** The whole command is dropped.
   Omit the field.
2. **Declaring only the tracks you use.** Drop `webcam` from the list and the
   session is refused on connect.
3. **Subscribing to a reply.** Read `voices`, `call_updated`,
   `reference_images_applied` and `call_ended` off the awaited call.
4. **Clearing an error on every snapshot.** Snapshots tick every second during
   a call. `CommandError` clears when a new attempt begins.
5. **Releasing the microphone because no call is running.** It is published
   before `start_call`, while the phase is still `avatar_ready`.
6. **Gating a call control on `phase === "live"` alone.** Also require
   `control_ready`.
7. **Pointing a reference image at `localhost`.** The generation service
   fetches it.
8. **Importing `@reactor-team/js-sdk` in a component.** Import from
   `app/lib/model.ts`. Recording is the one exception; see
   [Capturing clips](#capturing-clips).
9. **Holding a second copy of the snapshot.** Read it from `useSession()`,
   which clears it on disconnect.
10. **Leaving a session connected.** It bills. Keep the idle disconnect.

## Checklist for new components

- [ ] Phase decided; early `return null` for the other phase.
- [ ] Call controls disabled until `callLive(snapshot)`.
- [ ] Payloads omit empty optional fields.
- [ ] Replies read off the await; broadcasts read from hooks.
- [ ] Refusals visible (they already are, through `CommandError`).
- [ ] Model-specific code imports through `app/lib/model.ts`; only `SnapClip`
      imports the base SDK directly for recording.
- [ ] Disconnect mid-call, reconnect: no stale call on screen.
- [ ] Unset `REACTOR_API_KEY`: the setup landing renders, not a 500.
