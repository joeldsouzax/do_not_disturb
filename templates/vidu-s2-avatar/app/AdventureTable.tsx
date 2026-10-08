"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICES, type Adventure, type Hero } from "./lib/adventure";
import {
  WorldProvider,
  WORLD_ENGINES,
  useWorld,
  type WorldEngine,
} from "./lib/world-models";

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `The table returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

function DiceMark() {
  return (
    <svg
      width="32"
      height="36"
      viewBox="0 0 40 44"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m20 2 17 10v20L20 42 3 32V12L20 2Z M20 2l9 21-9 19-9-19L20 2ZM3 12l26 11L3 32m34-20L11 23l26 9"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function AdventureTable({
  configured,
  reactorConfigured,
  initialEngine = "lingbot",
}: {
  configured: boolean;
  reactorConfigured: boolean;
  initialEngine?: WorldEngine;
}) {
  const [engine, setEngine] = useState<WorldEngine>(initialEngine);
  return (
    <WorldProvider engine={engine} key={engine}>
      <TableWorkspace
        configured={configured}
        reactorConfigured={reactorConfigured}
        engine={engine}
        changeEngine={setEngine}
      />
    </WorldProvider>
  );
}

function TableWorkspace({
  configured,
  reactorConfigured,
  engine,
  changeEngine,
}: {
  configured: boolean;
  reactorConfigured: boolean;
  engine: WorldEngine;
  changeEngine: (engine: WorldEngine) => void;
}) {
  const world = useWorld();
  const [state, setState] = useState<Adventure | null>(null);
  const [selectedHero, setSelectedHero] = useState("");
  const [action, setAction] = useState("");
  const [title, setTitle] = useState("Your adventure");
  const [narration, setNarration] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [voice, setVoice] = useState("Charon");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forge, setForge] = useState(false);
  const [cinema, setCinema] = useState(false);
  const [recording, setRecording] = useState<"player" | "dm" | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(true);
  const mounted = useRef(true);
  const directedRevision = useRef<number | null>(null);
  const worldImage = useRef<string | null>(null);
  const autoOpened = useRef(false);

  // A late polling response cannot replace a newer mutation response.
  const apply = useCallback((next: Adventure) => {
    setState((previous) =>
      !previous || next.revision >= previous.revision ? next : previous
    );
    if (initial.current) {
      initial.current = false;
      setTitle(next.scene.title);
      setNarration(next.scene.narration);
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const next = await read<Adventure>(
          await fetch("/api/adventure", {
            cache: "no-store",
            signal: controller.signal,
          })
        );
        if (!stopped) apply(next);
      } catch (e) {
        if (!stopped)
          setError(e instanceof Error ? e.message : "Cannot reach the table.");
      } finally {
        if (!stopped) timer = setTimeout(poll, 2000);
      }
    }
    void poll();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [apply]);

  useEffect(() => {
    if (
      !state ||
      !world.active ||
      world.busy ||
      directedRevision.current === state.scene.revision
    )
      return;
    directedRevision.current = state.scene.revision;
    const next =
      worldImage.current !== state.scene.image ? world.start : world.direct;
    worldImage.current = state.scene.image;
    void next(state.scene, state.heroes).catch((e) =>
      setError(
        e instanceof Error
          ? e.message
          : "The live world could not follow the story."
      )
    );
  }, [state, world]);

  useEffect(() => {
    if (!state?.scene.image || !reactorConfigured || autoOpened.current) return;
    // Defer until StrictMode's mount probe has finished; cleanup cancels the
    // phantom mount before it can create a billed model session.
    const timer = setTimeout(() => {
      autoOpened.current = true;
      void openWorld();
    }, 150);
    return () => clearTimeout(timer);
  }, [state?.scene.image, reactorConfigured]);

  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setCinema(false);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      recordingStream.current?.getTracks().forEach((track) => track.stop());
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
    };
  }, []);

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl]
  );
  useEffect(() => {
    if (!audioUrl || !audio.current) return;
    void audio.current.play().catch(() => {
      setSpeaking(false);
    });
  }, [audioUrl]);

  async function mutate(input: unknown): Promise<Adventure> {
    const next = await read<Adventure>(
      await fetch("/api/adventure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
    );
    if (mounted.current) apply(next);
    return next;
  }

  async function sendAction(value = action, heroId = selectedHero) {
    if (!value.trim()) return;
    setBusy("action");
    setError(null);
    try {
      await mutate({ type: "action", heroId, text: value });
      setAction("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action could not be sent."
      );
    } finally {
      setBusy(null);
    }
  }

  async function advance() {
    if (!state) return;
    audio.current?.pause();
    setSpeaking(false);
    setBusy("scene");
    setError(null);
    try {
      const next = await read<Adventure>(
        await fetch("/api/adventure/scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            narration,
            sceneRevision: state.scene.revision,
            renderImage: !state.scene.image,
            actionIds: state.pending
              .filter((a) => !excluded.includes(a.id))
              .map((a) => a.id),
          }),
        })
      );
      apply(next);
      setExcluded([]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The scene could not be rendered."
      );
    } finally {
      setBusy(null);
    }
  }

  async function openWorld() {
    if (!state) return;
    setError(null);
    try {
      directedRevision.current = state.scene.revision;
      worldImage.current = state.scene.image;
      await world.start(state.scene, state.heroes);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The live world could not be opened."
      );
    }
  }

  async function rebuild() {
    if (!state) return;
    setBusy("scene");
    setError(null);
    try {
      if (world.active) await world.end();
      const next = await read<Adventure>(
        await fetch("/api/adventure/scene", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            narration,
            sceneRevision: state.scene.revision,
            renderImage: true,
            actionIds: state.pending
              .filter((a) => !excluded.includes(a.id))
              .map((a) => a.id),
          }),
        })
      );
      apply(next);
      setExcluded([]);
      directedRevision.current = next.scene.revision;
      worldImage.current = next.scene.image;
      if (reactorConfigured) await world.start(next.scene, next.heroes);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The new location could not be built."
      );
    } finally {
      setBusy(null);
    }
  }

  async function narrate() {
    if (!state) return;
    if (speaking) {
      audio.current?.pause();
      setSpeaking(false);
      return;
    }
    setBusy("voice");
    setError(null);
    audio.current?.pause();
    try {
      const response = await fetch("/api/adventure/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: state.scene.narration, voice }),
      });
      if (!response.ok) await read(response);
      setAudioUrl(URL.createObjectURL(await response.blob()));
      setSpeaking(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The narrator could not speak."
      );
    } finally {
      setBusy(null);
    }
  }

  async function record(kind: "player" | "dm") {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Microphone recording is unavailable in this browser. Type your words instead."
      );
      return;
    }
    setError(null);
    setBusy("microphone");
    audio.current?.pause();
    setSpeaking(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      recordingStream.current = stream;
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) =>
        MediaRecorder.isTypeSupported(m)
      );
      const capture = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined
      );
      const chunks: Blob[] = [];
      const heroId = selectedHero;
      capture.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      capture.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recordingStream.current = null;
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        setRecording(null);
        setBusy("transcribing");
        void (async () => {
          try {
            const data = new FormData();
            data.append(
              "audio",
              new Blob(chunks, {
                type: capture.mimeType || mime || "audio/webm",
              }),
              "speech"
            );
            const result = await read<{ text: string }>(
              await fetch("/api/adventure/transcribe", {
                method: "POST",
                body: data,
              })
            );
            if (!mounted.current) return;
            if (kind === "dm") setNarration(result.text);
            else {
              setAction(result.text);
              await mutate({ type: "action", heroId, text: result.text });
              setAction("");
            }
          } catch (e) {
            if (mounted.current)
              setError(
                e instanceof Error
                  ? e.message
                  : "Your words could not be transcribed."
              );
          } finally {
            if (mounted.current) setBusy(null);
          }
        })();
      };
      capture.onerror = () => {
        setError("Microphone recording failed. Type your words instead.");
        stream.getTracks().forEach((track) => track.stop());
        setRecording(null);
        setBusy(null);
      };
      recorder.current = capture;
      capture.start();
      setRecording(kind);
      setBusy(null);
      recordingTimer.current = setTimeout(() => {
        if (capture.state === "recording") capture.stop();
      }, 60_000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Allow microphone access, or type your words instead."
      );
      recordingStream.current?.getTracks().forEach((track) => track.stop());
      setBusy(null);
    }
  }

  async function theater() {
    if (cinema) {
      setCinema(false);
      if (document.fullscreenElement) await document.exitFullscreen();
    } else {
      setCinema(true);
      try {
        await document.documentElement.requestFullscreen();
      } catch {
        /* The expanded table also works without fullscreen permission. */
      }
    }
  }

  const scene = state?.scene ?? {
    title: "Your adventure",
    narration: "",
    image: null,
    revision: 0,
  };
  const heroes = state?.heroes ?? [];
  const disabled = !!busy || !!recording || !state || world.busy;

  return (
    <div
      className={`dnd-studio adventure-table ${cinema ? "cinema-mode" : ""}`}
    >
      <header className="studio-header table-header">
        <a className="studio-logo" href="/" aria-label="Do Not Disturb home">
          <DiceMark />
          <span>
            do not
            <br />
            <strong>disturb.</strong>
          </span>
        </a>
        <span className="table-motto">
          YOUR MINIATURES. YOUR VOICES. YOUR WORLD.
        </span>
        <button className="tv-button" onClick={() => void theater()}>
          ⛶ &nbsp; TV mode
        </button>
      </header>
      <main className="adventure-main">
        <div className="table-heading">
          <div>
            <p className="eyebrow">THE PHYSICAL TABLE, REIMAGINED</p>
            <h1>A world at your command.</h1>
          </div>
          <span className="campaign-tag">
            YOUR ADVENTURE <span>THE DUNGEON MASTER’S WORLD</span>
          </span>
        </div>
        {error && (
          <div className="table-error" role="alert">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}
        {world.error && world.error !== error && (
          <div className="table-error" role="alert">
            {world.error}
          </div>
        )}
        {!configured && (
          <p className="table-error">
            Add GOOGLE_AI_STUDIO_KEY to the root .env and restart to render
            scenes, hear narration, and use voice actions. Character setup still
            works.
          </p>
        )}
        <div className="table-layout">
          <section className="world-panel" aria-label="The shared adventure">
            <div className="world-topline">
              <span>
                <i className="live-dot" /> THE SHARED WORLD
              </span>
              <span>SCENE {String(scene.revision || 1).padStart(2, "0")}</span>
            </div>
            <div className="cinematic-stage">
              {scene.image ? (
                <img
                  src={scene.image}
                  alt={`${scene.title}: ${scene.narration}`}
                />
              ) : (
                <WorldPlaceholder />
              )}
              <div
                className="reactor-view-layer"
                style={{ opacity: world.active && world.frames ? 1 : 0 }}
              >
                {world.view}
              </div>
              <div className="scene-scrim" />
              <div className="world-caption">
                <span>THE DUNGEON MASTER’S WORLD</span>
                <h2>{scene.title}</h2>
                <p>{scene.narration}</p>
              </div>
              {(busy === "scene" ||
                world.busy ||
                (world.active && !world.frames)) && (
                <span className="world-busy" role="status">
                  {busy === "scene"
                    ? "Painting the next moment…"
                    : world.busy
                      ? world.status
                      : "Waiting for the first live frame…"}
                </span>
              )}
              {!scene.image && busy !== "scene" && (
                <span className="world-busy">
                  The Dungeon Master sets the opening scene.
                </span>
              )}
              {cinema && (
                <button className="cinema-exit" onClick={() => void theater()}>
                  Exit TV mode ↗
                </button>
              )}
            </div>
            <div className="world-toolbar">
              <span>
                {world.active
                  ? `${world.paused ? "PAUSED" : "LIVE"} · ${WORLD_ENGINES.find((e) => e.id === engine)?.name}`
                  : scene.image
                    ? "WORLD REFERENCE READY"
                    : "THE STORY AWAITS"}
              </span>
              <div>
                {world.active && (
                  <button
                    disabled={disabled}
                    onClick={() => {
                      void (
                        world.paused ? world.resume() : world.pause()
                      ).catch((e) => setError(e.message));
                    }}
                  >
                    {world.paused ? "Resume world" : "Pause world"}
                  </button>
                )}
                <button
                  disabled={!configured || disabled}
                  onClick={() => void narrate()}
                >
                  {busy === "voice"
                    ? "Finding the narrator’s voice…"
                    : speaking
                      ? "Pause narration"
                      : "▶ Hear the narration"}
                </button>
              </div>
            </div>
            {world.active && world.move && (
              <div
                className="world-movement"
                role="group"
                aria-label="Explore the world"
              >
                <span>EXPLORE</span>
                {(["left", "forward", "back", "right", "stop"] as const).map(
                  (direction) => (
                    <button
                      disabled={disabled || world.paused}
                      key={direction}
                      onClick={() =>
                        void world
                          .move?.(direction)
                          .catch((e) => setError(e.message))
                      }
                    >
                      {
                        {
                          left: "← Left",
                          forward: "↑ Forward",
                          back: "↓ Back",
                          right: "→ Right",
                          stop: "■ Stop",
                        }[direction]
                      }
                    </button>
                  )
                )}
              </div>
            )}
            {audioUrl && (
              <audio
                ref={audio}
                src={audioUrl}
                controls
                onPlay={() => setSpeaking(true)}
                onPause={() => setSpeaking(false)}
                onEnded={() => setSpeaking(false)}
                className="narration-player"
                aria-label="Dungeon Master narration"
              />
            )}
            <div className="party-heading">
              <span>THE ADVENTURING PARTY</span>
              <button disabled={disabled} onClick={() => setForge(true)}>
                ＋ Add a miniature
              </button>
            </div>
            <div
              className="party-roster"
              role="group"
              aria-label="Choose the speaking character"
            >
              {heroes.map((hero) => (
                <button
                  key={hero.id}
                  disabled={disabled}
                  aria-pressed={selectedHero === hero.id}
                  className={
                    selectedHero === hero.id
                      ? "party-member selected"
                      : "party-member"
                  }
                  onClick={() => setSelectedHero(hero.id)}
                >
                  <img
                    src={hero.photo}
                    alt={`${hero.name}’s physical miniature`}
                  />
                  <span>
                    <strong>{hero.name}</strong>
                    <small>
                      {hero.ancestry} · {hero.heroClass}
                    </small>
                  </span>
                  <span className="party-marker">✦</span>
                </button>
              ))}
            </div>
            <form
              className="player-command"
              onSubmit={(event) => {
                event.preventDefault();
                void sendAction();
              }}
            >
              <div className="command-heading">
                <span>YOUR TURN</span>
                <p>
                  Speak as your character. The Dungeon Master resolves what
                  happens.
                </p>
              </div>
              <div className="command-input">
                <input
                  aria-label="Your character’s action"
                  value={action}
                  maxLength={2000}
                  onChange={(event) => setAction(event.target.value)}
                  disabled={disabled}
                  placeholder="“I break the seal and read the letter…”"
                />
                <button type="submit" disabled={disabled || !action.trim()}>
                  Act ↗
                </button>
              </div>
              <button
                type="button"
                className={`voice-action ${recording === "player" ? "recording" : ""}`}
                disabled={
                  !!busy ||
                  (recording !== null && recording !== "player") ||
                  !configured ||
                  !state
                }
                onClick={() => void record("player")}
              >
                {recording === "player"
                  ? "■ Finish speaking — send action"
                  : busy === "transcribing"
                    ? "Listening to your words…"
                    : "◎ Speak your action"}
              </button>
            </form>
          </section>

          <aside className="dm-desk" aria-label="Dungeon Master controls">
            <div className="dm-title">
              <DiceMark />
              <div>
                <span>BEHIND THE SCREEN</span>
                <h2>Dungeon Master</h2>
              </div>
            </div>
            <p className="dm-intro">You tell the story. The world follows.</p>
            <label className="forge-label" htmlFor="world-engine">
              How the world responds
            </label>
            <select
              id="world-engine"
              className="forge-input"
              value={engine}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value as WorldEngine;
                setBusy("engine");
                void world
                  .end()
                  .then(() => changeEngine(next))
                  .catch((e) => {
                    setError(e.message);
                    setBusy(null);
                  });
              }}
            >
              {WORLD_ENGINES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
            <p className="dm-note">
              {WORLD_ENGINES.find((entry) => entry.id === engine)?.purpose}
            </p>
            <label className="forge-label" htmlFor="scene-title">
              Where are we?
            </label>
            <input
              id="scene-title"
              className="forge-input"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              disabled={disabled}
            />
            <label className="forge-label" htmlFor="scene-narration">
              Set the scene & resolve actions
            </label>
            <textarea
              id="scene-narration"
              className="forge-input"
              rows={7}
              value={narration}
              maxLength={4000}
              onChange={(e) => setNarration(e.target.value)}
              disabled={disabled}
            />
            <button
              className={`dm-dictate ${recording === "dm" ? "recording" : ""}`}
              disabled={
                !!busy ||
                (recording !== null && recording !== "dm") ||
                !configured
              }
              onClick={() => void record("dm")}
            >
              {recording === "dm"
                ? "■ Finish narrating"
                : "◎ Dictate the next moment"}
            </button>
            {!!state?.pending.length && (
              <div className="pending-actions">
                <h3>
                  Players at the table <span>{state.pending.length}</span>
                </h3>
                <p>Choose the actions this narration resolves.</p>
                {state.pending.map((pending) => (
                  <div className="pending-action" key={pending.id}>
                    <label>
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={!excluded.includes(pending.id)}
                        onChange={(event) =>
                          setExcluded((current) =>
                            event.target.checked
                              ? current.filter((id) => id !== pending.id)
                              : [...current, pending.id]
                          )
                        }
                      />
                      <span>
                        <strong>
                          {heroes.find((h) => h.id === pending.heroId)?.name}
                        </strong>
                        <span>{pending.text}</span>
                      </span>
                    </label>
                    <button
                      disabled={disabled}
                      aria-label="Set aside this action"
                      onClick={() => {
                        setBusy("dismiss");
                        void mutate({ type: "dismiss", id: pending.id })
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(null));
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              className="advance-story"
              disabled={
                !configured || disabled || !narration.trim() || !title.trim()
              }
              onClick={() => void advance()}
            >
              {busy === "scene"
                ? "Painting the next moment…"
                : scene.image
                  ? "Advance the story"
                  : "Reveal the opening scene"}
              <span>↗</span>
            </button>
            <p className="dm-note">
              Your narration decides the outcome. The live world follows it.
            </p>
            {scene.image && (
              <button
                className="dm-dictate"
                disabled={!configured || disabled}
                onClick={() => void rebuild()}
              >
                Build a new location from this narration ↗
              </button>
            )}
            <div className="dm-divider" />
            <label className="forge-label" htmlFor="narrator-voice">
              The storyteller’s voice
            </label>
            <select
              id="narrator-voice"
              className="forge-input"
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
              disabled={disabled}
            >
              {VOICES.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.label}
                </option>
              ))}
            </select>
            <button
              className="animate-scene"
              disabled={!reactorConfigured || disabled || !scene.image}
              onClick={() => {
                if (world.active) {
                  void world.end().catch((e) => setError(e.message));
                } else void openWorld();
              }}
            >
              {world.busy
                ? world.status
                : world.active
                  ? "Close the live world"
                  : "✦ Enter the live world"}
            </button>
            {!reactorConfigured && (
              <p className="dm-note">
                Set REACTOR_API_KEY in the root .env to open a live world.
              </p>
            )}
            <p className="dm-note">
              Keep the physical miniatures at your table. Their photos guide how
              the heroes appear in the world.
            </p>
          </aside>
        </div>
        {!!state?.journal.length && (
          <section className="adventure-journal" aria-label="Adventure journal">
            <div>
              <span>THE TALE SO FAR</span>
              <h2>Adventure journal</h2>
            </div>
            <ol>
              {state.journal.slice(-6).map((entry) => (
                <li key={entry.id}>
                  <span>{entry.speaker}</span>
                  <p>{entry.text}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
        <footer className="workshop-footer table-footer">
          <span>KEEP THE TABLE. EXPAND THE WORLD.</span>
          <span>
            An original fantasy adventure · inspired by tabletop roleplay
          </span>
        </footer>
      </main>
      {forge && (
        <HeroForge
          close={() => setForge(false)}
          add={async (hero) => {
            const next = await mutate({ type: "hero", ...hero });
            setSelectedHero(next.heroes[next.heroes.length - 1].id);
          }}
        />
      )}
    </div>
  );
}

function WorldPlaceholder() {
  return (
    <div className="world-placeholder world-empty" aria-hidden="true">
      <DiceMark />
      <span>YOUR TABLE OPENS ONTO ANOTHER WORLD</span>
    </div>
  );
}

function HeroForge({
  close,
  add,
}: {
  close: () => void;
  add: (hero: Omit<Hero, "id">) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [ancestry, setAncestry] = useState("Human");
  const [heroClass, setHeroClass] = useState("Ranger");
  const [backstory, setBackstory] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!cameraOpen) return;
    let stopped = false;
    setCameraReady(false);
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream.current = media;
        if (video.current) video.current.srcObject = media;
      })
      .catch((e) => {
        if (!stopped) {
          setError(e.message || "Camera unavailable. Upload a photo instead.");
          setCameraOpen(false);
        }
      });
    return () => {
      stopped = true;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, [cameraOpen]);

  async function upload(file: File) {
    if (!file.type.startsWith("image/") || file.size > 20_000_000) {
      setError("Choose an image smaller than 20 MB.");
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const scale = Math.min(1, 900 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The image could not be processed.");
      context.fillStyle = "#eee3cc";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setPhoto(canvas.toDataURL("image/jpeg", 0.85));
      setError(null);
    } catch {
      setError("This image could not be read. Try a JPG or PNG.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function capture() {
    const camera = video.current;
    if (!camera?.videoWidth) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(
      1,
      900 / Math.max(camera.videoWidth, camera.videoHeight)
    );
    canvas.width = Math.round(camera.videoWidth * scale);
    canvas.height = Math.round(camera.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The camera image could not be captured.");
      return;
    }
    context.drawImage(camera, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL("image/jpeg", 0.85));
    setCameraOpen(false);
  }

  return (
    <dialog
      className="hero-forge-dialog"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError(null);
          void add({ name, ancestry, heroClass, backstory, photo })
            .then(close)
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="forge-dialog-header">
          <div>
            <span>FROM THE PHYSICAL TABLE</span>
            <h2>Join the adventure</h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={close}
            aria-label="Close character forge"
          >
            ×
          </button>
        </div>
        <fieldset disabled={busy}>
          <div className="forge-photo">
            {photo && (
              <img src={photo} alt="Your physical miniature reference" />
            )}
            <div>
              <h3>Bring your miniature</h3>
              <p>
                Keep the paint, the equipment, the character. Let the world grow
                around them.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => input.current?.click()}
              >
                Upload a photo ↗
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (!navigator.mediaDevices?.getUserMedia) {
                    setError("Camera unavailable. Upload a photo instead.");
                    return;
                  }
                  setCameraOpen((value) => !value);
                }}
              >
                {" "}
                {cameraOpen ? "Close camera" : "Use camera ↗"}
              </button>
            </div>
          </div>
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          {cameraOpen && (
            <div className="forge-camera">
              <video
                ref={video}
                autoPlay
                muted
                playsInline
                onLoadedData={() => setCameraReady(true)}
              />
              <button type="button" disabled={!cameraReady} onClick={capture}>
                Capture miniature
              </button>
            </div>
          )}
          <label className="forge-label" htmlFor="party-name">
            Character name
          </label>
          <input
            id="party-name"
            className="forge-input"
            required
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder="A name worthy of a legend"
          />
          <div className="forge-pair">
            <label>
              <span className="forge-label">Ancestry</span>
              <select
                className="forge-input"
                value={ancestry}
                onChange={(e) => setAncestry(e.target.value)}
              >
                {[
                  "Human",
                  "Elf",
                  "Dwarf",
                  "Halfling",
                  "Gnome",
                  "Dragonborn",
                  "Tiefling",
                  "Orc",
                  "Other",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="forge-label">Class</span>
              <select
                className="forge-input"
                value={heroClass}
                onChange={(e) => setHeroClass(e.target.value)}
              >
                {[
                  "Wizard",
                  "Ranger",
                  "Fighter",
                  "Rogue",
                  "Cleric",
                  "Bard",
                  "Barbarian",
                  "Druid",
                  "Monk",
                  "Paladin",
                  "Sorcerer",
                  "Warlock",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="forge-label" htmlFor="party-story">
            Backstory & personality
          </label>
          <textarea
            id="party-story"
            className="forge-input"
            required
            rows={3}
            value={backstory}
            maxLength={2000}
            onChange={(e) => setBackstory(e.target.value)}
            placeholder="What brings them to this table?"
          />
        </fieldset>
        {error && (
          <p className="forge-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="advance-story"
          type="submit"
          disabled={busy || cameraOpen || !photo}
        >
          {busy ? "Joining the party…" : "Take a seat at the table"}
          <span>↗</span>
        </button>
      </form>
    </dialog>
  );
}
