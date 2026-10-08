# do-not-disturb character studio

Bring a tabletop miniature into a live character conversation. Start with the
bundled wizard, upload a photo, or capture a miniature with the webcam. Give the
hero a name, class, and backstory, then prepare its avatar and start a live call.

This is the first prototype of the [shared D&D table idea](../../docs/idea.md).
The battlemap, multiplayer, image conversion, and external voice API are later
steps. The current experiment sends the selected image directly to Vidu S2-Avatar.

## Run locally

```bash
cd templates/vidu-s2-avatar
pnpm install --frozen-lockfile
pnpm dev --hostname 127.0.0.1 --port 3000
```

Open http://127.0.0.1:3000. The studio works without a key for selecting an image,
editing the character, and previewing it. Live preparation requires
`REACTOR_API_KEY` from [Reactor](https://www.reactor.inc/account/api-keys).

In this checkout, `.env.local` links to the project root `.env`. Put the key in
that root file and restart the server. A standalone copy of this template can
use its own `.env.local` instead:

```dotenv
REACTOR_API_KEY=your_reactor_key
```

The API key stays server-side. The token route mints a short-lived token scoped
to `reactor/vidu-s2-avatar`; the client keeps that token stable for its session.

## Try the flow

1. Select a photo with one figure and a visible face. JPG, PNG, and WebP work
   best for browser previews; images must be smaller than 20 MB.
2. Edit the name, class, and backstory. These instructions form the live persona.
3. Click **Bring my miniature to life** to connect and prepare the character.
4. After the avatar is ready, choose its voice and click **Meet … — start live**.
5. Allow the microphone, speak to the character, or use the text box. Interrupt,
   mute, end the call, or disconnect using the live controls.
6. Capture the last ten seconds and download the resulting clip if desired.

The capture camera stops after taking a photo or closing its dialog. The live
call uses audio input and produces both video and speech. A blocked microphone
still allows typed conversation. Idle sessions disconnect after two minutes.

A painted miniature may not satisfy the model's portrait expectations. Observe
the actual result and any visible model errors; portrait conversion is the next
integration if direct input does not produce a recognizable character.

## Code

- `app/components/MiniatureWorkshop.tsx`: local creation, camera capture, preview,
  and the prepare/start actions.
- `app/lib/session.tsx`: the authoritative model snapshot, avatar binding, media,
  call lifecycle, transcripts, and idle disconnect.
- `app/ViduApp.tsx`: provider and stable token resolver.
- `app/api/reactor/token/route.ts`: server-side scoped authentication.
- `app/components/Stage.tsx`: live video/audio and waiting or stalled states.
- `skill/SKILL.md`: extension instructions and model-specific contracts.

The [sample wizard](https://em4miniatures.com/en-us/products/elfsera-the-wise-wizard)
is from em4miniatures; its source link is shown in the studio.

Validate changes interactively in the browser. No automated test suite was added.
