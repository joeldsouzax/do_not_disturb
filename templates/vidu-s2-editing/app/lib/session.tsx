"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  useViduS2Editing,
  useViduS2EditingCommandError,
  useViduS2EditingSessionState,
  type FileRef,
  type ViduS2EditingSessionStateMessage,
} from "./model";
import {
  editActive,
  editStartable,
  phaseOf,
  referenceParams,
  type EditingType,
  type Phase,
} from "./edit";
import { referencesFor, type Reference } from "./library";

// The one place the edit flow lives.
//
// The flow is: pick a source (your camera, or a sample clip) and a reference
// image → connect → publish the source as `camera` → `start_edit` → watch
// `main_video` → `switch_reference` as often as you like → `end_edit` and
// disconnect. Starting again opens a new session.
//
// Everything the UI shows about the model comes from `session_state`, held
// here once because the flow needs it, and cleared the moment the session is
// not `ready`: the SDK sends no final snapshot on disconnect.

export type Source = "camera" | "sample";

/** The reference in use: one from the library, or an upload. */
export interface Look {
  key: string;
  label: string;
  editingType: EditingType;
  url: string;
  file: File | null;
}

export type Busy = "connecting" | "starting" | "switching" | "ending" | null;

interface SessionValue {
  status: string;
  snapshot: ViduS2EditingSessionStateMessage | null;
  phase: Phase | null;
  source: Source;
  camera: MediaStream | null;
  sourceVideo: RefObject<HTMLVideoElement | null>;
  look: Look;
  /** A switch sent but not yet safe: the editor refuses one ~4 s later. */
  pending: Look | null;
  notice: string | null;
  busy: Busy;
  lastEdit: { reason: string; seconds: number } | null;
  chooseSource: (source: Source) => void;
  chooseLook: (look: Look) => void;
  uploadLook: (file: File, editingType: EditingType) => void;
  startEdit: () => Promise<void>;
  endSession: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession used outside SessionProvider");
  return value;
}

// A connected session bills whether or not an edit is running.
const IDLE_DISCONNECT_MS = 2 * 60_000;
const FIRST_SNAPSHOT_TIMEOUT_MS = 15_000;
// A switch the editor cannot apply is refused about 4 s after its reply.
const SWITCH_SETTLE_MS = 6_000;

export function lookFromReference(reference: Reference): Look {
  return {
    key: reference.url,
    label: reference.label,
    editingType: reference.editingType,
    url: reference.url,
    file: null,
  };
}

const FIRST_LOOK = lookFromReference(referencesFor("subject_replacement")[0]!);

async function lookFile(look: Look): Promise<File> {
  if (look.file) return look.file;
  const response = await fetch(look.url);
  if (!response.ok) throw new Error("The reference image did not load.");
  const blob = await response.blob();
  return new File([blob], look.url.split("/").pop() ?? "reference", {
    type: blob.type,
  });
}

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function SessionProvider({
  children,
  onDisconnected,
}: {
  children: ReactNode;
  onDisconnected: () => void;
}) {
  const live = useViduS2Editing();
  const { status } = live;
  // The hook returns a fresh object every render. Callbacks read it through a
  // ref so they stay stable, and an effect cleanup never fires mid-edit.
  const modelRef = useRef(live);
  modelRef.current = live;

  const [snapshot, setSnapshot] =
    useState<ViduS2EditingSessionStateMessage | null>(null);
  const [source, setSource] = useState<Source>("camera");
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [look, setLook] = useState<Look>(FIRST_LOOK);
  const [pending, setPending] = useState<Look | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [lastEdit, setLastEdit] = useState<SessionValue["lastEdit"]>(null);

  const phase = status === "ready" ? phaseOf(snapshot) : null;

  const statusRef = useRef(status);
  statusRef.current = status;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const lookRef = useRef(look);
  lookRef.current = look;
  const sourceVideo = useRef<HTMLVideoElement | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const capturedRef = useRef<MediaStreamTrack | null>(null);
  const publishedRef = useRef<MediaStreamTrack | null>(null);
  // Uploads belong to a session, so the cache is cleared on disconnect.
  const uploadsRef = useRef(new Map<string, Promise<FileRef>>());
  const firstSnapshotRef = useRef<(() => void) | null>(null);
  const switchRef = useRef<{ next: Look; previous: Look; timer: number } | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const endingSessionRef = useRef(false);
  const startingRef = useRef(false);
  const operationGenerationRef = useRef(0);
  const tokenClearedRef = useRef(true);

  // Some end_edit replies report zero duration after a visibly live run.
  // Keep a local elapsed time for the completed-edit summary.
  const runSeconds = (reported: number | null) =>
    Math.max(
      reported ?? 0,
      runStartedAtRef.current === null
        ? 0
        : Math.ceil((Date.now() - runStartedAtRef.current) / 1000),
    );

  // ── The snapshot ─────────────────────────────────────────────────────────

  const acceptSnapshot = useCallback((next: ViduS2EditingSessionStateMessage) => {
    snapshotRef.current = next;
    setSnapshot(next);
    firstSnapshotRef.current?.();
    firstSnapshotRef.current = null;
  }, []);
  useViduS2EditingSessionState(acceptSnapshot);

  useEffect(() => {
    if (status !== "ready") setSnapshot(null);
    if (status === "disconnected") {
      uploadsRef.current.clear();
      publishedRef.current = null;
      runStartedAtRef.current = null;
    }
  }, [status]);

  const previousStatusRef = useRef(status);
  useEffect(() => {
    if (status === "disconnected") {
      if (previousStatusRef.current !== "disconnected" && !tokenClearedRef.current) {
        onDisconnected();
        tokenClearedRef.current = true;
      }
    } else {
      tokenClearedRef.current = false;
    }
    previousStatusRef.current = status;
  }, [status, onDisconnected]);

  // ── The edited track ─────────────────────────────────────────────────────
  //
  // Resume `main_video` explicitly, once the session is ready and again when
  // the edit goes live. Without it the track can stay paused: the edit runs
  // and the snapshot says video is arriving, but the stage stays black.
  const editIsLive = phase === "live";
  useEffect(() => {
    if (status !== "ready") return;
    void modelRef.current.resumeTrack("main_video").catch(() => undefined);
  }, [status, editIsLive]);

  // ── Sources ──────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    cameraRef.current?.getTracks().forEach((track) => track.stop());
    cameraRef.current = null;
    setCamera(null);
  }, []);

  const stopCaptured = useCallback(() => {
    capturedRef.current?.stop();
    capturedRef.current = null;
  }, []);

  const openCamera = useCallback(async (): Promise<MediaStream | null> => {
    if (cameraRef.current) return cameraRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      cameraRef.current = stream;
      setCamera(stream);
      return stream;
    } catch {
      setSource("sample");
      setNotice(
        "The browser blocked the camera. Allow it for this site, or edit the sample clip.",
      );
      return null;
    }
  }, []);

  const chooseSource = useCallback(
    (next: Source) => {
      setNotice(null);
      setSource(next);
      if (next === "sample") {
        stopCamera();
        return;
      }
      stopCaptured();
      void openCamera();
    },
    [openCamera, stopCamera, stopCaptured],
  );

  /** The track to publish as `camera`: the webcam, or the sample clip's frames. */
  const inputTrack = useCallback(async (): Promise<MediaStreamTrack | null> => {
    if (sourceRef.current === "camera") {
      return (await openCamera())?.getVideoTracks()[0] ?? null;
    }
    if (capturedRef.current?.readyState === "live") return capturedRef.current;
    const video = sourceVideo.current as CapturableVideo | null;
    if (!video) return null;
    await video.play().catch(() => undefined);
    const stream = video.captureStream?.() ?? video.mozCaptureStream?.();
    capturedRef.current = stream?.getVideoTracks()[0] ?? null;
    if (!capturedRef.current)
      setNotice("This browser cannot stream a clip. Use the camera instead.");
    return capturedRef.current;
  }, [openCamera]);

  const publishInput = useCallback(async (track: MediaStreamTrack) => {
    if (publishedRef.current === track) return;
    if (publishedRef.current)
      await modelRef.current.unpublish("camera").catch(() => undefined);
    // Hold resolution and let the frame rate adapt: the editor needs detail.
    track.contentHint = "detail";
    await modelRef.current.publish("camera", track);
    publishedRef.current = track;
  }, []);

  const unpublishInput = useCallback(() => {
    if (!publishedRef.current) return;
    publishedRef.current = null;
    if (statusRef.current === "ready")
      void modelRef.current.unpublish("camera").catch(() => undefined);
  }, []);

  // An edit that is over no longer needs the source published.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const active = editActive(phase);
    if (wasActiveRef.current && !active) {
      unpublishInput();
      // Preserve the outcome of edits that end on their own, with no awaited
      // end_edit reply.
      if (status === "ready" && phase === "ended" && snapshot) {
        setLastEdit((current) =>
          current ?? {
            reason: snapshot.end_reason ?? "completed",
            seconds: runSeconds(snapshot.edit_elapsed_seconds),
          },
        );
      }
    }
    if (active && !wasActiveRef.current) setLastEdit(null);
    wasActiveRef.current = active;
  }, [phase, snapshot, status, unpublishInput]);

  useEffect(
    () => () => {
      cameraRef.current?.getTracks().forEach((track) => track.stop());
      stopCaptured();
    },
    [stopCaptured],
  );

  // ── References ───────────────────────────────────────────────────────────

  const upload = useCallback((chosen: Look): Promise<FileRef> => {
    const cache = uploadsRef.current;
    const cached = cache.get(chosen.key);
    if (cached) return cached;
    const started = lookFile(chosen)
      .then((file) => modelRef.current.uploadFile(file))
      .catch((error: unknown) => {
        cache.delete(chosen.key);
        throw error;
      });
    cache.set(chosen.key, started);
    return started;
  }, []);

  const settleSwitch = useCallback(() => {
    const current = switchRef.current;
    if (!current) return;
    window.clearTimeout(current.timer);
    switchRef.current = null;
    setPending(null);
  }, []);

  const switchTo = useCallback(
    async (next: Look) => {
      const generation = operationGenerationRef.current;
      settleSwitch();
      const previous = lookRef.current;
      setNotice(null);
      setBusy("switching");
      setPending(next);
      try {
        const image = await upload(next);
        if (generation !== operationGenerationRef.current) return;
        const reply = await modelRef.current.switchReference(
          referenceParams(next.editingType, image),
        );
        if (generation !== operationGenerationRef.current) return;
        if (!reply) {
          // Refused outright; the reason arrives as a command_error.
          setPending(null);
          return;
        }
        setLook(next);
        // Keep the switch provisional until the editor has had time to
        // refuse it. A refusal restores the previous look (below).
        switchRef.current = {
          next,
          previous,
          timer: window.setTimeout(settleSwitch, SWITCH_SETTLE_MS),
        };
      } catch (error) {
        if (generation !== operationGenerationRef.current) return;
        setPending(null);
        setNotice(message(error, "The new reference did not reach the model."));
      } finally {
        if (generation === operationGenerationRef.current) setBusy(null);
      }
    },
    [upload, settleSwitch],
  );

  const chooseLook = useCallback(
    (next: Look) => {
      if (phaseOf(snapshotRef.current) === "live") {
        void switchTo(next);
        return;
      }
      setLook((previous) => {
        if (previous.file && previous.url !== next.url)
          URL.revokeObjectURL(previous.url);
        return next;
      });
    },
    [switchTo],
  );

  const uploadLook = useCallback(
    (file: File, editingType: EditingType) => {
      chooseLook({
        key: `upload:${file.name}:${file.size}:${file.lastModified}`,
        label: file.name.replace(/\.[^.]+$/, "") || "Your image",
        editingType,
        url: URL.createObjectURL(file),
        file,
      });
    },
    [chooseLook],
  );

  // ── Refusals ─────────────────────────────────────────────────────────────

  useViduS2EditingCommandError((error) => {
    if (error.command === "switch_reference" && switchRef.current) {
      // The editor could not apply the switch; the previous reference and
      // scenario are still in effect, and the edit keeps running.
      const { previous } = switchRef.current;
      settleSwitch();
      setLook(previous);
    }
    if (error.command === "start_edit") {
      unpublishInput();
      runStartedAtRef.current = null;
    }
  });

  // ── The edit ─────────────────────────────────────────────────────────────

  const endSession = useCallback(async () => {
    if (endingSessionRef.current) return;
    endingSessionRef.current = true;
    operationGenerationRef.current += 1;
    startingRef.current = false;
    firstSnapshotRef.current?.();
    firstSnapshotRef.current = null;
    setBusy("ending");
    settleSwitch();
    const active = statusRef.current === "ready" &&
      editActive(phaseOf(snapshotRef.current));
    try {
      if (active) {
        const ended = await modelRef.current.endEdit();
        if (ended) {
          setLastEdit((current) => current ?? {
            reason: ended.end_reason ?? "ended_by_client",
            seconds: runSeconds(ended.duration_seconds ?? null),
          });
        }
      }
    } catch (error) {
      setNotice(message(error, "The edit could not stop cleanly."));
    } finally {
      unpublishInput();
      try {
        await modelRef.current.disconnect();
        if (!tokenClearedRef.current) {
          onDisconnected();
          tokenClearedRef.current = true;
        }
      } catch (error) {
        setNotice(message(error, "Could not confirm the session disconnected. Try again."));
      }
      setBusy(null);
      endingSessionRef.current = false;
    }
  }, [onDisconnected, settleSwitch, unpublishInput]);

  const startEdit = useCallback(async () => {
    if (startingRef.current || endingSessionRef.current) return;
    if (statusRef.current === "ready" && !editStartable(phaseOf(snapshotRef.current)))
      return;
    startingRef.current = true;
    const generation = operationGenerationRef.current;
    let firstTimeout: ReturnType<typeof setTimeout> | null = null;
    let connectedThisAttempt = false;
    const cancelled = () => generation !== operationGenerationRef.current;
    setNotice(null);
    setLastEdit(null);
    try {
      const track = await inputTrack();
      if (cancelled()) return;
      if (!track) return;
      if (statusRef.current === "disconnected") {
        setBusy("connecting");
        const first = new Promise<void>((resolve) => {
          firstSnapshotRef.current = resolve;
        });
        await modelRef.current.connect();
        connectedThisAttempt = true;
        if (cancelled()) return;
        // A connect can become ready before its initial broadcast reaches the
        // client. Ask for the same snapshot directly rather than treating a
        // missed broadcast as a failed session.
        if (firstSnapshotRef.current) {
          void modelRef.current.getState().then((initial) => {
            if (initial && !cancelled() && firstSnapshotRef.current)
              acceptSnapshot(initial);
          }).catch(() => undefined);
        }
        await Promise.race([
          first,
          new Promise<void>((_, reject) => {
            firstTimeout = setTimeout(
              () => reject(new Error("The model did not answer. Try again.")),
              FIRST_SNAPSHOT_TIMEOUT_MS,
            );
          }),
        ]);
        if (cancelled()) return;
      }
      setBusy("starting");
      // The editor reads `camera` from the start, so publish it first.
      await publishInput(track);
      if (cancelled()) return;
      const image = await upload(lookRef.current);
      if (cancelled()) return;
      runStartedAtRef.current = Date.now();
      await modelRef.current.startEdit(
        referenceParams(lookRef.current.editingType, image),
      );
    } catch (error) {
      if (cancelled()) return;
      unpublishInput();
      setNotice(message(error, "The edit did not start. Try again."));
      if (connectedThisAttempt || statusRef.current !== "disconnected")
        await endSession();
    } finally {
      if (firstTimeout) clearTimeout(firstTimeout);
      if (generation === operationGenerationRef.current) {
        firstSnapshotRef.current = null;
        startingRef.current = false;
        setBusy(null);
      }
    }
  }, [acceptSnapshot, endSession, inputTrack, publishInput, upload, unpublishInput]);

  // ── Closing an idle session ──────────────────────────────────────────────

  useEffect(() => {
    if (status !== "ready" || editActive(phase) || busy !== null) return;
    const timer = setTimeout(() => {
      setNotice(
        "Disconnected after two quiet minutes, so the session stopped billing. Start again to reconnect.",
      );
      void endSession();
    }, IDLE_DISCONNECT_MS);
    return () => clearTimeout(timer);
  }, [status, phase, busy, endSession]);

  return (
    <SessionContext.Provider
      value={{
        status,
        snapshot: status === "ready" ? snapshot : null,
        phase,
        source,
        camera,
        sourceVideo,
        look,
        pending,
        notice,
        busy,
        lastEdit,
        chooseSource,
        chooseLook,
        uploadLook,
        startEdit,
        endSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
