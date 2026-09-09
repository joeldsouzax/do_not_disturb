# H3 Reference Turbo Realtime

A reference-to-video starter. Give a clip one to nine reference images and a
prompt, queue it, and play it with synchronized audio.

Model: **`reactor/h3-reference-to-video-turbo-realtime`**. "H3 Reference Turbo
Realtime" is the display name; the long string is what you pass to the SDK.

> This is not [FastH3](https://docs.reactor.inc/model-api-reference/fast-h3).
> The two have nearly the same queue-and-player commands, but FastH3 opens a
> clip from text or a keyframe and has no reference images. Both are served.

## Quick start

```bash
cp .env.example .env.local
# add REACTOR_API_KEY=rk_... from https://www.reactor.inc/account/api-keys

pnpm install
pnpm dev
```

The key stays on the server. The page mints a short-lived, session-scoped JWT
and hands the browser only that.

## What it does

- **Build a reference set.** Up to nine images, reorderable, each labelled with
  the `Picture N` name the prompt refers to.
- **Write the scene.** A preset gets you started in the six-section shape the
  model responds well to: define the subjects and bind them to pictures, then
  the summary, the traits to preserve, the look and beats, and the sound.
- **Queue and play.** Clips build in the background; play them on demand or
  turn on autoplay. Reorder or drop anything still queued.
- **Continue a scene.** Carry motion, camera, and audio into the next clip
  while new references drive its appearance.
- **Snap a clip.** Capture the last few seconds of the session and download it.

## Code tour

| Path                            | What it holds                                                      |
| ------------------------------- | ------------------------------------------------------------------ |
| `app/page.tsx`                  | Server gate: the app, or setup instructions when no key is set.    |
| `app/H3App.tsx`                 | Provider, the memoized token resolver, and the layout.            |
| `app/api/reactor/token/route.ts`| Mints the session-scoped JWT from `REACTOR_API_KEY`.              |
| `app/lib/h3.ts`, `h3.react.tsx` | The typed client, generated from the model's schema. Do not edit.  |
| `app/lib/model.ts`              | Short names for the generated symbols, plus the reference helper.  |
| `app/lib/prompts.ts`            | Scene presets.                                                     |
| `app/components/ReferencePicker.tsx` | The ordered reference set.                                    |
| `app/components/ClipComposer.tsx`    | Connect, upload, enqueue.                                     |
| `app/components/QueuePanel.tsx`      | Both queues, mirrored from `queue_update`.                    |
| `app/components/NowPlaying.tsx`      | Playback state and transport.                                 |
| `app/components/SnapClip.tsx`        | Clip capture; model-agnostic.                                 |

## One thing that will bite you

A single reference and a list of references travel differently. One `FileRef`
passed as `reference_image` is lifted into an upload slot by the SDK. A list is
not: the SDK does not walk into arrays, so `reference_images` has to be built
as `[{ upload_id }, …]`. `toReferenceImages` in `app/lib/model.ts` does that,
and `skill/SKILL.md` explains why.

## Going further

Read [`skill/SKILL.md`](./skill/SKILL.md) before changing anything. It carries
the reference contract, the queue contract, continuation, the auth rules, and
the mistakes worth avoiding.

Docs:
[H3 Reference Turbo Realtime](https://docs.reactor.inc/model-api-reference/h3-reference-to-video-turbo-realtime/overview)
· [prompt guide](https://docs.reactor.inc/model-api-reference/h3-reference-to-video-turbo-realtime/prompt-guide)

## Stack

Next.js 15, React 19, Tailwind v4, TypeScript, `@reactor-team/js-sdk` 3.x.
