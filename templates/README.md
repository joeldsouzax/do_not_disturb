# Do Not Disturb app

[vidu-s2-avatar](vidu-s2-avatar) is the only app in this directory. Its original
folder identifier is retained; the app now provides the camera-and-voice D&D
experience, cinematic TV mode, a bundled trailer and an isolated spoken example.

See its [README](vidu-s2-avatar/README.md) for setup, model roles and verification,
and its [skill](vidu-s2-avatar/skill/SKILL.md) before extending it.

Run it from its own folder:

```bash
cd templates/vidu-s2-avatar
pnpm install --frozen-lockfile
pnpm dev --hostname 127.0.0.1 --port 3000
```

Reactor and Google credentials remain server-side. The removed standalone model
templates are not required by this app: its adapters use installed typed SDK
packages directly.
