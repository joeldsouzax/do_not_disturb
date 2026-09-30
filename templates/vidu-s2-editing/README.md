# Vidu S2-Editing

Edit your live camera from one reference image. Pick a scenario and an
image, and the edited video streams back with your source inset: a character
takes your place and follows your movement, you wear the garment in the image, the
whole scene takes on the image's style, or the place behind you changes.
Switch the image or the scenario mid-edit without restarting. Built on
[Reactor](https://reactor.inc) and Vidu S2-Editing.

```
┌───────────────────────┬─────────────────────────────────────────────┐
│ Source                │ ● Connected · Live.             [Disconnect]│
│ [Camera][Sample clip] ├─────────────────────────────────────────────┤
├───────────────────────┤                 Edited video                │
│ Reference   [Upload]  │                                             │
│ [Swap][Try-on]        │                                             │
│ [Style][Background]   │                                             │
│ [🗿][🤖][🧑‍🚀][🧙]…    │ [Source inset]                              │
├───────────────────────┤                                             │
│ Edit      4:12 left   │                                             │
│ [Stop editing]        │                                             │
└───────────────────────┴─────────────────────────────────────────────┘
```

## Quick start

```bash
cp .env.example .env.local
# add REACTOR_API_KEY=rk_... from https://www.reactor.inc/account/api-keys
pnpm install
pnpm dev
```

Open http://localhost:3000, turn on the camera (or pick the sample clip),
choose a reference, and press **Start editing**.

## What you can do with it

- **Swap yourself for a character.** It follows your head and hands.
- **Try something on.** A hat, a costume, a suit, worn as you move.
- **Restyle the scene.** Ten looks, from stained glass and ukiyo-e to
  charcoal, Bauhaus, and neon cyberpunk.
- **Change the place.** Mars, a coral reef, a news desk, an 80s mall.
- **Switch live.** Pick another image or scenario mid-edit; the picture
  changes within a few seconds and the edit keeps running.
- **Bring your own.** Upload a PNG, JPG or WEBP under 10 MB for any scenario.
- **No camera?** Edit the sample clip instead.
- **Stop with confidence.** Stop editing and Disconnect both end the edit and
  close the session.

## Architecture at a glance

The model reports one `session_state` snapshot. Before an edit (`idle`,
`ended`, `failed`) the source can change and a reference pick sets what
`start_edit` sends. During one (`starting`, `warming_up`, `live`, `ending`)
the source is locked and a reference pick is a live `switch_reference`.
Start editing connects the session, publishes the source as `camera`, uploads
the reference, and sends `start_edit`. The edited video fills the stage, with
the source inset for comparison. Stop editing and Disconnect share a close
flow: send `end_edit`, then disconnect. A connected session bills even when
idle, so the app also disconnects after two quiet minutes.

## Code tour

| File | What it does |
| --- | --- |
| [`app/lib/model.ts`](app/lib/model.ts) | Re-exports the published `@reactor-models/vidu-s2-editing` provider, typed commands, message hooks, track definitions and types. |
| [`app/lib/session.tsx`](app/lib/session.tsx) | The edit flow: sources, publishing `camera`, cached reference uploads, start, provisional switches, stop, and disconnect. Holds the snapshot and clears it on disconnect. |
| [`app/lib/edit.ts`](app/lib/edit.ts) | Scenarios, phases, the reference payload, end reasons. |
| [`app/lib/library.ts`](app/lib/library.ts) | Curated reference images bundled under `public/references/`, plus the CDN sample clip. |
| [`app/components/Header.tsx`](app/components/Header.tsx) | Product title and the supplied Reactor logo, with the SVG symbol on small screens. The assets live in `public/brand/` so the scaffold keeps them. |
| [`app/components/SourcePicker.tsx`](app/components/SourcePicker.tsx) | Camera or sample clip. |
| [`app/components/ReferencePicker.tsx`](app/components/ReferencePicker.tsx) | Scenario tabs, the library, uploads. A live pick switches the edit. |
| [`app/components/EditControls.tsx`](app/components/EditControls.tsx) | Start, stop, time left, and whether your source is reaching the editor. |
| [`app/components/Stage.tsx`](app/components/Stage.tsx) | Full-width edited video, source inset, warm-up and stall captions. Both video frames fill their containers with a slight crop. |
| [`app/components/CommandError.tsx`](app/components/CommandError.tsx) | Every refused command, with its code, whose fault it was, and a trace id. |
| [`app/api/reactor/token/route.ts`](app/api/reactor/token/route.ts) | Mints a short-lived JWT scoped to `reactor/vidu-s2-editing`, `no-store`. The API key never reaches the browser. |

## Going further

[`skill/SKILL.md`](skill/SKILL.md) is the guide for extending this app: the
lifecycle, why the source is published before `start_edit`, how a refused
switch arrives after its reply, the null rule, and what to add next.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 ·
`@reactor-models/vidu-s2-editing` 0.2.1 (the model surface) ·
`@reactor-team/ui` (design tokens only).
