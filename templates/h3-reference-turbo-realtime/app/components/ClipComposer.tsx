"use client";

import { useState } from "react";
import {
  CANVASES,
  MAX_PROMPT_CHARS,
  toReferenceImages,
  useH3,
  useH3ClipGenerated,
  useH3StateUpdate,
  type H3Aspect,
  type H3State,
} from "../lib/model";
import { SCENE_PRESETS } from "../lib/prompts";
import { ReferencePicker } from "./ReferencePicker";

// Compose one clip and put it on the queue.
//
// The order of operations in `queueClip` is the part worth copying:
//
//   connect → upload references in order → enqueue → read the reply
//
// Uploading needs a live session, so the connect comes first. The uploads are
// sequential on purpose: the list order is what binds `Picture 1` to the first
// image, and `Promise.all` would not preserve it.
export function ClipComposer() {
  const { status, connect, uploadFile, enqueue, setAutoplay, setCanvas } =
    useH3();

  const [state, setState] = useState<H3State | null>(null);
  useH3StateUpdate(setState);
  // Clearing on disconnect is mandatory: the SDK sends no final snapshot, so a
  // stale one would keep the UI claiming capacity the session no longer has.
  if (status !== "ready" && state) setState(null);

  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  useH3ClipGenerated((m) => setLastGenerated(m.clip.clip_id));

  const [prompt, setPrompt] = useState(SCENE_PRESETS[0].prompt);
  const [files, setFiles] = useState<File[]>([]);
  const [seconds, setSeconds] = useState(10);
  const [seed, setSeed] = useState("");
  const [continueFromLast, setContinueFromLast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const canSetCanvas = state?.valid_commands.includes("set_canvas") ?? false;
  const generationFull =
    state !== null && state.generation_queued >= state.generation_capacity;

  const problem =
    files.length === 0
      ? "Add at least one reference image."
      : !prompt.trim()
        ? "Describe what the clip should show and sound like."
        : prompt.length > MAX_PROMPT_CHARS
          ? `Keep the prompt within ${MAX_PROMPT_CHARS.toLocaleString()} characters.`
          : generationFull
            ? "The generation queue is full. Wait for a build to finish."
            : null;

  async function queueClip() {
    if (busy || problem) return;
    setBusy(true);
    setNote(null);
    try {
      // A session has to exist before anything can be uploaded to it.
      if (status !== "ready") await connect();

      // Sequential, because order binds Picture N.
      const refs = [];
      for (const file of files) refs.push(await uploadFile(file));

      const reply = await enqueue({
        prompt,
        seconds,
        // One reference is the plain FileRef path; a list has to be built into
        // the wire shape by hand. See toReferenceImages for why.
        ...(refs.length === 1
          ? { reference_image: refs[0] }
          : { reference_images: toReferenceImages(refs) }),
        ...(seed.trim() ? { seed: Number(seed) } : {}),
        ...(continueFromLast && lastGenerated
          ? { continue_from_clip_id: lastGenerated }
          : {}),
      });

      // A refused command resolves undefined — it does not throw. The reason
      // arrives as a `command_error` broadcast, which CommandError shows.
      if (!reply) return;

      setNote(
        `Queued ${reply.clip.clip_id.slice(0, 8)} · ${reply.clip.seconds.toFixed(2)}s · seed ${reply.clip.seed}`,
      );
      setFiles([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        Compose a clip
      </span>

      <div className="flex flex-wrap gap-1.5">
        {SCENE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setPrompt(preset.prompt)}
            title={`${preset.blurb} Expects ${preset.references} reference${preset.references === 1 ? "" : "s"}.`}
            className="rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-zinc-100"
          >
            {preset.title}
          </button>
        ))}
      </div>

      <ReferencePicker files={files} onChange={setFiles} disabled={busy} />

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Prompt
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            {prompt.length.toLocaleString()}/
            {MAX_PROMPT_CHARS.toLocaleString()}
          </span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          spellCheck={false}
          className="w-full resize-y rounded-md border border-zinc-800 bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-zinc-200 outline-none focus:border-zinc-600"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Seconds
          </span>
          <input
            type="number"
            min={state?.clip_seconds_min ?? 5}
            max={state?.clip_seconds_max ?? 15.084}
            step={0.5}
            value={seconds}
            onChange={(e) => setSeconds(Number(e.target.value))}
            className="rounded-md border border-zinc-800 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-600"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Seed (optional)
          </span>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={state ? String(state.seed) : "auto"}
            className="rounded-md border border-zinc-800 bg-black/40 px-2 py-1 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-600"
          />
        </label>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        The request is rounded to a supported length, so the accepted duration
        can differ slightly — the reply reports what you actually got. Leave the
        seed blank to take the session default and advance it; set one to
        re-roll the same scene without disturbing that default.
      </p>

      <div className="flex flex-col gap-1.5 border-t border-zinc-800 pt-2">
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={continueFromLast}
            disabled={!lastGenerated}
            onChange={(e) => setContinueFromLast(e.target.checked)}
          />
          Continue from the last built clip
        </label>
        {continueFromLast && (
          <p className="text-[11px] leading-relaxed text-zinc-600">
            Motion, camera, and audio carry across the boundary. Write this
            prompt as the next stretch of the same shot, and describe any
            subject whose state changed in the previous clip.
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={state?.autoplay ?? false}
              disabled={status !== "ready"}
              onChange={(e) => void setAutoplay({ enabled: e.target.checked })}
            />
            Autoplay ready clips
          </label>

          <select
            value={state?.aspect ?? "16:9"}
            disabled={!canSetCanvas}
            onChange={(e) =>
              void setCanvas({ aspect: e.target.value as H3Aspect })
            }
            title={
              canSetCanvas
                ? "Set the output canvas"
                : "The canvas can only change while both queues are empty and nothing is playing"
            }
            className="rounded-md border border-zinc-800 bg-black/40 px-2 py-1 font-mono text-[11px] text-zinc-200 disabled:opacity-40"
          >
            {CANVASES.map((c) => (
              <option key={c.aspect} value={c.aspect}>
                {c.aspect} · {c.width}×{c.height}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={() => void queueClip()}
        disabled={busy || problem !== null}
        className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-40"
      >
        {busy
          ? status !== "ready"
            ? "Connecting…"
            : "Uploading and queueing…"
          : "Queue clip"}
      </button>

      {problem && <p className="text-[11px] text-amber-400">{problem}</p>}
      {note && <p className="font-mono text-[11px] text-zinc-500">{note}</p>}
    </div>
  );
}
