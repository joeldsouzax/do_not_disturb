"use client";

import type { FileRef } from "@reactor-team/js-sdk";
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
  useH3,
  useH3ClipGenerated,
  useH3QueueUpdate,
  useH3StateUpdate,
  type H3Clip,
} from "./model";
import { CONTINUATION_BEATS, loadPresetFile, PRESETS } from "./presets";
import {
  buildPrompt,
  draftProblem,
  slotsForMode,
  type Mode,
  type ShotDraft,
  type Slot,
} from "./shot";

// One place for the state the composer, the stage and the steer box share.
//
// Two behaviours live here that are the whole point of the app, and both are
// easier to get wrong than they look.
//
// Continuous generation: the session keeps its own queue topped up so playback
// never runs dry. It draws on a pool of beats and chains each one from the most
// recently generated clip, so the scene continues rather than cutting.
//
// Steering: a clip the user asks for has to play next, not behind whatever the
// session queued while they were typing. So a steer pops the pending automatic
// clips first and enqueues at position 0. Tagging the automatic ones through
// `metadata` is what makes them identifiable later — the model echoes it back
// on every clip message, so the queue tells you which clips were nobody's idea.

/** How many clips to keep pending. Deep enough to hide build time, shallow
 *  enough that a steer lands almost immediately. */
const TARGET_PENDING = 2;

const AUTO_TAG = JSON.stringify({ auto: true });

function isAuto(clip: H3Clip): boolean {
  return clip.metadata === AUTO_TAG;
}

interface SessionValue {
  draft: ShotDraft;
  setMode: (mode: Mode) => void;
  setSlotFile: (index: number, file: File | null) => void;
  setSlotDescription: (index: number, description: string) => void;
  addSlot: () => void;
  removeSlot: (index: number) => void;
  patchDraft: (patch: Partial<ShotDraft>) => void;
  problem: string | null;
  /** Queue the draft as the opening shot and start the session. */
  queueShot: () => Promise<void>;
  /** Steer: play this next, continuing from the latest generated clip. */
  steer: (action: string) => Promise<void>;
  /** Whether the session keeps generating on its own. */
  autoContinue: boolean;
  setAutoContinue: (on: boolean) => void;
  /** True while this mode can continue a scene at all (free mode is one-shot). */
  canContinue: boolean;
  busy: boolean;
  phase: "idle" | "connecting" | "uploading" | "queueing";
  hasQueued: boolean;
  lastAccepted: { clipId: string; seconds: number; seed: number } | null;
  loadingPreset: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession used outside SessionProvider");
  return value;
}

const EMPTY_DRAFT = (mode: Mode): ShotDraft => ({
  mode,
  slots: slotsForMode(mode),
  action: "",
  sound: "",
  seconds: 10,
  seed: "",
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const { status, connect, uploadFile, enqueue, pop, setAutoplay } = useH3();

  const [draft, setDraft] = useState<ShotDraft>(() =>
    EMPTY_DRAFT("one-subject"),
  );
  const [phase, setPhase] = useState<SessionValue["phase"]>("idle");
  const [hasQueued, setHasQueued] = useState(false);
  const [autoContinue, setAutoContinue] = useState(true);
  const [lastAccepted, setLastAccepted] =
    useState<SessionValue["lastAccepted"]>(null);
  const [uploaded, setUploaded] = useState<Map<number, FileRef>>(new Map());
  const [loadingPreset, setLoadingPreset] = useState(true);

  // Refs, not state: these are read inside callbacks that must not re-run just
  // because a queue count moved.
  const lastGenerated = useRef<string | null>(null);
  const queue = useRef<{ generation: H3Clip[]; playout: H3Clip[] }>({
    generation: [],
    playout: [],
  });
  const pending = useRef(0);
  const inFlight = useRef(false);
  const beat = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useH3ClipGenerated((m) => {
    lastGenerated.current = m.clip.clip_id;
  });
  useH3QueueUpdate((q) => {
    queue.current = { generation: q.generation, playout: q.playout };
  });

  const canContinue = draft.mode !== "free";

  /* ---------------------------------------------------------------- */
  /* Presets                                                           */
  /* ---------------------------------------------------------------- */

  const presetToken = useRef(0);
  const loadPreset = useCallback(async (mode: Mode) => {
    const token = ++presetToken.current;
    const preset = PRESETS[mode];
    setLoadingPreset(true);
    setUploaded(new Map());
    try {
      const files = await Promise.all(
        preset.slots.map((slot) => loadPresetFile(slot.src)),
      );
      if (token !== presetToken.current) return;
      setDraft({
        mode,
        slots: preset.slots.map((slot, i) => ({
          index: i + 1,
          role:
            i === preset.slots.length - 1 && mode === "two-subjects"
              ? ("place" as const)
              : ("subject" as const),
          hint:
            mode === "two-subjects"
              ? ["First subject", "Second subject", "The place"][i]
              : mode === "one-subject"
                ? "The subject"
                : "Reference",
          description: slot.description,
          file: files[i],
        })),
        action: preset.action,
        sound: preset.sound,
        seconds: preset.seconds,
        seed: "",
      });
    } catch {
      if (token === presetToken.current) setDraft(EMPTY_DRAFT(mode));
    } finally {
      if (token === presetToken.current) setLoadingPreset(false);
    }
  }, []);

  useEffect(() => {
    void loadPreset("one-subject");
  }, [loadPreset]);

  const setMode = useCallback(
    (mode: Mode) => {
      setDraft(EMPTY_DRAFT(mode));
      setUploaded(new Map());
      lastGenerated.current = null;
      setHasQueued(false);
      void loadPreset(mode);
    },
    [loadPreset],
  );

  /* ---------------------------------------------------------------- */
  /* Draft edits                                                       */
  /* ---------------------------------------------------------------- */

  const patchDraft = useCallback((patch: Partial<ShotDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const setSlotFile = useCallback((index: number, file: File | null) => {
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.index === index ? { ...s, file } : s)),
    }));
    setUploaded((prev) => {
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const setSlotDescription = useCallback(
    (index: number, description: string) => {
      setDraft((d) => ({
        ...d,
        slots: d.slots.map((s) =>
          s.index === index ? { ...s, description } : s,
        ),
      }));
    },
    [],
  );

  const addSlot = useCallback(() => {
    setDraft((d) => {
      if (d.slots.length >= 9) return d;
      return {
        ...d,
        slots: [
          ...d.slots,
          {
            index: d.slots.length + 1,
            role: "subject" as const,
            hint: "Reference",
            description: "",
            file: null,
          },
        ],
      };
    });
  }, []);

  const removeSlot = useCallback((index: number) => {
    setDraft((d) => {
      if (d.slots.length <= 1) return d;
      const slots = d.slots
        .filter((s) => s.index !== index)
        .map((s, i) => ({ ...s, index: i + 1 }));
      return { ...d, slots };
    });
    setUploaded(new Map());
  }, []);

  /* ---------------------------------------------------------------- */
  /* Sending                                                           */
  /* ---------------------------------------------------------------- */

  // Connect, turn autoplay on, and hand back the references in slot order.
  // Sequential, because slot order is what binds Picture N.
  const prepare = useCallback(async (): Promise<FileRef[]> => {
    if (status !== "ready") {
      setPhase("connecting");
      await connect();
      await setAutoplay({ enabled: true });
    }
    setPhase("uploading");
    const refs: FileRef[] = [];
    const next = new Map(uploaded);
    for (const slot of draftRef.current.slots) {
      if (!slot.file) continue;
      const held = next.get(slot.index);
      if (held) {
        refs.push(held);
        continue;
      }
      const ref = await uploadFile(slot.file);
      next.set(slot.index, ref);
      refs.push(ref);
    }
    setUploaded(next);
    return refs;
  }, [connect, setAutoplay, status, uploadFile, uploaded]);

  const send = useCallback(
    async (
      prompt: string,
      refs: FileRef[],
      opts: { continueFrom?: string; position?: number; auto?: boolean } = {},
    ) => {
      const d = draftRef.current;
      const reply = await enqueue({
        prompt,
        seconds: d.seconds,
        ...(opts.auto ? { metadata: AUTO_TAG } : {}),
        ...(refs.length === 1
          ? { reference_image: refs[0] }
          : { reference_images: refs }),
        ...(d.seed.trim() ? { seed: Number(d.seed) } : {}),
        ...(opts.continueFrom
          ? { continue_from_clip_id: opts.continueFrom }
          : {}),
        ...(opts.position !== undefined ? { position: opts.position } : {}),
      });
      // A refusal resolves undefined; the reason arrives as command_error.
      if (!reply) return null;
      setHasQueued(true);
      setLastAccepted({
        clipId: reply.clip.clip_id,
        seconds: reply.clip.seconds,
        seed: reply.clip.seed,
      });
      return reply.clip.clip_id;
    },
    [enqueue],
  );

  // Opening shot, and also "play this scene now" once the session is running.
  //
  // Mid-session it is a deliberate cut rather than a continuation: no
  // `continue_from_clip_id`, because the point of pressing it again is that the
  // composer changed. It still clears the automatic backlog and takes the front
  // of the queue, or a new scene would sit behind filler for the old one.
  const queueShot = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const running = hasQueued;
      if (running) {
        const stale = [
          ...queue.current.generation,
          ...queue.current.playout,
        ].filter(isAuto);
        for (const clip of stale) await pop({ clip_id: clip.clip_id });
      }
      const refs = await prepare();
      setPhase("queueing");
      await send(buildPrompt(draftRef.current), refs, {
        ...(running ? { position: 0 } : {}),
      });
    } finally {
      setPhase("idle");
      inFlight.current = false;
    }
  }, [hasQueued, pop, prepare, send]);

  // A steer plays next. Anything the session queued on its own is stale the
  // moment someone says what they want, so it is popped first — otherwise the
  // new clip waits behind filler. Position 0 puts it at the front of the build
  // queue, and it continues from the latest generated clip so the scene holds.
  const steer = useCallback(
    async (action: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const stale = [
          ...queue.current.generation,
          ...queue.current.playout,
        ].filter(isAuto);
        for (const clip of stale) await pop({ clip_id: clip.clip_id });

        const refs = await prepare();
        setPhase("queueing");
        await send(buildPrompt({ ...draftRef.current, action }, {
          continuing: true,
        }), refs, {
          continueFrom: lastGenerated.current ?? undefined,
          position: 0,
        });
        // Carry it forward so the next continuation follows this beat.
        setDraft((d) => ({ ...d, action }));
      } finally {
        setPhase("idle");
        inFlight.current = false;
      }
    },
    [pop, prepare, send],
  );

  /* ---------------------------------------------------------------- */
  /* Keeping the queue full                                            */
  /* ---------------------------------------------------------------- */

  // `state_update` fires on every queue change, which makes it the natural
  // clock for topping up. The guards matter more than the arithmetic: without
  // the in-flight ref this fires again before the first enqueue is accepted
  // and floods the queue.
  useH3StateUpdate((s) => {
    pending.current = s.generation_queued + s.playout_queued;
    if (!autoContinue || !canContinue || !hasQueued) return;
    if (status !== "ready" || inFlight.current) return;
    if (pending.current >= TARGET_PENDING) return;
    if (s.generation_queued >= s.generation_capacity) return;

    inFlight.current = true;
    void (async () => {
      try {
        const refs = await prepare();
        const next = CONTINUATION_BEATS[beat.current % CONTINUATION_BEATS.length];
        beat.current += 1;
        await send(
          buildPrompt({ ...draftRef.current, action: next }, { continuing: true }),
          refs,
          { continueFrom: lastGenerated.current ?? undefined, auto: true },
        );
      } finally {
        setPhase("idle");
        inFlight.current = false;
      }
    })();
  });

  const value = useMemo<SessionValue>(
    () => ({
      draft,
      setMode,
      setSlotFile,
      setSlotDescription,
      addSlot,
      removeSlot,
      patchDraft,
      problem: draftProblem(draft),
      queueShot,
      steer,
      autoContinue,
      setAutoContinue,
      canContinue,
      busy: phase !== "idle" || loadingPreset,
      phase,
      hasQueued,
      lastAccepted,
      loadingPreset,
    }),
    [
      addSlot,
      autoContinue,
      canContinue,
      draft,
      hasQueued,
      lastAccepted,
      loadingPreset,
      patchDraft,
      phase,
      queueShot,
      removeSlot,
      setMode,
      setSlotDescription,
      setSlotFile,
      steer,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export type { Slot };
