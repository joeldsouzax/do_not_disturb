# Do Not Disturb

Do Not Disturb turns your physical D&D table into a cinematic video game—your
miniatures are the cast, your voices are the controls, and your Dungeon Master
shapes the world.

## Run the game

```bash
cd templates/vidu-s2-avatar
pnpm install --frozen-lockfile
pnpm dev --hostname 127.0.0.1 --port 3000
```

Open [localhost:3000](http://localhost:3000). Set `REACTOR_API_KEY` and
`GOOGLE_AI_STUDIO_KEY` in the ignored root `.env`. In this checkout the app's
ignored `.env.local` links to that file; standalone copies use their own
`.env.local`.

Start with **Begin adventure**, point the camera at your miniatures, and
introduce them aloud. The human DM establishes the setting and adjudicates
player actions. The TV films those events while the miniatures and dice stay
at the physical table. **Play the spoken example** demonstrates the flow in
separate example state and automatically buffers at spoken turn boundaries.

## Project files

- [Game app](templates/vidu-s2-avatar): the only retained template, containing
  camera capture, live speech, cinematic video, the trailer, and the game HUD.
- [App setup and verification](templates/vidu-s2-avatar/README.md).
- [Agent instructions for the app](templates/vidu-s2-avatar/skill/SKILL.md).
- [Product concept](docs/idea.md) and [D&D context](docs/dnd-context.md).

The app keeps its existing `vidu-s2-avatar` folder identifier. All other
standalone model templates have been removed. The original scaffolding CLI
remains in `bin/` and the root package manifest; the game has its own manifest
inside its app folder.

## License

[Apache 2.0](LICENSE). Reactor source attribution is retained in [NOTICE](NOTICE).
