---
name: building-vidu-s2-editing-frontends
description: Extend this cloned Vidu S2-Editing example app — add scenarios, references, sources, or edit controls using the typed @reactor-models/vidu-s2-editing package without breaking the existing patterns. Covers the model surface in app/lib/model.ts, publishing the camera before start_edit, the edit lifecycle driven by session_state, the four scenarios, switch_reference and its late refusal, the explicit-null rule, idle billing, and the auth route.
---

# Building on this Vidu S2-Editing app

You've cloned this folder and now you want to extend it. This guide explains
the patterns the existing code uses and the rules to follow so your additions
feel native instead of bolted on. All the code referenced below already exists
in this folder.

## What Vidu S2-Editing is, in three sentences

It edits a live video you send it, guided by one reference image: the image
is a character that replaces you, a garment you wear, a style for the whole
scene, or a place behind you. You publish your video as the `camera` track,
send `start_edit` with the image and the scenario, and the edited video comes
back on `main_video`; `switch_reference` changes the image or the scenario
while it runs. The frontend's job reduces to publishing a source, mirroring
one `session_state` snapshot, and sending three commands.

## The model surface lives in one file

Every component imports the model from [`app/lib/model.ts`](../app/lib/model.ts)
and nowhere else. That file re-exports the published
`@reactor-models/vidu-s2-editing` package, generated from the model's schema.
The exports used by this app are:

| Export | What it is |
| --- | --- |
| `ViduS2EditingProvider` | `ReactorProvider` with `modelName` and `modelTracks` bound. |
| `useViduS2Editing()` | Store fields (`status`, `lastError`, `connect`, `disconnect`, `uploadFile`, `publish`, `unpublish`, `resumeTrack`) plus `startEdit`, `switchReference`, `endEdit`, `getState`. |
| `useViduS2EditingSessionState`, `…CommandError`, `…Message` | One hook per message. |
| `ViduS2EditingMainVideoView` | `<ReactorView track="main_video">`. |
| `ViduS2Editing…Message`, `ViduS2Editing…Params` | The schema's types. |

The package also exposes generic SDK helpers such as `requestClip` and
`downloadClipAsFile`; this app leaves recording out of its UI.

Two behaviours in the typed package are load-bearing:

- **Messages are flattened.** The generic SDK delivers `{ type, data }`; the
  model hooks and awaited replies hand back `{ type, ...data }`, so read
  `message.phase`, not `message.data.phase`.
- **Both tracks are declared.** The session is refused on connect when the
  client's declared tracks and the model's differ.

App-level names the package does not generate, such as the `EditingType`
alias and the scenario list, live in [`app/lib/edit.ts`](../app/lib/edit.ts).
The app pins typed package version `0.2.1`. When updating it, confirm its
`MODEL_NAME` still matches the token route's `reactor/vidu-s2-editing`, the
track declarations still include `camera` and `main_video`, and its command
replies still match the flow below. Update the exact-version pnpm release-age
exception in `pnpm-workspace.yaml` only when a newly reviewed release needs it.

## The four concepts you'll touch

| Concept | In this model | API |
| --- | --- | --- |
| Connection | Stop closes the current session; Start opens a new one | `status`, `connect()`, `disconnect()` |
| Commands | `start_edit`, `switch_reference`, `end_edit`, `get_state` | The typed methods on `useViduS2Editing()` |
| Messages | `session_state` (the snapshot), `command_error`, plus the replies below | `useViduS2EditingSessionState`, `useViduS2EditingCommandError` |
| Tracks | In: `camera`. Out: `main_video` (no audio) | `publish("camera", track)`, `<ViduS2EditingMainVideoView>` |

## The UI phase model

```
connect → idle
idle | ended | failed ── start_edit ──▶ starting ──▶ warming_up ──▶ live
live ── switch_reference ──▶ live (new reference, same edit)
live ── end_edit, or the edit ends itself ──▶ ending ──▶ ended
starting | warming_up ── failure ──▶ failed
```

| UI phase | Backing model phase | What changes |
| --- | --- | --- |
| Setup | no snapshot, `idle`, `ended`, `failed` | Source can change; a reference pick sets what `start_edit` sends; **Start editing** |
| Edit | `starting`, `warming_up`, `live`, `ending` (`editActive`) | Source locked; a reference pick is a `switch_reference` once `live`; **Stop editing** ends the edit and disconnects |

The predicates in `edit.ts`: `editStartable(phase)`, `editActive(phase)`,
and `editLive(snapshot)` (`live` **and** `control_ready`, which
`switch_reference` needs).

Two snapshot fields matter more than `phase`: nothing is edited until
`camera_forwarding` is true, and the first edited frame follows a few seconds
after that, when `video_receiving` flips. Drive "is it working?" from those,
not from `phase === "live"`.

## Publish the source before `start_edit`

The editor reads `camera` from the moment the edit starts. `startEdit()` in
[`session.tsx`](../app/lib/session.tsx) gets the input track, connects if
needed, **publishes it**, uploads the reference, and only then sends
`start_edit`. It sets `contentHint = "detail"` so the browser holds resolution
and lets the frame rate give instead.

Two sources are wired:

- **Camera**, from `getUserMedia`. A blocked camera falls back to the sample clip
  with a notice.
- **Sample clip**, a CDN video played into the source `<video>` and captured
  with `captureStream()`. That element loads with `crossOrigin="anonymous"`;
  without it the captured track is blank. Any clip you swap in must be served
  with CORS.

The source is fixed for the edit: `publish` is not re-sent mid-edit. To change
it, stop, change, start. The source is unpublished when an edit goes from
active to over, when `start_edit` is refused, and on disconnect.

## Sending commands

| Command | Resolves with | Where the effect shows up |
| --- | --- | --- |
| `startEdit({ editing_type, reference_image })` | `undefined` once the handler ran | The snapshot's `phase`, then `camera_forwarding`, then `video_receiving`. |
| `switchReference({ editing_type?, reference_image? })` | `reference_switched`: `{ editing_type, reference_changed }` | The picture, within a few seconds. |
| `endEdit()` | `edit_ended`: `{ end_reason, duration_seconds }` | The reply, then the snapshot moves to `ended`. |
| `getState()` | `session_state` | The reply. |

**A command's result belongs on the awaited call.** `reference_switched` and
`edit_ended` are addressed to the connection that asked; read them off the
await.

**A refusal resolves `undefined` and broadcasts `command_error`.**
[`CommandError`](../app/components/CommandError.tsx) renders it. Branch on
`code`, read `origin` (`request`, `state`, `upstream`, `platform`), honour
`retryable`, and quote `trace_id`. `INVALID_INPUT` covers a missing, doubled,
non-image, over-10-MB, or non-http(s) reference.

### `switch_reference` is refused late

This is the one to get right. The reply means the switch was *sent*, not that
it worked. If the editor cannot apply it, a `command_error` for
`switch_reference` arrives **about 4 seconds later** (`SWITCH_PROMPT_*`,
`RENDER_*`, `LIVE_NOT_ACTIVE`), the previous reference and scenario stay in
effect, and the edit keeps running.

So `switchTo()` treats a switch as provisional: it shows the new look as
"Applying" for `SWITCH_SETTLE_MS`, and a `switch_reference` error inside that
window restores the previous look. **Do not resend on silence**: each call
switches exactly once.

### Omit fields; never send null

`referenceParams()` in `edit.ts` builds the payload with exactly one image
field and no nulls. Give `reference_image` (an upload) **or**
`reference_image_url`, never both. For a switch, omit what should stay: omit
the image to change only the scenario, omit `editing_type` to change only the
image.

### Uploads versus URLs

The app uploads every reference, library images included (fetched from
`public/references/` in the browser, then `uploadFile`), and caches the upload per image for the session,
so switching back to an image is instant. The cache is cleared on disconnect,
because an upload belongs to a session. `reference_image_url` is the
alternative when the image is already public: the editor fetches it when the
edit starts, and nothing is uploaded.

## The four scenarios

| `editing_type` | The image is | Pick images that… |
| --- | --- | --- |
| `subject_replacement` | a character that replaces you | show one full character, clearly lit, facing forward |
| `virtual_tryon` | a garment you wear | show the garment alone, on a plain background |
| `style_transfer` (default) | the look of the whole scene | have a strong, consistent style across the frame |
| `background_replacement` | the place behind you | are wide scenes with no person in them |

`session_state.editing_type` is the scenario in effect. The library in
[`library.ts`](../app/lib/library.ts) lists the images shown for each scenario;
add yours the same way. The bundled style references are square 768×768
images; backgrounds are wide scenes.

## What's intentionally not exposed

| Knob | How | Note |
| --- | --- | --- |
| Reference by URL | `startEdit({ reference_image_url })` | Skips the upload; the URL must be public. |
| Scenario-only switch | `switchReference({ editing_type })` | Keeps the image; reinterprets it. |
| Other sources | Publish any `MediaStreamTrack` as `camera` | A screen share (`getDisplayMedia`) or a canvas stream work the same way. |
| Snapshot on demand | `getState()` | The same message is broadcast on every change anyway. |

## Auth — a no-store route and a memoized resolver

[`app/api/reactor/token/route.ts`](../app/api/reactor/token/route.ts) and the
resolver in [`app/ViduApp.tsx`](../app/ViduApp.tsx) are the same shape as every
other template:

1. **The route returns `{ jwt, expires_at }`.** The client memoizes while a
   session is connected, then gets a fresh token for the next session.
2. **`Cache-Control: private, no-store`.**
3. **`authorization_details` scopes the token to this model**, with a bounded
   `max_sessions`. Never mint an unscoped token for a browser.
4. **The scope names `reactor/vidu-s2-editing`**, the exact name the provider
   connects with. A mismatch mints fine and 403s on `connect()`.

The resolver memoizes in module scope because a session can only be operated
by the token that created it, and the SDK calls the resolver again for later
hops (including reference uploads). It clears the cache only after disconnect
completes, so repeated Start/Stop cycles cannot exhaust one token's bounded
session count.

## The state snapshot pattern

`session_state` normally arrives on connect and on every change (about once a
second during an edit). If the initial broadcast is missed, `SessionProvider`
requests the same snapshot with `getState()` before starting. If neither
arrives within 15 seconds, it disconnects so an idle session does not keep
billing. The snapshot is held once in `SessionProvider` and cleared the moment
the session is not `ready`; the SDK sends no final snapshot on disconnect.
Components read it from `useSession()`.

## The edited track

`main_video` is mounted for the whole session and resumed explicitly with
`resumeTrack("main_video")` once the session is ready and again when the edit
goes live. Without that the track can stay paused: the snapshot reports video
arriving and the stage stays black. There is no audio track.

## When an edit ends on its own

The snapshot moves to `ended` with an `end_reason`: `max_duration`
(`edit_max_seconds`, shown as time left), `content_policy`, `upstream_quota`,
`upstream_interrupted`, `media_lost`, or `bridge_failed`. `endReasonLine()` in
`edit.ts` holds the copy. Above capacity, `start_edit` refuses with
`UPSTREAM_CAPACITY` (`retryable: true`).

## Idle billing

A connected session bills whether or not an edit is running. The app connects
on Start editing. Stop editing and Disconnect use the same close flow, and the
app also disconnects after two minutes with no edit (`IDLE_DISCONNECT_MS`).

## Brand alignment

`@reactor-team/ui` is imported for its CSS only, re-exposed as Tailwind
utilities in `app/globals.css`. Do not import its React components into a
Server Component.

The header uses the supplied Reactor lockup and symbol from `public/brand/`.
Keep those files inside the template so a scaffolded copy retains its branding.

## Common mistakes when extending

1. **Sending `start_edit` before publishing `camera`.** Publish first.
2. **Treating the `switch_reference` reply as success.** Wait out the late
   refusal before you commit the new look.
3. **Resending a switch because nothing happened yet.** It switches once; the
   picture takes a few seconds.
4. **Sending both `reference_image` and `reference_image_url`,** or a null for
   either. `INVALID_INPUT`, or the command is dropped.
5. **Gating "working" on `phase === "live"`.** Use `camera_forwarding` and
   `video_receiving`.
6. **Streaming the sample video without `crossOrigin="anonymous"`.** Its captured track is blank.
7. **Reusing an upload after reconnecting.** Uploads belong to a session.
8. **Mirroring the camera preview.** The editor gets unmirrored frames, and the
   panes would disagree.
9. **Importing `@reactor-team/js-sdk` in a component.** Import the model
   surface from `app/lib/model.ts` instead.
10. **Leaving a session connected.** It bills.

## Checklist for new components

- [ ] Phase decided: setup controls lock while `editActive(phase)`.
- [ ] Live controls wait for `editLive(snapshot)`.
- [ ] Payloads omit empty fields and carry one image field.
- [ ] Replies read off the await; broadcasts read from hooks.
- [ ] Model-specific code imports from `app/lib/model.ts`.
- [ ] Disconnect mid-edit, reconnect: no stale edit on screen.
- [ ] Unset `REACTOR_API_KEY`: the setup landing renders, not a 500.
