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
import { toReferenceImages, useH3 } from "./model";
import { loadPresetFile, PRESETS } from "./presets";
import {
  buildPrompt,
  draftProblem,
  slotsForMode,
  type Mode,
  type ShotDraft,
  type Slot,
} from "./shot";

// One place for the state the composer and the stage both need.
//
// The continuation flow is the reason this is shared: the box under the video
// has to reuse the references the composer already uploaded, keep the subject
// descriptions the user wrote, and know which clip just finished. Uploads are
// session scoped, so holding the FileRefs here means a follow-on shot costs no
// second upload.

interface SessionValue {
  draft: ShotDraft;
  setMode: (mode: Mode) => void;
  setSlotFile: (index: number, file: File | null) => void;
  setSlotDescription: (index: number, description: string) => void;
  addSlot: () => void;
  removeSlot: (index: number) => void;
  patchDraft: (patch: Partial<ShotDraft>) => void;
  problem: string | null;
  /** Queue the draft as a new, independent shot. */
  queueShot: () => Promise<void>;
  /** Queue a follow-on shot that continues from `fromClipId`. */
  continueShot: (action: string, fromClipId: string) => Promise<void>;
  busy: boolean;
  phase: "idle" | "connecting" | "uploading" | "queueing";
  /** Set once a clip has been queued, so the stage can stop explaining itself. */
  hasQueued: boolean;
  lastAccepted: { clipId: string; seconds: number; seed: number } | null;
  /** True while the mode's preset images are being fetched. */
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
  const { status, connect, uploadFile, enqueue, setAutoplay } = useH3();

  const [draft, setDraft] = useState<ShotDraft>(() =>
    EMPTY_DRAFT("one-subject"),
  );
  const [phase, setPhase] = useState<SessionValue["phase"]>("idle");
  const [hasQueued, setHasQueued] = useState(false);
  const [lastAccepted, setLastAccepted] =
    useState<SessionValue["lastAccepted"]>(null);

  // Uploaded references for the current shot, keyed by slot index, so a
  // continuation reuses them instead of uploading the same bytes again.
  const [uploaded, setUploaded] = useState<Map<number, FileRef>>(new Map());
  const [loadingPreset, setLoadingPreset] = useState(true);

  // Load a mode's preset: fetch the vendored images, then fill the slots. The
  // token guards against a fast mode switch landing an older fetch on top of a
  // newer one.
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
          role: i === preset.slots.length - 1 && mode === "two-subjects"
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
      // A missing preset image should not strand the form: fall back to the
      // empty layout for the mode so the app is still usable.
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
      void loadPreset(mode);
    },
    [loadPreset],
  );

  const patchDraft = useCallback((patch: Partial<ShotDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  }, []);

  const setSlotFile = useCallback((index: number, file: File | null) => {
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s) => (s.index === index ? { ...s, file } : s)),
    }));
    // A changed file invalidates the upload held for that slot.
    setUploaded((prev) => {
      const next = new Map(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const setSlotDescription = useCallback((index: number, description: string) => {
    setDraft((d) => ({
      ...d,
      slots: d.slots.map((s) =>
        s.index === index ? { ...s, description } : s,
      ),
    }));
  }, []);

  const addSlot = useCallback(() => {
    setDraft((d) => {
      if (d.slots.length >= 9) return d;
      const index = d.slots.length + 1;
      return {
        ...d,
        slots: [
          ...d.slots,
          {
            index,
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
      // Reindexing keeps Picture N contiguous, which is what the prompt says.
      const slots = d.slots
        .filter((s) => s.index !== index)
        .map((s, i) => ({ ...s, index: i + 1 }));
      return { ...d, slots };
    });
    setUploaded(new Map());
  }, []);

  // Connect, turn autoplay on, and hand back the uploaded references in slot
  // order. Order is what binds Picture N, so the uploads are sequential.
  const prepare = useCallback(async (): Promise<FileRef[]> => {
    if (status !== "ready") {
      setPhase("connecting");
      await connect();
      // Ready clips should start on their own — nobody should have to hunt for
      // a play button to see the thing they just asked for.
      await setAutoplay({ enabled: true });
    }
    setPhase("uploading");
    const refs: FileRef[] = [];
    const next = new Map(uploaded);
    for (const slot of draft.slots) {
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
  }, [connect, draft.slots, setAutoplay, status, uploadFile, uploaded]);

  const send = useCallback(
    async (prompt: string, refs: FileRef[], continueFrom?: string) => {
      setPhase("queueing");
      const reply = await enqueue({
        prompt,
        seconds: draft.seconds,
        // One reference rides the plain FileRef path. A list has to be built
        // into the wire shape by hand — see toReferenceImages.
        ...(refs.length === 1
          ? { reference_image: refs[0] }
          : { reference_images: toReferenceImages(refs) }),
        ...(draft.seed.trim() ? { seed: Number(draft.seed) } : {}),
        ...(continueFrom ? { continue_from_clip_id: continueFrom } : {}),
      });
      // A refused command resolves undefined rather than throwing; the reason
      // arrives as a command_error broadcast.
      if (reply) {
        setHasQueued(true);
        setLastAccepted({
          clipId: reply.clip.clip_id,
          seconds: reply.clip.seconds,
          seed: reply.clip.seed,
        });
      }
    },
    [draft.seconds, draft.seed, enqueue],
  );

  const queueShot = useCallback(async () => {
    try {
      const refs = await prepare();
      await send(buildPrompt(draft), refs);
    } finally {
      setPhase("idle");
    }
  }, [draft, prepare, send]);

  const continueShot = useCallback(
    async (action: string, fromClipId: string) => {
      try {
        const refs = await prepare();
        const prompt = buildPrompt({ ...draft, action }, { continuing: true });
        await send(prompt, refs, fromClipId);
        // Carry the new action forward so a third shot continues from this one.
        setDraft((d) => ({ ...d, action }));
      } finally {
        setPhase("idle");
      }
    },
    [draft, prepare, send],
  );

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
      continueShot,
      busy: phase !== "idle" || loadingPreset,
      phase,
      hasQueued,
      lastAccepted,
      loadingPreset,
    }),
    [
      addSlot,
      continueShot,
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
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export type { Slot };
