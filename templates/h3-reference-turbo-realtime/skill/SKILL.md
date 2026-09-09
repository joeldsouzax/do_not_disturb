---
name: h3-reference-turbo-realtime
description: Extend the H3 Reference Turbo Realtime starter — a queue-and-player app where every clip is conditioned on one to nine reference images. Covers the reference contract, the queue contract, continuous generation and steering, continuation between clips, the typed SDK, and the auth shape.
---

# Extending H3 Reference Turbo Realtime

You have cloned a working app: pick a mode, bring references, say what happens,
and keep the scene going shot by shot. This is what you need to know before
changing it.

## How the app is put together

Three modes live in `app/lib/shot.ts`: `one-subject`, `two-subjects`, and
`free`. A mode is a **slot layout** plus a prompt strategy. The two guided
modes collect a description per reference and assemble the six-section prompt
in `buildPrompt`; free mode sends the text exactly as typed. Adding a mode
means adding a slot layout and, if it needs one, a branch in `buildPrompt` —
not a new component tree.

`app/lib/session.tsx` owns the state the two halves share. The composer writes
the draft; the stage and the continuation box read it. It also holds the
uploaded `FileRef` per slot, which is what lets a follow-on shot reuse the same
references without uploading the same bytes twice — uploads are session scoped,
so they stay valid for the whole session.

### Continuous generation, and why a steer jumps the queue

The session keeps `TARGET_PENDING` clips in flight, topping up off
`state_update` — which fires on every queue change, so it is the natural clock.
Each top-up draws the next beat from `CONTINUATION_BEATS` and chains it from
the last generated clip.

That deep queue is exactly what would stop a user's direction from landing, so
`steer` pops the automatic clips before enqueueing at `position: 0`. Automatic
clips are identifiable because they carry `metadata: {"auto":true}`, which the
model echoes back on every clip message — the queue itself tells you which
clips were nobody's idea. Do not swap that tag for client-side bookkeeping; the
echo is what survives a reconnect.

The `inFlight` ref is load-bearing rather than defensive. `state_update` fires
again before an `enqueue` is accepted, so without it the top-up re-enters and
floods the generation queue until the model starts refusing.

Three more behaviours are deliberate and worth keeping:

- **Autoplay is turned on at connect**, before the first enqueue. A queued clip
  that needs a button press to appear reads as a broken app.
- **Uploads are sequential**, not `Promise.all`. Slot order is what binds
  `Picture N`.
- **The prompt is rebuilt, not patched, on continuation.** `continueShot`
  swaps only the action and re-renders the whole prompt, so the subject
  definitions and the look are restated. Each clip is prompted on its own, so
  omitting them is what makes a seam obvious.

## Which H3 template am I in?

Three templates run on H3-family models. They are not interchangeable.

| Template                    | Model                                            | Shape                                                                     |
| --------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- |
| `h3-reference-turbo-realtime` (this one) | `reactor/h3-reference-to-video-turbo-realtime`   | One browser drives its own session. Every clip needs reference images.    |
| `h3-livestream`             | `reactor/h3-reference-to-video-turbo-realtime`   | A Python streamer holds the session; many viewers watch over LiveKit.     |
| `fast-h3`                   | `reactor/fast-h3`                                | A **different model**. Text, `starting_frame`, or `ending_frame`. No references. |

`fast-h3` is still served and is not a fallback for this model. The commands
look nearly identical, which is exactly why porting code between them without
reading the schema goes wrong.

## The model in three sentences

Each `enqueue` pairs a prompt with one to nine reference images and returns a
clip id. The clip builds in the background, and `clip_generated` announces
when it has moved to the ready queue. Playback is a separate step: `play` a
ready clip, or turn on autoplay and let ready clips start whenever the output
is idle.

## The four concepts

| Concept    | API                                                                          |
| ---------- | ---------------------------------------------------------------------------- |
| Connection | `useH3().status / connect / disconnect`                                      |
| Commands   | `enqueue`, `play`, `stop`, `pop`, `move`, `reset`, `set*`, `get*`             |
| Messages   | `state_update`, `queue_update`, `clip_*` lifecycle, `command_error`          |
| Tracks     | `main_video` with synchronized `main_audio`                                  |

## The reference contract

This is the model's whole point, and the part with a real trap in it.

- **Every clip needs one to nine references.** There is no text-only path. An
  empty list, or more than nine, is refused.
- **Order is meaning.** The first image is `Picture 1` in the prompt, the
  second `Picture 2`. `ReferenceSlot` puts that badge on the thumbnail itself,
  so the binding is visible rather than explained in a paragraph nobody reads.
- **A reference is not a keyframe.** It guides subjects and appearance. It does
  not fix the first or last frame, and it is not cropped to the canvas.
- **A reference can be a place.** One image per character plus one for the
  setting is a strong set. So is a single portrait.
- **Each clip owns its references.** They are pinned at enqueue time; later
  uploads do not touch a clip that is already queued, building, or playing.

### One reference or a list

Both take a `FileRef` straight from `uploadFile`. Pass them through as they
come:

```ts
await enqueue({ prompt, reference_image: ref }); // one
await enqueue({ prompt, reference_images: refs }); // one to nine
```

Send exactly one of the two. The model refuses a request carrying both.

This needs no conversion, but it is worth knowing why, because older code
carries one. Until `@reactor-team/js-sdk` 3.0.2 the SDK only lifted uploads out
of a command's top-level values, so a `FileRef[]` was left in the JSON payload
and serialized with its camelCase fields — not the `{ upload_id }` the model
reads. Every caller hand-wrote that conversion. 3.0.2 serializes the array and
`reactor-runtime` 3.3.1 resolves it, so the `FileRef[]` the typed SDK has
always advertised is now true on the wire. If you find a `toReferenceImages`
helper in code copied from elsewhere, delete it.

**Upload order matters, so upload sequentially.** `prepare` in
`app/lib/session.tsx` loops rather than using `Promise.all`, because slot order
is what binds `Picture N`.

**Uploading needs a live session.** That is why `queueClip` connects first.
There is no Connect button anywhere in this app: a session starts when there
is work for it.

## The queue contract (what the UI mirrors)

- `enqueue` replies `clip_queued` with the clip's id, its **effective**
  duration and frame count, and its seed. Your requested `seconds` is rounded
  to a supported length, so read the reply rather than assuming.
- Two queues, both in `queue_update`: `generation` (waiting and building) and
  `playout` (ready). The playing clip is in neither.
- `queue_update.history` is **always empty**. A played clip is not listed and
  cannot be replayed. To carry a scene forward, use `continue_from_clip_id`.
- `state_update` carries the capacities. A full generation queue refuses new
  enqueues; a full ready queue pauses building until something plays.
- `valid_commands` reflects the current state, but arguments still need
  validating, and state can change before your request lands.
- **Mirror the model; do not accumulate.** The transport row in `Stage` reads
  its counts off `state_update` directly. Building your own queue out of
  `clip_*` events is where drift comes from.

## Continuation between clips

`continue_from_clip_id` continues the next clip from a **generated** clip's
ending: motion, camera, and audio carry across the boundary, while the new
clip's own references still drive appearance. An unknown or dropped id falls
back to an independent clip rather than failing.

Writing the continued clip matters as much as setting the field:

- Repeat the subject definitions. Each clip is prompted on its own.
- Restate the lighting, weather, and palette, and open the action with "the
  shot continues from…".
- **Update a subject whose state changed.** If a clip ends with a mask pushed
  up, the next clip must describe it that way, even though the reference image
  still shows it down.

`set_flush_on_clip_end` is a different thing. It chooses black or a held last
frame at a playback boundary. It does not request continuation.

## The typed SDK

Every model-specific symbol comes from
`@reactor-models/h3-reference-to-video-turbo-realtime`, generated from the
model's published schema and installed like any other dependency. Write no
wire strings by hand: a hand-built command name or field drifts from the
deployed model, which is the defect the typed packages exist to prevent.

The package version tracks the model release, so `0.3.0` here describes the
`0.3.0` release on the API. Upgrading it is how you pick up a schema change.

`app/lib/model.ts` maps its symbols to short names
(`useH3ReferenceToVideoTurboRealtimeStateUpdate` → `useH3StateUpdate`) and adds
the few constants the schema does not carry, such as the canvas dimensions.
Keep the aliases in that one file rather than renaming anything at a call site.

## Auth: the no-store route + the memoized resolver

Four rules, all load-bearing:

1. The `rk_` key stays server-side. `app/api/reactor/token/route.ts` reads it
   and mints a short-lived JWT; the browser only ever holds the JWT.
2. The token is scoped to this model through `authorization_details`. That
   scope must equal the name the provider connects with, or `connect()` 403s.
3. The route answers `Cache-Control: private, no-store`.
4. The client memoizes the token in **module scope** until shortly before
   expiry. This is not an optimization: a session may only be operated by the
   exact token that created it, and the SDK re-calls the resolver on every
   later hop. A browser cache can drop an entry without warning, and a
   refetched token has no sessions bound, so every later hop 403s.

## The state snapshot pattern

Every component that holds state does the same thing:

```tsx
const [state, setState] = useState<H3State | null>(null);
useH3StateUpdate(setState);
if (status !== "ready" && state) setState(null); // mandatory
```

The clear is not optional. The SDK sends no final snapshot on disconnect, so a
stale one leaves the UI claiming capacity and playback the session no longer
has.

## Sending commands

- **Await the reply.** A command's answer resolves the call. Do not subscribe
  to a hook to catch it — that hook fires for *any* call of that command, and
  never on a second client.
- **Commands never reject.** A refusal resolves `undefined` and broadcasts
  `command_error` with the command and reason. `try/catch` will not see it.
  `CommandError` surfaces it.
- **A resolved await means the handler finished.** `play` and `stop` answer
  with no body, and that is still a barrier — delete any sleep meant to "give
  the model time".
- `clip_failed` is different from `command_error`: the build started and then
  failed. That clip is dropped and nothing retries on its own.

## What is intentionally not exposed

| Knob                    | Command                 | Where it would go              |
| ----------------------- | ----------------------- | ------------------------------ |
| Default clip length     | `set_clip_seconds`      | Composer; per-clip `seconds` covers most cases |
| Default seed            | `set_seed`              | Composer, beside the seed field |
| Hold last frame         | `set_flush_on_clip_end` | Near the autoplay toggle       |
| Reorder or drop a queued clip | `move`, `pop`     | No queue list is rendered; autoplay means clips rarely wait |
| Clip metadata           | `enqueue.metadata`      | Echoed back on every clip message; useful for correlating your own records |

## Capturing clips

`SnapClip` records the live session and is model-agnostic — it imports
`@reactor-team/js-sdk` directly, which is idiomatic only here, because
recording is a base-SDK feature the typed clients do not re-export. Drop the
file into another template unchanged.

## Common mistakes when extending

1. Converting a `FileRef[]` to `{ upload_id }` by hand before sending it. The
   SDK does that; a manual conversion now sends the wrong shape.
2. Sending both `reference_image` and `reference_images`.
3. Uploading with `Promise.all`, which scrambles `Picture N`.
4. Uploading before connecting.
5. Assuming the requested `seconds` is what you got, instead of reading the
   reply.
6. Treating the prompt as character-bounded. It is bounded by the model's text
   budget, and going past it is not a refusal — `enqueue` accepts the clip and
   the build fails with `clip_failed`. The composer's token readout is an
   estimate for exactly this reason.
7. Forgetting the snapshot clear on disconnect in a new component.
8. Hardcoding capacities or duration bounds instead of reading `state_update`.
9. Treating `set_flush_on_clip_end` as continuation.
10. Subscribing to a hook for a command's own answer instead of awaiting it.
11. Building queue state from `clip_*` events instead of `queue_update`.

## Checklist for a change

- `pnpm build` passes (it runs `tsc --noEmit`).
- Any new state-holding component clears its snapshot when
  `status !== "ready"`.
- New commands are awaited, and refusals surface through `command_error`.
- Anything touching references still sends one to nine, in order, through the
  right path for one versus many.
- Run the app: connect, queue a multi-reference clip, play it, then disconnect
  mid-run and reconnect to confirm no stale snapshot survives.
