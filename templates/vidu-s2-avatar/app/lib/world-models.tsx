"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LingbotWorld2Provider,
  LingbotWorld2MainVideoView,
  useLingbotWorld2,
  useLingbotWorld2State,
  useLingbotWorld2CommandError,
  type LingbotWorld2StateMessage,
} from "@reactor-models/lingbot-world-2";
import {
  HappyOysterProvider,
  HappyOysterVideo,
  useHappyOyster,
  useHappyOysterTravelError,
  useHappyOysterTravelStatus,
} from "@reactor-models/happy-oyster/react";
import {
  HeliosProvider,
  HeliosMainVideoView,
  useHelios,
  useHeliosState,
  useHeliosCommandError,
  type HeliosStateMessage,
} from "@reactor-models/helios";
import type { Hero, StoryBeat } from "./adventure";
import {
  H3ReferenceToVideoTurboRealtimeProvider as H3Provider,
  H3ReferenceToVideoTurboRealtimeMainVideoView as H3Video,
  useH3ReferenceToVideoTurboRealtime as useH3,
  useH3ReferenceToVideoTurboRealtimeStateUpdate as useH3State,
  useH3ReferenceToVideoTurboRealtimeClipGenerated as useH3Generated,
  useH3ReferenceToVideoTurboRealtimeClipStarted as useH3Started,
  useH3ReferenceToVideoTurboRealtimeClipFailed as useH3Failed,
  useH3ReferenceToVideoTurboRealtimeCommandError as useH3Error,
  type H3ReferenceToVideoTurboRealtimeStateUpdateMessage as H3State,
  type FileRef,
} from "@reactor-models/h3-reference-to-video-turbo-realtime";
import {
  FastH3Provider,
  FastH3MainVideoView,
  useFastH3,
  useFastH3StateUpdate,
  useFastH3QueueUpdate,
  useFastH3ClipGenerated,
  useFastH3CommandError,
  useFastH3ClipFailed,
  type FastH3StateUpdateMessage,
  type FastH3QueueUpdateMessage,
} from "@reactor-models/fast-h3";
import { lockedWorldPrompt } from "./dnd-context";

export type WorldEngine = "fast" | "h3" | "lingbot" | "oyster" | "helios";
export const WORLD_ENGINES: {
  id: WorldEngine;
  name: string;
  purpose: string;
}[] = [
  {
    id: "fast",
    name: "Fast H3 Livestream",
    purpose: "Keep the established scene moving between narrated beats",
  },
  {
    id: "h3",
    name: "H3 Reference Turbo",
    purpose: "Cast miniatures and film each narrated story beat",
  },
  {
    id: "lingbot",
    name: "LingBot World 2",
    purpose: "Explore and act inside a live world",
  },
  {
    id: "oyster",
    name: "HappyOyster Director",
    purpose: "Direct the story with live instructions",
  },
  {
    id: "helios",
    name: "Helios",
    purpose: "Continuous cinematic scene changes",
  },
];

interface WorldClient {
  playingRevision?: number;
  prepare?: () => Promise<void>;
  active: boolean;
  paused: boolean;
  busy: boolean;
  frames: boolean;
  status: string;
  error: string | null;
  view: ReactNode;
  start: (scene: StoryBeat, heroes: Hero[]) => Promise<void>;
  direct: (scene: StoryBeat, heroes: Hero[]) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  end: () => Promise<void>;
  move?: (
    direction: "forward" | "back" | "left" | "right" | "stop"
  ) => Promise<void>;
}

const WorldContext = createContext<WorldClient | null>(null);
export function useWorld() {
  const value = useContext(WorldContext);
  if (!value) throw new Error("World controls require a world provider.");
  return value;
}

// Each mode has its own session-bound token. It never relies on HTTP caching.
const tokens = new Map<WorldEngine, { jwt: string; expiresAt: number }>();
const pending = new Map<WorldEngine, Promise<string>>();
async function token(engine: WorldEngine): Promise<string> {
  const saved = tokens.get(engine);
  if (saved && Date.now() < saved.expiresAt - 60_000) return saved.jwt;
  const inflight = pending.get(engine);
  if (inflight) return inflight;
  const task = (async () => {
    try {
      const response = await fetch(
        `/api/reactor/world-token?engine=${engine}`,
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "The world token could not be issued.");
      tokens.set(engine, { jwt: data.jwt, expiresAt: data.expires_at * 1000 });
      return data.jwt as string;
    } finally {
      pending.delete(engine);
    }
  })();
  pending.set(engine, task);
  return task;
}

function prompt(scene: StoryBeat, heroes: Hero[]): string {
  return lockedWorldPrompt(
    scene.visualBeat ?? scene.narration,
    scene.title,
    heroes.map((h) => `${h.name}, ${h.ancestry} ${h.heroClass}`).join("; ")
  );
}

async function frame(scene: StoryBeat): Promise<File> {
  if (!scene.image) throw new Error("Create the scene image first.");
  const response = await fetch(scene.image, { cache: "no-store" });
  if (!response.ok) throw new Error("The scene reference could not be loaded.");
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The scene reference could not be prepared.");
    context.drawImage(image, 0, 0, 1280, 720);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) =>
          result
            ? resolve(result)
            : reject(new Error("The scene reference could not be encoded.")),
        "image/jpeg",
        0.9
      )
    );
    return new File([blob], "adventure-scene.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function WorldProvider({
  engine,
  children,
}: {
  engine: WorldEngine;
  children: ReactNode;
}) {
  if (engine === "fast")
    return (
      <FastH3Provider jwtToken={() => token("fast")}>
        <FastWorld>{children}</FastWorld>
      </FastH3Provider>
    );
  if (engine === "h3")
    return (
      <H3Provider jwtToken={() => token("h3")}>
        <H3World>{children}</H3World>
      </H3Provider>
    );
  if (engine === "oyster")
    return (
      <HappyOysterProvider mode="directing" jwt={() => token("oyster")}>
        <OysterWorld>{children}</OysterWorld>
      </HappyOysterProvider>
    );
  if (engine === "helios")
    return (
      <HeliosProvider jwtToken={() => token("helios")}>
        <HeliosWorld>{children}</HeliosWorld>
      </HeliosProvider>
    );
  return (
    <LingbotWorld2Provider jwtToken={() => token("lingbot")}>
      <LingbotWorld>{children}</LingbotWorld>
    </LingbotWorld2Provider>
  );
}

function H3World({ children }: { children: ReactNode }) {
  const model = useH3();
  const ref = useRef(model);
  ref.current = model;
  const [snapshot, setSnapshot] = useState<H3State | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [playingRevision, setPlayingRevision] = useState(-1);
  const latest = useRef<{
    scene: StoryBeat;
    heroes: Hero[];
    references: FileRef[];
  } | null>(null);
  const idleEnabled = useRef(false);
  const idleTask = useRef<Promise<void> | null>(null);
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploads = useRef(new Map<string, FileRef>());
  const lastQueued = useRef<string | null>(null);
  const lastLocation = useRef<string | null>(null);
  const generated = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const inFlight = useRef(false);
  const sessionEpoch = useRef(0);
  const wasReady = useRef(false);
  const preparing = useRef<Promise<void> | null>(null);
  function current(version: number) {
    if (version !== sessionEpoch.current)
      throw new Error("The video session ended.");
  }
  async function prepare() {
    if (preparing.current) return preparing.current;
    if (ref.current.status === "ready") return;
    const version = sessionEpoch.current;
    const task = (async () => {
      await ref.current.connect();
      current(version);
      if (!(await ref.current.setCanvas({ aspect: "16:9" })))
        throw new Error("H3 could not prepare the canvas.");
      current(version);
      if (!(await ref.current.setAutoplay({ enabled: true })))
        throw new Error("H3 could not start playback.");
      current(version);
      if (!(await ref.current.setFlushOnClipEnd({ enabled: false })))
        throw new Error("H3 could not prepare scene boundaries.");
      current(version);
    })();
    preparing.current = task;
    try {
      await task;
    } finally {
      if (preparing.current === task) preparing.current = null;
    }
  }
  useH3State(setSnapshot);
  useH3Started((message) => {
    try {
      const metadata = JSON.parse(message.clip.metadata);
      if (Number.isInteger(metadata.sceneRevision))
        setPlayingRevision(metadata.sceneRevision);
    } catch {
      /* External studio clips need not have scene metadata. */
    }
  });
  useH3Generated((m) => {
    generated.current.add(m.clip.clip_id);
  });
  useH3Failed((m) => {
    failed.current.add(m.clip.clip_id);
    idleEnabled.current = false;
    setError(`The story shot failed: ${m.reason}`);
  });
  useH3Error((m) => {
    idleEnabled.current = false;
    setError(`${m.command}: ${m.reason}`);
  });
  useEffect(() => {
    if (model.status === "ready") wasReady.current = true;
    else {
      if (wasReady.current) {
        sessionEpoch.current++;
        inFlight.current = false;
      }
      wasReady.current = false;
      setSnapshot(null);
      setFrames(false);
      uploads.current.clear();
      lastQueued.current = null;
      lastLocation.current = null;
      latest.current = null;
      idleEnabled.current = false;
      setPlayingRevision(-1);
      generated.current.clear();
      failed.current.clear();
    }
  }, [model.status]);
  async function shoot(scene: StoryBeat, heroes: Hero[]) {
    if (inFlight.current)
      throw new Error("A story shot is already being queued.");
    idleEnabled.current = false;
    inFlight.current = true;
    const version = sessionEpoch.current;
    setBusy(true);
    setError(null);
    try {
      await idleTask.current;
      current(version);
      await prepare();
      current(version);
      // Keep the single ambient buffer playing while the next story builds.
      // Popping its running build wastes compute and exposes a frozen frame.
      // Real beats retain their order, including independent location cuts.
      const priorStoryBuilding =
        !!lastQueued.current && !generated.current.has(lastQueued.current);
      // A location cut does not depend on the previous generation finishing.
      const previous =
        lastLocation.current === scene.title
          ? (snapshotRef.current?.playing_clip_id ?? lastQueued.current)
          : null;
      // Continuation must reference a generated clip, never a queued id.
      const deadline = Date.now() + 180_000;
      while (
        previous &&
        !generated.current.has(previous) &&
        !failed.current.has(previous)
      ) {
        current(version);
        if (ref.current.status !== "ready")
          throw new Error("The video session ended.");
        if (Date.now() > deadline)
          throw new Error(
            "The previous shot is still building. Please repeat the next narration once it is ready."
          );
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const continuation =
        previous &&
        generated.current.has(previous) &&
        lastLocation.current === scene.title
          ? previous
          : undefined;
      const locationReference = !continuation && scene.image;
      const sources = [
        ...heroes.map((h) => h.photo),
        ...(locationReference ? [locationReference] : []),
      ];
      if (!sources.length || sources.length > 9)
        throw new Error("H3 needs one to nine visual references.");
      const references: FileRef[] = [];
      for (const url of sources) {
        let uploaded = uploads.current.get(url);
        if (!uploaded) {
          const response = await fetch(url, { cache: "no-store" });
          if (!response.ok)
            throw new Error("A miniature reference could not be loaded.");
          const blob = await response.blob();
          uploaded = await ref.current.uploadFile(
            new File(
              [blob],
              `reference-${references.length + 1}.${blob.type === "image/png" ? "png" : "jpg"}`,
              { type: blob.type }
            )
          );
          current(version);
          uploads.current.set(url, uploaded);
        }
        references.push(uploaded);
      }
      const definitions = heroes
        .map(
          (h, i) =>
            `Picture ${i + 1}: ${h.name}, ${h.ancestry} ${h.heroClass}. Preserve this miniature's face, clothing and equipment; render a living full-size adventurer without a toy base.`
        )
        .join("\n");
      current(version);
      const reply = await ref.current.enqueue({
        reference_images: references,
        seconds: 5,
        ...(priorStoryBuilding ? {} : { position: 0 }),
        metadata: JSON.stringify({
          kind: "story",
          sceneRevision: scene.revision,
        }),
        ...(continuation ? { continue_from_clip_id: continuation } : {}),
        prompt: `subject_definitions:\n${definitions}\n${locationReference ? `Picture ${sources.length}: the location, composition and lighting ONLY. Ignore characters in this image; cast identity comes from the preceding miniature pictures.` : ""}\nscene:\n${prompt(scene, heroes)}\naction:\n${continuation ? "The shot continues from the previous ending. " : ""}${scene.visualBeat ?? scene.narration}\ncamera: deliberate cinematic medium-wide framing, restrained movement, stable cast and geography.\nstyle: detailed grounded fantasy film.\nsound: synchronized footsteps, cloth, fire, rain and sounds explicitly justified by this beat; no invented dialogue, no narration, no modern music. The humans at the physical table provide the voices.`,
      });
      if (!reply)
        throw new Error(
          "H3 did not accept the story shot. Check the model error."
        );
      current(version);
      lastQueued.current = reply.clip.clip_id;
      lastLocation.current = scene.title;
      latest.current = { scene, heroes, references };
      idleEnabled.current = true;
    } finally {
      if (version === sessionEpoch.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  // One ambient clip ahead keeps a living scene between human turns. It
  // preserves completed outcomes and never creates a new game event.
  useEffect(() => {
    const source = snapshot?.playing_clip_id;
    if (
      !idleEnabled.current ||
      busy ||
      !snapshot?.autoplay ||
      snapshot.generation_queued ||
      snapshot.playout_queued ||
      !source ||
      !generated.current.has(source) ||
      !latest.current
    )
      return;
    const timer = setTimeout(() => {
      if (
        !idleEnabled.current ||
        inFlight.current ||
        idleTask.current ||
        ref.current.status !== "ready" ||
        !latest.current
      )
        return;
      const version = sessionEpoch.current;
      const { scene, heroes, references } = latest.current;
      const task = (async () => {
        const reply = await ref.current.enqueue({
          seconds: 5,
          reference_images: references,
          continue_from_clip_id: source,
          metadata: JSON.stringify({
            kind: "idle",
            sceneRevision: scene.revision,
          }),
          prompt: `Ambient continuation from the previous final frame. All narrated actions are already completed. Preserve the characters' final positions, equipment, props, geography and lighting. No walking, repeated actions, dialogue, new people, monsters, spells, plot progression or camera movement. Animate ONLY quiet breathing, cloth settling, existing flame flicker and established weather. Context describes completed state, never actions to replay: ${prompt(scene, heroes)}. Cast references preserve identity; full-size living characters, no toy bases. Synchronized established ambient sound only.`,
        });
        if (!reply) throw new Error("The ambient scene could not be buffered.");
      })()
        .catch((e) => {
          if (version !== sessionEpoch.current) return;
          idleEnabled.current = false;
          setError(e instanceof Error ? e.message : "Scene buffering failed.");
        })
        .finally(() => {
          if (idleTask.current === task) idleTask.current = null;
        });
      idleTask.current = task;
    }, 100);
    return () => clearTimeout(timer);
  }, [snapshot, busy]);
  const client: WorldClient = {
    playingRevision,
    prepare,
    active: model.status === "ready",
    paused: false,
    busy,
    frames: frames && playingRevision >= 0,
    status:
      model.status === "waiting"
        ? "Waiting for video capacity"
        : busy
          ? "Preparing the next story shot"
          : snapshot?.playing
            ? "The story is playing"
            : (snapshot?.generation_queued ?? 0) > 0
              ? "Filming the next beat"
              : model.status === "ready"
                ? "Waiting for the next narration"
                : model.status,
    error: error ?? model.lastError?.message ?? null,
    view: (
      <div className="world-player" onPlayingCapture={() => setFrames(true)}>
        <H3Video
          audioTrack="main_audio"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
          videoObjectFit="cover"
        />
      </div>
    ),
    start: shoot,
    direct: shoot,
    pause: async () => {
      idleEnabled.current = false;
      await ref.current.setAutoplay({ enabled: false });
      await ref.current.stop();
    },
    resume: async () => {
      idleEnabled.current = true;
      await ref.current.setAutoplay({ enabled: true });
    },
    end: async () => {
      sessionEpoch.current++;
      idleEnabled.current = false;
      await ref.current.disconnect();
      preparing.current = null;
      idleTask.current = null;
      inFlight.current = false;
      setBusy(false);
      setPlayingRevision(-1);
      latest.current = null;
      lastLocation.current = null;
      generated.current.clear();
      failed.current.clear();
      setSnapshot(null);
      setFrames(false);
      uploads.current.clear();
      lastQueued.current = null;
    },
  };
  return (
    <WorldContext.Provider value={client}>{children}</WorldContext.Provider>
  );
}

function LingbotWorld({ children }: { children: ReactNode }) {
  const model = useLingbotWorld2();
  const ref = useRef(model);
  ref.current = model;
  const [snapshot, setSnapshot] = useState<LingbotWorld2StateMessage | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const motion = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLingbotWorld2State(setSnapshot);
  useLingbotWorld2CommandError((message) =>
    setError(`${message.command}: ${message.reason}`)
  );
  useEffect(() => {
    if (model.status !== "ready") {
      setSnapshot(null);
      setFrames(false);
    }
  }, [model.status]);
  useEffect(() => {
    const stop = () => {
      if (motion.current) clearTimeout(motion.current);
      if (ref.current.status === "ready") {
        void ref.current.setMoveLongitudinal({ move_longitudinal: "idle" });
        void ref.current.setMoveLateral({ move_lateral: "idle" });
      }
    };
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("blur", stop);
      if (motion.current) clearTimeout(motion.current);
    };
  }, []);
  async function start(scene: StoryBeat, heroes: Hero[]) {
    setBusy(true);
    setError(null);
    try {
      if (ref.current.status !== "ready") await ref.current.connect();
      if (snapshot?.started) {
        const reset = await ref.current.reset();
        if (!reset)
          throw new Error("LingBot could not reset the previous world.");
      }
      const image = await ref.current.uploadFile(await frame(scene));
      if (!(await ref.current.setImage({ image })))
        throw new Error("LingBot did not accept the scene image.");
      if (!(await ref.current.setPrompt({ prompt: prompt(scene, heroes) })))
        throw new Error("LingBot did not accept the scene description.");
      await ref.current.start();
    } finally {
      setBusy(false);
    }
  }
  const client: WorldClient = {
    active: model.status === "ready" && snapshot?.started === true,
    paused: snapshot?.paused === true,
    busy,
    frames,
    status:
      model.status === "waiting"
        ? "Waiting for world capacity"
        : busy
          ? "Opening the live world"
          : snapshot?.paused
            ? "World paused"
            : snapshot?.started
              ? "Live world"
              : model.status,
    error: error ?? model.lastError?.message ?? null,
    view: (
      <div className="world-player" onPlayingCapture={() => setFrames(true)}>
        <LingbotWorld2MainVideoView
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
          videoObjectFit="cover"
        />
      </div>
    ),
    start,
    direct: async (scene, heroes) => {
      if (ref.current.status !== "ready")
        throw new Error("Open the world first.");
      if (!(await ref.current.setPrompt({ prompt: prompt(scene, heroes) })))
        throw new Error("LingBot did not accept the story beat.");
    },
    pause: async () => {
      if (ref.current.status === "ready") await ref.current.pause();
    },
    resume: async () => {
      if (ref.current.status === "ready") await ref.current.resume();
    },
    end: async () => {
      if (motion.current) clearTimeout(motion.current);
      await ref.current.disconnect();
      setFrames(false);
    },
    move: async (direction) => {
      if (ref.current.status !== "ready" || !snapshot?.running) return;
      if (motion.current) clearTimeout(motion.current);
      await ref.current.setMoveLongitudinal({
        move_longitudinal:
          direction === "forward"
            ? "forward"
            : direction === "back"
              ? "back"
              : "idle",
      });
      await ref.current.setMoveLateral({
        move_lateral:
          direction === "left"
            ? "strafe_left"
            : direction === "right"
              ? "strafe_right"
              : "idle",
      });
      if (direction !== "stop")
        motion.current = setTimeout(() => {
          if (ref.current.status !== "ready") return;
          void ref.current.setMoveLongitudinal({ move_longitudinal: "idle" });
          void ref.current.setMoveLateral({ move_lateral: "idle" });
        }, 1800);
    },
  };
  return (
    <WorldContext.Provider value={client}>{children}</WorldContext.Provider>
  );
}

function OysterWorld({ children }: { children: ReactNode }) {
  const model = useHappyOyster();
  const ref = useRef(model);
  ref.current = model;
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [travelStatus, setTravelStatus] = useState("");
  const opening = useRef(false);
  useHappyOysterTravelStatus(setTravelStatus);
  useHappyOysterTravelError((e) =>
    setError(e instanceof Error ? e.message : String(e))
  );
  useEffect(() => {
    if (!model.streaming) setFrames(false);
  }, [model.streaming]);
  async function start(scene: StoryBeat, heroes: Hero[]) {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    setError(null);
    try {
      if (ref.current.streaming) await ref.current.endTravelSession();
      if (["idle", "ended", "failed"].includes(ref.current.phase))
        await ref.current.connect(() => token("oyster"));
      await ref.current.createWorld({
        prompt: prompt(scene, heroes),
        firstFrameImage: await frame(scene),
        resolution: "720p",
        layout: "Stable",
        narrative: "Dramatic",
      });
      const result = await ref.current.startTravel();
      if (!result.streaming)
        throw new Error("HappyOyster could not start the live world.");
    } finally {
      opening.current = false;
      setBusy(false);
    }
  }
  const client: WorldClient = {
    active: model.streaming,
    paused: travelStatus === "paused",
    busy,
    frames,
    status: busy
      ? model.worldState?.phase === "building"
        ? "Building the world"
        : "Opening the live world"
      : model.streaming
        ? "Live directed world"
        : model.phase,
    error,
    view: (
      <HappyOysterVideo
        className="world-player"
        autoPlay
        playsInline
        muted
        onPlaying={() => setFrames(true)}
      />
    ),
    start,
    direct: async (scene, heroes) => {
      const reply = await ref.current.instruct(prompt(scene, heroes));
      if (!reply.accepted)
        throw new Error("HappyOyster did not accept the story instruction.");
    },
    pause: () => ref.current.pause(),
    resume: () => ref.current.resume(),
    end: async () => {
      await ref.current.disconnect();
      setFrames(false);
      setTravelStatus("");
    },
  };
  return (
    <WorldContext.Provider value={client}>{children}</WorldContext.Provider>
  );
}

function HeliosWorld({ children }: { children: ReactNode }) {
  const model = useHelios();
  const ref = useRef(model);
  ref.current = model;
  const [snapshot, setSnapshot] = useState<HeliosStateMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useHeliosState(setSnapshot);
  useHeliosCommandError((message) =>
    setError(`${message.command}: ${message.reason}`)
  );
  useEffect(() => {
    if (model.status !== "ready") {
      setSnapshot(null);
      setFrames(false);
    }
  }, [model.status]);
  async function start(scene: StoryBeat, heroes: Hero[]) {
    setBusy(true);
    setError(null);
    try {
      if (ref.current.status !== "ready") await ref.current.connect();
      if (snapshot?.started) await ref.current.reset();
      const image = await ref.current.uploadFile(await frame(scene));
      if (
        !(await ref.current.setConditioning({
          image,
          prompt: prompt(scene, heroes),
        }))
      )
        throw new Error("Helios did not accept the scene conditions.");
      await ref.current.start();
    } finally {
      setBusy(false);
    }
  }
  const client: WorldClient = {
    active: model.status === "ready" && snapshot?.started === true,
    paused: snapshot?.paused === true,
    busy,
    frames,
    status:
      model.status === "waiting"
        ? "Waiting for world capacity"
        : busy
          ? "Opening the live scene"
          : snapshot?.started
            ? "Live cinematic world"
            : model.status,
    error: error ?? model.lastError?.message ?? null,
    view: (
      <div className="world-player" onPlayingCapture={() => setFrames(true)}>
        <HeliosMainVideoView
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
          videoObjectFit="cover"
        />
      </div>
    ),
    start,
    direct: async (scene, heroes) => {
      if (ref.current.status !== "ready")
        throw new Error("Open the world first.");
      if (!(await ref.current.setPrompt({ prompt: prompt(scene, heroes) })))
        throw new Error("Helios did not accept the story beat.");
    },
    pause: async () => {
      if (ref.current.status === "ready") await ref.current.pause();
    },
    resume: async () => {
      if (ref.current.status === "ready") await ref.current.resume();
    },
    end: async () => {
      await ref.current.disconnect();
      setFrames(false);
    },
  };
  return (
    <WorldContext.Provider value={client}>{children}</WorldContext.Provider>
  );
}

function FastWorld({ children }: { children: ReactNode }) {
  const model = useFastH3();
  const ref = useRef(model);
  ref.current = model;
  const [snapshot, setSnapshot] = useState<FastH3StateUpdateMessage | null>(
    null
  );
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const queue = useRef<FastH3QueueUpdateMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [frames, setFrames] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const canonical = useRef<string | null>(null);
  const lastStory = useRef<string | null>(null);
  const latest = useRef<{ scene: StoryBeat; heroes: Hero[] } | null>(null);
  const enabled = useRef(false);
  useFastH3StateUpdate(setSnapshot);
  useFastH3QueueUpdate((value) => {
    queue.current = value;
  });
  useFastH3ClipGenerated((m) => {
    if (m.clip.clip_id === lastStory.current)
      canonical.current = m.clip.clip_id;
  });
  useFastH3CommandError((m) => {
    enabled.current = false;
    setError(`${m.command}: ${m.reason}`);
  });
  useFastH3ClipFailed((m) => {
    enabled.current = false;
    setError(`The scene failed to film: ${m.reason}`);
  });
  useEffect(() => {
    if (model.status !== "ready") {
      setSnapshot(null);
      setFrames(false);
      queue.current = null;
      canonical.current = null;
      lastStory.current = null;
      enabled.current = false;
    }
  }, [model.status]);
  function cinematicPrompt(scene: StoryBeat, heroes: Hero[], idle: boolean) {
    return `${idle ? "Hold the established scene. No new game events, dialogue, character actions or plot progression. Animate only breathing, flame flicker and existing weather. Return to the supplied exact ending frame." : lastStory.current ? "Hard cut to a fresh cinematic camera angle showing the DM-established outcome." : "Cinematic opening shot."}\n${prompt(scene, heroes)}\nLiving full-size characters, no toy bases. Synchronized ambient audio, no invented speech or music.`;
  }
  async function shoot(scene: StoryBeat, heroes: Hero[]) {
    if (inFlight.current) throw new Error("A shot is already being prepared.");
    inFlight.current = true;
    setBusy(true);
    setError(null);
    enabled.current = false;
    try {
      if (ref.current.status !== "ready") {
        await ref.current.connect();
        if (
          !(await ref.current.setCanvas({ aspect: "16:9" })) ||
          !(await ref.current.setAutoplay({ enabled: true })) ||
          !(await ref.current.setFlushOnClipEnd({ enabled: false }))
        )
          throw new Error("Fast H3 could not prepare playback.");
      }
      for (const clip of [
        ...(queue.current?.generation ?? []),
        ...(queue.current?.playout ?? []),
      ]) {
        if (
          clip.metadata.includes('"kind":"idle"') &&
          !(await ref.current.pop({ clip_id: clip.clip_id }))
        )
          throw new Error("Fast H3 could not make room for the new beat.");
      }
      let starting_frame: FileRef | undefined;
      const source =
        snapshotRef.current?.playing_clip_id ??
        canonical.current ??
        lastStory.current;
      if (!source) {
        if (!scene.image)
          throw new Error(
            "Fast H3 needs a cinematic cast image. Build the opening scene in the studio first."
          );
        starting_frame = await ref.current.uploadFile(await frame(scene));
      }
      const reply = await ref.current.enqueue({
        prompt: cinematicPrompt(scene, heroes, false),
        seconds: 10,
        position: 0,
        metadata: JSON.stringify({ kind: "story", revision: scene.revision }),
        ...(source ? { continue_from_clip_id: source } : { starting_frame }),
      });
      if (!reply) throw new Error("Fast H3 did not accept the story beat.");
      lastStory.current = reply.clip.clip_id;
      canonical.current = null;
      latest.current = { scene, heroes };
      enabled.current = true;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !enabled.current ||
      busy ||
      !snapshot?.playing ||
      snapshot.generation_queued ||
      snapshot.playout_queued ||
      !canonical.current ||
      !latest.current
    )
      return;
    const timer = setTimeout(() => {
      if (
        !enabled.current ||
        inFlight.current ||
        ref.current.status !== "ready" ||
        !canonical.current ||
        !latest.current
      )
        return;
      inFlight.current = true;
      const { scene, heroes } = latest.current;
      void ref.current
        .enqueue({
          prompt: cinematicPrompt(scene, heroes, true),
          seconds: 10,
          continue_from_clip_id: snapshot.playing_clip_id ?? canonical.current,
          ending_from_clip_id: canonical.current,
          metadata: JSON.stringify({ kind: "idle", revision: scene.revision }),
        })
        .then((reply) => {
          if (!reply) {
            enabled.current = false;
            setError("Fast H3 could not keep the scene moving.");
          }
        })
        .finally(() => {
          inFlight.current = false;
        });
    }, 100);
    return () => clearTimeout(timer);
  }, [snapshot, busy]);
  const client: WorldClient = {
    active: model.status === "ready",
    paused: snapshot?.autoplay === false,
    busy,
    frames,
    status: busy
      ? "Preparing the next story beat"
      : snapshot?.playing
        ? "Live cinematic adventure"
        : (snapshot?.generation_queued ?? 0) > 0
          ? "Filming the next beat"
          : model.status,
    error: error ?? model.lastError?.message ?? null,
    view: (
      <div className="world-player" onPlayingCapture={() => setFrames(true)}>
        <FastH3MainVideoView
          audioTrack="main_audio"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
          }}
          videoObjectFit="cover"
        />
      </div>
    ),
    start: shoot,
    direct: shoot,
    pause: async () => {
      enabled.current = false;
      await ref.current.setAutoplay({ enabled: false });
      await ref.current.stop();
    },
    resume: async () => {
      enabled.current = true;
      await ref.current.setAutoplay({ enabled: true });
    },
    end: async () => {
      enabled.current = false;
      await ref.current.disconnect();
      setSnapshot(null);
      setFrames(false);
      queue.current = null;
      latest.current = null;
      canonical.current = null;
      lastStory.current = null;
    },
  };
  return (
    <WorldContext.Provider value={client}>{children}</WorldContext.Provider>
  );
}
