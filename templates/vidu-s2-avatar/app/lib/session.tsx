"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useViduS2Avatar,
  useViduS2AvatarCommandError,
  useViduS2AvatarSessionState,
  useViduS2AvatarTranscript,
  type ViduS2AvatarSessionStateMessage,
  type ViduS2AvatarVoicesMessage,
} from "./model";
import {
  callActive,
  callStartable,
  MIC_CONSTRAINTS,
  matchVoice,
  phaseOf,
  startCallParams,
  type CallMode,
  type CallSetup,
  type Phase,
  type ReferenceKind,
} from "./call";
import type { Character } from "./characters";

// The one place the call flow lives.
//
// A Reactor session here holds at most one character and at most one call.
// The flow is: connect → `list_voices` → bind a character (`create_avatar`,
// or `attach_avatar` for one this page already made) → `start_call` → talk →
// `end_call`. An ended call keeps the character, so the next call is one
// `start_call` away.
//
// Everything the UI shows about the model comes from `session_state`, held
// here once because the flow itself needs it (a call can only start from
// `avatar_ready`, `ended` or `failed`). It is cleared the moment the session
// is not `ready`: the SDK sends no final snapshot on disconnect, so without
// that the UI would keep showing a call that no longer exists.

export interface Photo {
  /** Identifies the image, so a character made from it can be reattached. */
  key: string;
  url: string;
  name: string;
  /** Set for an upload; an example is fetched from `url` when needed. */
  file: File | null;
}

export interface Line {
  speaker: "user" | "character";
  text: string;
}

export type Busy = "connecting" | "preparing" | "starting" | "ending" | null;

interface SessionValue {
  status: string;
  snapshot: ViduS2AvatarSessionStateMessage | null;
  phase: Phase | null;
  voices: ViduS2AvatarVoicesMessage | null;
  photo: Photo | null;
  setup: CallSetup;
  patchSetup: (patch: Partial<CallSetup>) => void;
  transcript: Line[];
  notice: string | null;
  busy: Busy;
  lastCall: { reason: string; seconds: number } | null;
  micMuted: boolean;
  webcam: MediaStream | null;
  chooseCharacter: (character: Character) => void;
  choosePhoto: (file: File) => void;
  startCall: () => Promise<void>;
  endCall: () => Promise<void>;
  say: (text: string) => void;
  interrupt: () => void;
  toggleMic: () => void;
  changeVoice: (voice: string) => Promise<void>;
  addReference: (reference: {
    url: string;
    kind: ReferenceKind;
    text: string;
    imageID?: string;
  }) => Promise<boolean>;
  clearReference: (imageID: string | null) => Promise<boolean>;
  endSession: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession used outside SessionProvider");
  return value;
}

// How long a connected session may sit with no call before this page closes
// it. A connected session bills whether or not a call is running.
const IDLE_DISCONNECT_MS = 2 * 60_000;
// How long to wait for the model's first snapshot after connecting.
const FIRST_SNAPSHOT_TIMEOUT_MS = 15_000;
const TRANSCRIPT_CEILING = 60;

const EMPTY_SETUP: CallSetup = {
  persona: "",
  greeting: "",
  voice: "",
  callMode: "audio",
};

async function exampleFile(photo: Photo): Promise<File> {
  const response = await fetch(photo.url);
  if (!response.ok) throw new Error("The example portrait did not load.");
  const blob = await response.blob();
  return new File([blob], `${photo.key}.jpg`, { type: blob.type });
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const live = useViduS2Avatar();
  const { status } = live;
  // The hook returns a fresh object every render. Callbacks read it through a
  // ref so they stay stable, and an effect cleanup never fires mid-call.
  const modelRef = useRef(live);
  modelRef.current = live;

  const [snapshot, setSnapshot] =
    useState<ViduS2AvatarSessionStateMessage | null>(null);
  const [voices, setVoices] = useState<ViduS2AvatarVoicesMessage | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [setup, setSetup] = useState<CallSetup>(EMPTY_SETUP);
  const [transcript, setTranscript] = useState<Line[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [lastCall, setLastCall] = useState<SessionValue["lastCall"]>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [webcam, setWebcam] = useState<MediaStream | null>(null);

  const phase = status === "ready" ? phaseOf(snapshot) : null;

  // Refs for values the async flow reads after an await, when a closure's
  // copy would be stale.
  const statusRef = useRef(status);
  statusRef.current = status;
  const snapshotRef = useRef<ViduS2AvatarSessionStateMessage | null>(null);
  snapshotRef.current = snapshot;
  const photoRef = useRef<Photo | null>(null);
  photoRef.current = photo;
  const voicesRef = useRef<ViduS2AvatarVoicesMessage | null>(null);
  voicesRef.current = voices;
  const voiceHintRef = useRef("");
  const typedRef = useRef<string[]>([]);
  const mediaRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStreamTrack | null>(null);
  // Characters this page has made, by photo, so a later session reattaches
  // one with `attach_avatar` instead of building it again. The model keeps
  // an avatar for 90 days; persist this map if you want reuse across visits.
  const boundRef = useRef(new Map<string, string>());
  // The binding `prepare()` is waiting to record: which photo, and the
  // avatar the session held before its command went out.
  const pendingBindRef = useRef<{ key: string; before: string | null } | null>(
    null,
  );
  // Resolved by the next `session_state`.
  const firstSnapshotRef = useRef<(() => void) | null>(null);

  // ── The snapshot, and what hangs off it ──────────────────────────────────

  useViduS2AvatarSessionState((next) => {
    setSnapshot(next);
    firstSnapshotRef.current?.();
    firstSnapshotRef.current = null;
  });

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
  }, [status]);

  // Remember the character once the model has built it. Only a snapshot
  // whose `avatar_id` differs from the one the session held when `prepare()`
  // sent its command counts: `photo` changes before the model answers, and a
  // refused `create_avatar` or a failed upload leaves the previous
  // character's snapshot in place, which must not be recorded under the new
  // photo.
  useEffect(() => {
    const pending = pendingBindRef.current;
    if (
      pending &&
      snapshot?.phase === "avatar_ready" &&
      snapshot.avatar_status === "ready" &&
      snapshot.avatar_id &&
      snapshot.avatar_id !== pending.before
    ) {
      boundRef.current.set(pending.key, snapshot.avatar_id);
      pendingBindRef.current = null;
    }
  }, [snapshot?.phase, snapshot?.avatar_status, snapshot?.avatar_id]);

  // A new call starts with a clean transcript.
  const previousPhaseRef = useRef<Phase | null>(null);
  useEffect(() => {
    if (phase === "starting" && previousPhaseRef.current !== "starting") {
      setTranscript([]);
      typedRef.current = [];
      setLastCall(null);
    }
    previousPhaseRef.current = phase;
  }, [phase]);

  useViduS2AvatarTranscript((line) => {
    if (!line.final) return;
    const speaker: Line["speaker"] =
      line.speaker === "user" ? "user" : "character";
    const text = line.text.trim();
    // A typed `say` is already on screen; drop its spoken echo.
    if (speaker === "user" && typedRef.current[0] === text) {
      typedRef.current = typedRef.current.slice(1);
      return;
    }
    setTranscript((lines) =>
      [...lines, { speaker, text }].slice(-TRANSCRIPT_CEILING),
    );
  });

  // ── The character's tracks ───────────────────────────────────────────────
  //
  // The SDK subscribes to every output track on connect (`autoResumeTracks`
  // defaults to true), so nothing is needed then. The call is different: the
  // character's media starts when the call goes live, and a live call has
  // been seen to stay black and silent while the transcript fills until both
  // tracks are resumed again. Resuming a track that already plays is
  // harmless. A failure is logged rather than swallowed: a silent one leaves
  // a dark stage with no clue.
  const callIsLive = phase === "live";
  useEffect(() => {
    if (!callIsLive) return;
    for (const track of ["main_video", "main_audio"] as const)
      void modelRef.current.resumeTrack(track).catch((error: unknown) => {
        console.warn(`Could not resume ${track}:`, error);
      });
  }, [callIsLive]);

  // ── Microphone and camera ────────────────────────────────────────────────

  const releaseMedia = useCallback(() => {
    const media = mediaRef.current;
    mediaRef.current = null;
    micRef.current = null;
    setWebcam(null);
    setMicMuted(false);
    if (!media) return;
    media.getTracks().forEach((track) => track.stop());
    if (statusRef.current !== "ready") return;
    void modelRef.current.unpublish("mic").catch(() => undefined);
    void modelRef.current.unpublish("webcam").catch(() => undefined);
  }, []);

  // Publish before `start_call`, so the first thing said reaches the model.
  // Returns the call mode the media actually supports: a blocked camera
  // falls back to an audio call rather than failing it.
  const openMedia = useCallback(
    async (mode: CallMode): Promise<CallMode> => {
      releaseMedia();
      let media: MediaStream | null = null;
      let granted = mode;
      try {
        media = await navigator.mediaDevices.getUserMedia({
          audio: MIC_CONSTRAINTS,
          video: mode === "video" ? { facingMode: "user" } : false,
        });
      } catch {
        if (mode === "video") {
          granted = "audio";
          try {
            media = await navigator.mediaDevices.getUserMedia({
              audio: MIC_CONSTRAINTS,
            });
            setNotice("The camera was blocked, so this is an audio call.");
          } catch {
            media = null;
          }
        }
        if (!media) {
          setNotice(
            "The microphone was blocked. Typed messages still reach the character.",
          );
          return granted;
        }
      }
      mediaRef.current = media;
      const [mic] = media.getAudioTracks();
      if (mic) {
        micRef.current = mic;
        await modelRef.current.publish("mic", mic);
      }
      const [camera] = media.getVideoTracks();
      if (camera && granted === "video") {
        camera.contentHint = "motion";
        await modelRef.current.publish("webcam", camera);
        setWebcam(new MediaStream([camera]));
      }
      return granted;
    },
    [releaseMedia],
  );

  // A call that is over no longer needs the microphone. Keyed on the
  // transition out of an active call, not on "no call right now": the
  // microphone is published before `start_call`, while the phase is still
  // `avatar_ready`.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const active = callActive(phase);
    if (wasActiveRef.current && !active) releaseMedia();
    wasActiveRef.current = active;
  }, [phase, releaseMedia]);

  useEffect(() => {
    if (status === "disconnected") releaseMedia();
  }, [status, releaseMedia]);

  useEffect(() => () => releaseMedia(), [releaseMedia]);

  // ── Binding a character ──────────────────────────────────────────────────

  const prepare = useCallback(
    async (next: Photo) => {
      setNotice(null);
      try {
        if (statusRef.current === "disconnected") {
          setBusy("connecting");
          // Parked before connect(), so the snapshot the model sends on
          // connect cannot arrive before anyone listens. The clock starts
          // only once connect() has resolved: a wait for capacity can take
          // longer than the timeout on its own.
          const first = new Promise<void>((resolve) => {
            firstSnapshotRef.current = resolve;
          });
          await modelRef.current.connect();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              first,
              new Promise<never>((_, reject) => {
                timer = setTimeout(
                  () =>
                    reject(new Error("The model did not answer. Try again.")),
                  FIRST_SNAPSHOT_TIMEOUT_MS,
                );
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        }
        setBusy("preparing");
        pendingBindRef.current = {
          key: next.key,
          before: snapshotRef.current?.avatar_id ?? null,
        };
        if (!voicesRef.current) {
          // The catalog is the command's reply: read it off the await.
          const catalog = await modelRef.current.listVoices();
          if (catalog) setVoices(catalog);
        }
        const saved = boundRef.current.get(next.key);
        if (saved) {
          await modelRef.current.attachAvatar({ avatar_id: saved });
        } else {
          const image = await modelRef.current.uploadFile(
            next.file ?? (await exampleFile(next)),
          );
          await modelRef.current.createAvatar({ image, name: next.name });
        }
      } catch (error) {
        setNotice(message(error, "The character could not be prepared."));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const choose = useCallback(
    (next: Photo) => {
      setPhoto((previous) => {
        if (previous?.file) URL.revokeObjectURL(previous.url);
        return next;
      });
      void prepare(next);
    },
    [prepare],
  );

  const chooseCharacter = useCallback(
    (character: Character) => {
      voiceHintRef.current = character.voice;
      const catalog = voicesRef.current;
      setSetup((current) => ({
        ...current,
        persona: character.persona,
        greeting: character.greeting,
        voice: catalog ? matchVoice(catalog, character.voice) : "",
      }));
      choose({
        key: character.id,
        url: character.portrait,
        name: character.name,
        file: null,
      });
    },
    [choose],
  );

  const choosePhoto = useCallback(
    (file: File) => {
      voiceHintRef.current = "";
      choose({
        key: `upload:${file.name}:${file.size}:${file.lastModified}`,
        url: URL.createObjectURL(file),
        name: file.name.replace(/\.[^.]+$/, "").slice(0, 100) || "Character",
        file,
      });
    },
    [choose],
  );

  // Fill in the voice once the catalog arrives.
  useEffect(() => {
    if (!voices) return;
    setSetup((current) =>
      current.voice
        ? current
        : { ...current, voice: matchVoice(voices, voiceHintRef.current) },
    );
  }, [voices]);

  // ── Refusals ─────────────────────────────────────────────────────────────

  useViduS2AvatarCommandError((error) => {
    // A refused `start_call` never became a call, so nothing else releases
    // the microphone it published.
    if (error.command === "start_call") releaseMedia();
    // A saved character expired or belongs elsewhere: forget it and build it
    // again from the same photo.
    if (error.code === "AVATAR_NOT_FOUND" && photoRef.current) {
      boundRef.current.delete(photoRef.current.key);
      void prepare(photoRef.current);
    }
  });

  // ── The call ─────────────────────────────────────────────────────────────

  const startCall = useCallback(async () => {
    if (!callStartable(phase) || !setup.persona.trim()) return;
    setNotice(null);
    setBusy("starting");
    try {
      const mode = await openMedia(setup.callMode);
      await modelRef.current.startCall(
        startCallParams({ ...setup, callMode: mode }),
      );
    } catch (error) {
      releaseMedia();
      setNotice(message(error, "The call did not start."));
    } finally {
      setBusy(null);
    }
  }, [phase, setup, openMedia, releaseMedia]);

  const endCall = useCallback(async () => {
    setBusy("ending");
    try {
      const ended = await modelRef.current.endCall();
      if (ended)
        setLastCall({
          reason: ended.end_reason,
          seconds: ended.duration_seconds,
        });
    } finally {
      setBusy(null);
    }
  }, []);

  const say = useCallback(
    (text: string) => {
      const line = text.trim();
      if (!line) return;
      typedRef.current = [...typedRef.current, line];
      setTranscript((lines) =>
        [...lines, { speaker: "user" as const, text: line }].slice(
          -TRANSCRIPT_CEILING,
        ),
      );
      void modelRef.current.say({ text: line });
    },
    [],
  );

  const interrupt = useCallback(() => void modelRef.current.interrupt(), []);

  // Muting stops sending sound without renegotiating the track.
  const toggleMic = useCallback(() => {
    const mic = micRef.current;
    if (!mic) return;
    mic.enabled = !mic.enabled;
    setMicMuted(!mic.enabled);
  }, []);

  const changeVoice = useCallback(
    async (voice: string) => {
      const updated = await modelRef.current.updateCall({ voice });
      if (updated) setSetup((current) => ({ ...current, voice }));
    },
    [],
  );

  const addReference = useCallback(
    async ({
      url,
      kind,
      text,
      imageID,
    }: {
      url: string;
      kind: ReferenceKind;
      text: string;
      imageID?: string;
    }) => {
      const note = text.trim();
      const applied = await modelRef.current.setReferenceImages({
        images: [
          {
            image_url: url.trim(),
            image_id: imageID ?? `${kind}-${Date.now().toString(36)}`,
            kind,
            ...(note && { text: note }),
          },
        ],
      });
      return applied !== undefined;
    },
    [],
  );

  const clearReference = useCallback(async (imageID: string | null) => {
    const applied = await modelRef.current.clearReferenceImages(
      imageID ? { image_ids: [imageID] } : {},
    );
    return applied !== undefined;
  }, []);

  const endSession = useCallback(async () => {
    releaseMedia();
    await modelRef.current.disconnect();
  }, [releaseMedia]);

  // ── Closing an idle session ──────────────────────────────────────────────

  useEffect(() => {
    if (status !== "ready" || callActive(phase) || busy !== null) return;
    const timer = setTimeout(() => {
      setNotice(
        "Disconnected after two quiet minutes, so the session stopped billing. Pick a character to reconnect.",
      );
      void endSession();
    }, IDLE_DISCONNECT_MS);
    return () => clearTimeout(timer);
  }, [status, phase, busy, endSession]);

  const patchSetup = useCallback(
    (patch: Partial<CallSetup>) =>
      setSetup((current) => ({ ...current, ...patch })),
    [],
  );

  // One object per change, not per render, so a provider render that moved
  // nothing a consumer reads does not re-render every consumer. Snapshots
  // still tick about once a second during a call and reach everyone: the
  // app keeps one context on purpose, so a component that must not re-render
  // on the tick should select what it needs into its own memo.
  const value = useMemo<SessionValue>(
    () => ({
      status,
      snapshot: status === "ready" ? snapshot : null,
      phase,
      voices,
      photo,
      setup,
      patchSetup,
      transcript,
      notice,
      busy,
      lastCall,
      micMuted,
      webcam,
      chooseCharacter,
      choosePhoto,
      startCall,
      endCall,
      say,
      interrupt,
      toggleMic,
      changeVoice,
      addReference,
      clearReference,
      endSession,
    }),
    [
      status,
      snapshot,
      phase,
      voices,
      photo,
      setup,
      patchSetup,
      transcript,
      notice,
      busy,
      lastCall,
      micMuted,
      webcam,
      chooseCharacter,
      choosePhoto,
      startCall,
      endCall,
      say,
      interrupt,
      toggleMic,
      changeVoice,
      addReference,
      clearReference,
      endSession,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
