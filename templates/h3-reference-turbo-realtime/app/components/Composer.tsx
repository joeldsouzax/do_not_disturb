"use client";

import { useState } from "react";
import {
  estimateTokens,
  PROMPT_TOKEN_BUDGET,
  useH3,
  useH3StateUpdate,
  type H3State,
} from "../lib/model";
import { useSession } from "../lib/session";
import { MAX_SLOTS } from "../lib/shot";
import { ModeTabs } from "./ModeTabs";
import { ReferenceSlot } from "./ReferenceSlot";
import { ShotControls } from "./ShotControls";

const SUBJECT_PLACEHOLDER =
  "Who is this? Face, hair, clothing, anything they carry.";
const PLACE_PLACEHOLDER =
  "Where is this? Architecture, surfaces, time of day, light.";

const ACTION_LABEL: Record<string, string> = {
  "one-subject": "The shot",
  "two-subjects": "The shot",
  free: "Prompt",
};

const ACTION_PLACEHOLDER: Record<string, string> = {
  "one-subject":
    "What happens, and how the camera moves. One thing, done clearly.",
  "two-subjects":
    "What the two of them do, where the camera is, and how it moves.",
  free: "Write the whole prompt. Refer to your references as Picture 1, Picture 2, and so on.",
};

export function Composer() {
  const {
    draft,
    setSlotFile,
    setSlotDescription,
    addSlot,
    removeSlot,
    patchDraft,
    problem,
    queueShot,
    busy,
    phase,
    loadingPreset,
  } = useSession();

  const { status } = useH3();
  const [state, setState] = useState<H3State | null>(null);
  useH3StateUpdate(setState);
  if (status !== "ready" && state) setState(null);

  const free = draft.mode === "free";
  const canAdd = free && draft.slots.length < MAX_SLOTS;

  const tokens = estimateTokens(draft.action);
  const overBudget = tokens > PROMPT_TOKEN_BUDGET;

  // While a clip is building or playing, offering "Generate" again reads as an
  // instruction rather than an option — the honest answer to "should I click
  // this?" is no. The stage already says what is happening, so the button
  // stands down and says why, and comes back the moment the queue is idle.
  const inFlight =
    (state?.generation_queued ?? 0) > 0 ||
    (state?.playout_queued ?? 0) > 0 ||
    (state?.playing ?? false);

  const buttonLabel =
    phase === "connecting"
      ? "Connecting…"
      : phase === "uploading"
        ? "Uploading references…"
        : phase === "queueing"
          ? "Queueing…"
          : loadingPreset
            ? "Loading scene…"
            : "Generate and play";

  return (
    <div className="flex flex-col gap-4">
      <ModeTabs />

      <div className="flex flex-col gap-2">
        {draft.slots.map((slot) => (
          <ReferenceSlot
            key={slot.index}
            slot={slot}
            showDescription={!free}
            descriptionPlaceholder={
              slot.role === "place" ? PLACE_PLACEHOLDER : SUBJECT_PLACEHOLDER
            }
            onFile={(file) => setSlotFile(slot.index, file)}
            onDescription={(value) => setSlotDescription(slot.index, value)}
            onRemove={
              free && draft.slots.length > 1
                ? () => removeSlot(slot.index)
                : undefined
            }
            disabled={busy}
          />
        ))}

        {canAdd && (
          <button
            onClick={addSlot}
            disabled={busy}
            className="rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-40"
          >
            Add another reference · {draft.slots.length}/{MAX_SLOTS}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            {ACTION_LABEL[draft.mode]}
          </span>
          <span
            className={`font-mono text-[10px] ${
              overBudget ? "text-amber-400" : "text-zinc-600"
            }`}
            title="Approximate. The prompt is bounded by the model's text budget, not by characters — a prompt past it fails the build rather than being refused."
          >
            ~{tokens.toLocaleString()}/{PROMPT_TOKEN_BUDGET.toLocaleString()}{" "}
            tokens
          </span>
        </div>
        <textarea
          value={draft.action}
          onChange={(e) => patchDraft({ action: e.target.value })}
          disabled={busy}
          rows={free ? 10 : 4}
          placeholder={ACTION_PLACEHOLDER[draft.mode]}
          className={`w-full resize-y rounded-lg border border-zinc-800 bg-black/40 px-2.5 py-2 leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600 ${
            free ? "font-mono text-[11px]" : "text-xs"
          }`}
        />
      </div>

      {!free && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Sound <span className="text-zinc-600">· optional</span>
          </span>
          <input
            value={draft.sound}
            onChange={(e) => patchDraft({ sound: e.target.value })}
            disabled={busy}
            placeholder="What the scene sounds like."
            className="w-full rounded-lg border border-zinc-800 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
          />
        </div>
      )}

      <ShotControls />

      {inFlight && !busy && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
          {state?.playing ? "Playing" : "Generating"} — steer it under the video
        </div>
      )}

      <button
        onClick={() => void queueShot()}
        disabled={busy || problem !== null}
        className={
          inFlight
            ? "rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:text-zinc-100 disabled:opacity-40"
            : "rounded-lg bg-brand px-3 py-2.5 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        }
      >
        {inFlight && !busy ? "Play this scene next" : buttonLabel}
      </button>

      {problem && !inFlight && (
        <p className="text-[11px] text-amber-400">{problem}</p>
      )}

      {overBudget && !problem && !inFlight && (
        <p className="text-[11px] leading-relaxed text-amber-400">
          This prompt is probably past the model&apos;s text budget. It will be
          accepted and then fail the build, so trim it before spending a
          generation on it.
        </p>
      )}
    </div>
  );
}
