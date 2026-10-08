"use client";

import { useEffect, useRef, useState } from "react";
import type { Adventure, TableMode } from "./lib/adventure";
import { WorldProvider, useWorld } from "./lib/world-models";
import {
  liveTranscription,
  type LiveTranscription,
} from "./lib/live-transcription";
import { listenForTurns } from "./lib/table-listener";

type Character = {
  name: string;
  ancestry: string;
  heroClass: string;
  backstory: string;
  box: number[];
};
type Turn = {
  kind: "dm" | "player" | "setup" | "clarify";
  transcript: string;
  narration: string;
  title: string;
  speakerId: string;
  reply: string;
  characters: Character[];
  actionIds: string[];
  plan?: { visualBeat: string; signature: string };
};
async function read<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `The table returned ${response.status}.`);
  return data as T;
}
async function post<T>(
  url: string,
  input: unknown,
  signal?: AbortSignal,
  mode: TableMode = "live"
) {
  return read<T>(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Adventure-Mode": mode },
      body: JSON.stringify(input),
      signal,
    })
  );
}
export function VoiceTable({ configured }: { configured: boolean }) {
  return (
    <WorldProvider engine="h3">
      <Table configured={configured} />
    </WorldProvider>
  );
}

function Table({ configured }: { configured: boolean }) {
  const world = useWorld();
  const mode = useRef<TableMode>("live");
  const previousTurn = useRef("");
  const trailer = useRef<HTMLVideoElement>(null);
  function tablePost<T>(url: string, input: unknown, signal?: AbortSignal) {
    return post<T>(url, input, signal, mode.current);
  }
  const worldRef = useRef(world);
  worldRef.current = world;
  const [state, setState] = useState<Adventure | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [demo, setDemo] = useState(false);
  const [samplePaused, setSamplePaused] = useState(false);
  const [sampleEnded, setSampleEnded] = useState(false);
  const [sampleBuffering, setSampleBuffering] = useState(false);
  const sampleHeld = useRef(false);
  const sampleScene = useRef<number | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [working, setWorking] = useState("");
  const [speechStatus, setSpeechStatus] = useState("");
  const [liveCaption, setLiveCaption] = useState("");
  const [last, setLast] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(false);
  const camera = useRef<HTMLVideoElement>(null);
  const demoImage = useRef<HTMLImageElement | null>(null);
  const resources = useRef<{
    context: AudioContext;
    stream?: MediaStream;
    stop: () => void;
    sample?: HTMLAudioElement;
    live?: LiveTranscription;
  } | null>(null);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const queue = useRef<
    { audio: Blob; camera: string | null; transcript?: Promise<string> }[]
  >([]);
  const processing = useRef(false);
  const captured = useRef(false);
  const clarification = useRef("");
  const narrationAudio = useRef<HTMLAudioElement | null>(null);
  const narrationUrl = useRef<string | null>(null);
  const missedShot = useRef<Adventure | null>(null);
  const videoWork = useRef<Promise<void>>(Promise.resolve());

  function film(next: Adventure) {
    const version = epoch.current;
    const job = videoWork.current
      .catch(() => {})
      .then(async () => {
        if (version !== epoch.current) return;
        await worldRef.current.direct(next.scene, next.heroes);
      });
    videoWork.current = job;
    return job;
  }

  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/adventure", { cache: "no-store", signal: abort.signal })
      .then(read<Adventure>)
      .then((next) => {
        if (!resources.current) setState(next);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => {
      abort.abort();
      shutdown();
    };
  }, []);

  useEffect(() => {
    if (world.frames) trailer.current?.pause();
    else void trailer.current?.play().catch(() => {});
  }, [world.frames]);

  useEffect(() => {
    const sample = resources.current?.sample;
    if (
      !sample ||
      !sampleBuffering ||
      sampleHeld.current ||
      processing.current ||
      queue.current.length
    )
      return;
    if (
      sampleScene.current !== null &&
      (world.playingRevision ?? -1) < sampleScene.current
    )
      return;
    sampleScene.current = null;
    setSampleBuffering(false);
    setSamplePaused(false);
    void sample.play().catch((e) => {
      sampleHeld.current = true;
      setError(e.message);
    });
  }, [sampleBuffering, working, world.playingRevision]);

  function shutdown() {
    epoch.current++;
    controller.current?.abort();
    controller.current = null;
    queue.current = [];
    sampleHeld.current = false;
    sampleScene.current = null;
    resources.current?.stop();
    resources.current?.live?.stop();
    resources.current?.stream?.getTracks().forEach((track) => track.stop());
    const sample = resources.current?.sample;
    if (sample) {
      sample.pause();
      sample.removeAttribute("src");
      sample.load();
    }
    void resources.current?.context.close();
    resources.current = null;
    narrationAudio.current?.pause();
    if (narrationUrl.current) URL.revokeObjectURL(narrationUrl.current);
    narrationUrl.current = null;
  }
  async function end() {
    shutdown();
    setRunning(false);
    setStarting(true);
    setSpeaking(false);
    setSampleBuffering(false);
    setWorking("");
    missedShot.current = null;
    setRetry(false);
    try {
      await worldRef.current.end();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The session could not close.");
    } finally {
      setStarting(false);
    }
  }
  function cameraFrame(): string | null {
    const source = demoImage.current ?? camera.current;
    if (!source) return null;
    const width =
      source instanceof HTMLVideoElement
        ? source.videoWidth
        : source.naturalWidth;
    const height =
      source instanceof HTMLVideoElement
        ? source.videoHeight
        : source.naturalHeight;
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(900, width);
    canvas.height = Math.round((height * canvas.width) / width);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  }
  async function cropCharacters(characters: Character[], reference: string) {
    const image = new Image();
    image.src = reference;
    await image.decode();
    return characters.map((character) => {
      const [x, y, w, h] = character.box;
      const width = Math.min(w, 1 - x) * image.naturalWidth;
      const height = Math.min(h, 1 - y) * image.naturalHeight;
      if (width < 5 || height < 5)
        throw new Error(
          "Move the camera closer to the miniatures and introduce them again."
        );
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = Math.max(
        64,
        Math.min(480, Math.round((320 * height) / width))
      );
      canvas
        .getContext("2d")!
        .drawImage(
          image,
          x * image.naturalWidth,
          y * image.naturalHeight,
          width,
          height,
          0,
          0,
          canvas.width,
          canvas.height
        );
      return {
        name: character.name,
        ancestry: character.ancestry,
        heroClass: character.heroClass,
        backstory: character.backstory,
        photo: canvas.toDataURL("image/jpeg", 0.85),
      };
    });
  }
  async function speak(text: string, signal: AbortSignal) {
    if (!text) return;
    const response = await fetch("/api/adventure/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "Charon" }),
      signal,
    });
    if (!response.ok) await read(response);
    const blob = await response.blob();
    if (signal.aborted) return;
    narrationAudio.current?.pause();
    if (narrationUrl.current) URL.revokeObjectURL(narrationUrl.current);
    narrationUrl.current = URL.createObjectURL(blob);
    const audio = new Audio(narrationUrl.current);
    narrationAudio.current = audio;
    // Echo-cancellation on the real mic keeps generated sound out of turns.
    await audio.play();
  }
  async function drain() {
    if (processing.current) return;
    processing.current = true;
    const version = epoch.current;
    const signal = controller.current?.signal;
    if (!signal) {
      processing.current = false;
      return;
    }
    try {
      while (queue.current.length && version === epoch.current) {
        const segment = queue.current.shift()!;
        try {
          setWorking("Listening to that beat…");
          const form = new FormData();
          const transcript = await segment.transcript;
          if (transcript) form.append("transcript", transcript);
          else form.append("audio", segment.audio, "turn");
          const needsCamera =
            !captured.current ||
            !transcript ||
            /\b(miniatures?|introduc\w*|new character|change the party)\b/i.test(
              transcript
            );
          if (needsCamera && segment.camera)
            form.append("camera", segment.camera);
          form.append("capture", String(!captured.current));
          form.append("clarification", clarification.current);
          form.append("previousTurn", previousTurn.current);
          const turn = await read<Turn>(
            await fetch("/api/adventure/listen", {
              method: "POST",
              headers: { "X-Adventure-Mode": mode.current },
              body: form,
              signal,
            })
          );
          if (version !== epoch.current) break;
          setLast(turn.transcript);
          previousTurn.current = `${turn.kind}: ${turn.transcript}`;
          let next = await read<Adventure>(
            await fetch("/api/adventure", {
              cache: "no-store",
              signal,
              headers: { "X-Adventure-Mode": mode.current },
            })
          );
          if (turn.kind === "clarify") {
            clarification.current = `${turn.transcript}\nQuestion: ${turn.reply}`;
            setLast(turn.reply);
            await speak(turn.reply, signal);
            continue;
          }
          clarification.current = "";
          if (segment.camera && turn.characters.length) {
            setWorking("Meeting your miniatures…");
            next = await tablePost<Adventure>(
              "/api/adventure",
              {
                type: "party",
                heroes: await cropCharacters(turn.characters, segment.camera),
              },
              signal
            );
            captured.current = true;
          } else if (!captured.current) {
            setLast(
              "Point the camera at your miniatures and introduce their names and classes."
            );
            await speak(
              "Point the camera at your miniatures and introduce their names and classes.",
              signal
            );
            continue;
          }
          if (turn.kind === "player") {
            next = await tablePost<Adventure>(
              "/api/adventure",
              { type: "action", heroId: turn.speakerId, text: turn.transcript },
              signal
            );
            setState(next);
            setLast("Action heard. Waiting for the Dungeon Master’s ruling.");
            continue;
          }
          const opening = turn.characters.length > 0;
          if (turn.kind === "dm" || (opening && next.scene.narration)) {
            setWorking(
              opening
                ? "Setting the stage for your party…"
                : "Following the Dungeon Master…"
            );
            next = await tablePost<Adventure>(
              "/api/adventure/scene",
              {
                title: turn.kind === "dm" ? turn.title : next.scene.title,
                narration:
                  turn.kind === "dm" ? turn.narration : next.scene.narration,
                sceneRevision: next.scene.revision,
                actionIds: turn.kind === "dm" ? turn.actionIds : [],
                renderImage: false,
                plan: turn.plan,
              },
              signal
            );
            if (version !== epoch.current) break;
            setState(next);
            if (resources.current?.sample)
              sampleScene.current = next.scene.revision;
            // Interpretation proceeds while the separate ordered video queue
            // waits on generation. A slow shot must not block later speech.
            const shot = next;
            void film(shot).catch((e) => {
              if (version !== epoch.current) return;
              missedShot.current = shot;
              setRetry(true);
              sampleHeld.current = true;
              setError(
                e instanceof Error ? e.message : "The shot could not be filmed."
              );
            });
          } else {
            setState(next);
            setLast(
              "Miniatures captured. Dungeon Master, describe where the adventure begins."
            );
          }
        } catch (e) {
          if (resources.current?.sample) sampleHeld.current = true;
          if (!signal.aborted && version === epoch.current)
            setError(
              e instanceof Error ? e.message : "Please repeat that turn."
            );
        }
      }
    } finally {
      processing.current = false;
      if (version === epoch.current) setWorking("");
      if (queue.current.length && resources.current) void drain();
    }
  }
  async function start(sample: boolean) {
    if (resources.current || starting) return;
    setStarting(true);
    setSamplePaused(false);
    setSampleEnded(false);
    setSampleBuffering(false);
    sampleHeld.current = false;
    sampleScene.current = null;
    // Browsers require a user gesture for native fullscreen. The TV layout is
    // already full-screen in the page, even if native fullscreen is declined.
    if (!document.fullscreenElement)
      void document.documentElement.requestFullscreen().catch(() => {});
    setError(null);
    setDemo(sample);
    mode.current = sample ? "example" : "live";
    previousTurn.current = "";
    setState(null);
    missedShot.current = null;
    setRetry(false);
    videoWork.current = Promise.resolve();
    demoImage.current = null;
    captured.current = false;
    clarification.current = "";
    const version = ++epoch.current;
    controller.current = new AbortController();
    const context = new AudioContext({ sampleRate: 16000 });
    resources.current = { context, stop: () => {} };
    try {
      await context.resume();
      const current = sample
        ? await tablePost<Adventure>(
            "/api/adventure",
            { type: "reset-example" },
            controller.current!.signal
          )
        : await read<Adventure>(
            await fetch("/api/adventure", {
              cache: "no-store",
              signal: controller.current!.signal,
            })
          );
      if (version !== epoch.current) return;
      setState(current);
      let source: AudioNode;
      let audioStream: MediaStream;
      if (sample) {
        const image = new Image();
        image.src = "/miniatures/wizard.jpg";
        await image.decode();
        demoImage.current = image;
        const player = new Audio("/examples/spoken-example.wav");
        player.preload = "auto";
        const destination = context.createMediaStreamDestination();
        source = context.createMediaElementSource(player);
        source.connect(destination);
        source.connect(context.destination);
        audioStream = destination.stream;
        resources.current.sample = player;
        player.onended = () => {
          setSampleEnded(true);
          setLast(
            "The example has finished. Its final pause is being processed."
          );
        };
        player.onerror = () =>
          setError("The sample recording could not be loaded.");
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            facingMode: { ideal: "environment" },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (version !== epoch.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        resources.current.stream = stream;
        if (camera.current) {
          camera.current.srcObject = stream;
          await camera.current.play();
        }
        audioStream = new MediaStream(stream.getAudioTracks());
        source = context.createMediaStreamSource(audioStream);
      }
      if (version !== epoch.current) return;
      // Prepare the transport while the human introduces the table. No scene
      // or idle generation begins until capture and an actual DM beat exist.
      void worldRef.current.prepare?.().catch((e) => {
        if (version === epoch.current) setError(e.message);
      });
      try {
        resources.current.live = await liveTranscription(
          context,
          source,
          controller.current!.signal,
          setLiveCaption,
          setSpeechStatus,
          mode.current
        );
      } catch {
        if (version !== epoch.current) return;
        setSpeechStatus("Recorded speech fallback");
      }
      if (version !== epoch.current) return;
      resources.current.stop = listenForTurns(
        context,
        source,
        audioStream,
        (audio, transcript) => {
          const samplePlayer = resources.current?.sample;
          if (samplePlayer && !samplePlayer.ended) {
            samplePlayer.pause();
            sampleScene.current = null;
            setSamplePaused(true);
            if (!sampleHeld.current) setSampleBuffering(true);
          }
          queue.current.push({ audio, camera: cameraFrame(), transcript });
          void drain();
        },
        setSpeaking,
        (e) => {
          setError(e.message);
          void end();
        },
        resources.current.live
      );
      setRunning(true);
      setLast(
        sample
          ? "Listen to the DM, a player, and the DM’s ruling. Pauses separate each turn."
          : "Introduce your miniatures. Then say “Dungeon Master” or your character’s name before speaking."
      );
      if (resources.current.sample) await resources.current.sample.play();
    } catch (e) {
      if (version === epoch.current) {
        shutdown();
        setError(
          e instanceof Error
            ? e.message
            : "Allow camera and microphone access to start the table."
        );
      }
    } finally {
      if (version === epoch.current || !resources.current) setStarting(false);
    }
  }
  async function retryShot() {
    const next = missedShot.current;
    if (!next) return;
    setWorking("Filming this story beat…");
    setError(null);
    try {
      await film(next);
      missedShot.current = null;
      setRetry(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The shot could not be filmed."
      );
    } finally {
      setWorking("");
    }
  }

  async function toggleSample() {
    const sample = resources.current?.sample;
    if (!sample) return;
    if (sampleBuffering && !sampleHeld.current) {
      sampleHeld.current = true;
      setSampleBuffering(false);
      return;
    }
    if (sample.paused) {
      sampleHeld.current = false;
      sampleScene.current = null;
      setSampleBuffering(false);
      await sample.play().catch((e) => setError(e.message));
      setSamplePaused(sample.paused);
    } else {
      sampleHeld.current = true;
      sample.pause();
      setSamplePaused(true);
    }
  }

  return (
    <main className={`voice-table ${running ? "is-playing" : "at-title"}`}>
      <section className="voice-stage" aria-label="The cinematic adventure">
        <video
          ref={trailer}
          className="voice-backdrop voice-trailer"
          src="/examples/trailer.webm"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-label="Fantasy adventure trailer; promotional scenes, not your campaign"
          style={{ visibility: world.frames ? "hidden" : "visible" }}
        />
        <div
          className="reactor-view-layer"
          style={{ visibility: world.frames ? "visible" : "hidden" }}
        >
          {world.view}
        </div>
        <div className="voice-shade" />
        <div className="voice-frame" aria-hidden="true" />
        <button
          className="voice-fullscreen"
          aria-label="Fullscreen"
          onClick={() =>
            void document.documentElement.requestFullscreen().catch(() => {})
          }
        >
          ⛶
        </button>
        {!running && (
          <div className="voice-title-screen">
            <span className="voice-kicker">
              YOUR MINIATURES · YOUR VOICES · YOUR WORLD
            </span>
            <h1>
              do not
              <br />
              <em>disturb.</em>
            </h1>
            <div className="voice-title-divider">
              <span />✧<span />
            </div>
            <p>
              A story told at your table.
              <br />
              An adventure unfolding before your eyes.
            </p>
            <button
              className="voice-primary"
              disabled={!configured || starting}
              onClick={() => void start(false)}
            >
              {starting
                ? resources.current
                  ? "Entering the adventure…"
                  : "Closing session…"
                : "Begin adventure"}
            </button>
            <button
              className="voice-example"
              disabled={!configured || starting}
              onClick={() => void start(true)}
            >
              ▷ Play the spoken example
            </button>
            <small>
              Point your camera at the miniatures. The rest is spoken.
            </small>
          </div>
        )}
        {running && (
          <div className="voice-scene-label">
            <span>{demo ? "SPOKEN EXAMPLE" : "YOUR ADVENTURE"}</span>
            <h1>{state?.scene.title ?? "Your story begins"}</h1>
          </div>
        )}
        <div className={`voice-camera ${running ? "visible" : ""}`}>
          <video ref={camera} autoPlay muted playsInline hidden={demo} />
          {demo && (
            <img src="/miniatures/wizard.jpg" alt="Sample wizard miniature" />
          )}
          <span>{demo ? "EXAMPLE MINIATURE" : "AT YOUR TABLE"}</span>
        </div>
        {running && (
          <>
            <div className="voice-party">
              {captured.current &&
                state?.heroes.map((hero) => (
                  <div key={hero.id}>
                    <img src={hero.photo} alt={hero.name} />
                    <span>
                      {hero.name}
                      <small>{hero.heroClass}</small>
                    </span>
                  </div>
                ))}
            </div>
            <div className="voice-listening">
              <i className={speaking ? "hearing" : ""} />
              <span>
                {working ||
                  (speaking
                    ? "Hearing your story…"
                    : samplePaused
                      ? sampleBuffering
                        ? "Buffering the scene. The example will resume automatically."
                        : "Example paused. The scene is still preparing."
                      : speechStatus || "Listening to the table")}
              </span>
            </div>
            <div className="voice-video-status">
              {world.status === "disconnected"
                ? captured.current && state?.scene.narration
                  ? "Preparing your story video…"
                  : "Waiting for your miniatures and the Dungeon Master"
                : world.status}
            </div>
            <div className="voice-subtitle" aria-live="polite">
              {speaking && liveCaption ? liveCaption : last}
              {!!state?.pending.length && (
                <small>
                  {state.pending.length}{" "}
                  {state.pending.length === 1
                    ? "action awaits"
                    : "actions await"}{" "}
                  the Dungeon Master’s ruling
                </small>
              )}
            </div>
            <div className="voice-controls">
              {demo && !sampleEnded && (
                <button
                  className="voice-sample-toggle"
                  onClick={() => void toggleSample()}
                >
                  {samplePaused
                    ? sampleBuffering && !sampleHeld.current
                      ? "Ⅱ Keep example paused"
                      : "▶ Resume example"
                    : "Ⅱ Pause example"}
                </button>
              )}
              {demo && samplePaused && (
                <span>
                  {sampleBuffering
                    ? "Waiting for this scene to start before the next voice turn."
                    : "Video continues loading while audio is paused."}
                </span>
              )}
              <button className="voice-end" onClick={() => void end()}>
                End session
              </button>
            </div>
          </>
        )}
        {(error || world.error) && (
          <div className="voice-error" role="alert">
            <span>{error || world.error}</span>
            {retry && (
              <button disabled={!!working} onClick={() => void retryShot()}>
                Retry shot
              </button>
            )}
            <button onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {!configured && (
          <p className="voice-error">
            Set REACTOR_API_KEY and GOOGLE_AI_STUDIO_KEY in the root .env, then
            restart the server.
          </p>
        )}
      </section>
    </main>
  );
}
