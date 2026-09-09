"use client";

import { useEffect, useMemo, useState } from "react";
import type { Slot } from "../lib/shot";

// One reference and the words that go with it.
//
// The `Picture N` badge sits on the thumbnail rather than in a paragraph of
// instructions, because that binding is the one thing a reader has to
// internalise: whatever this image is, the prompt calls it Picture N. Showing
// it on the image itself is the whole explanation.
export interface ReferenceSlotProps {
  slot: Slot;
  /** Hidden in free mode, where the prompt is written by hand. */
  showDescription?: boolean;
  descriptionPlaceholder?: string;
  onFile: (file: File | null) => void;
  onDescription: (value: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp";

export function ReferenceSlot({
  slot,
  showDescription = true,
  descriptionPlaceholder,
  onFile,
  onDescription,
  onRemove,
  disabled,
}: ReferenceSlotProps) {
  const [dragging, setDragging] = useState(false);

  const preview = useMemo(
    () => (slot.file ? URL.createObjectURL(slot.file) : null),
    [slot.file],
  );
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function take(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2.5 py-1.5">
        <span className="text-[11px] font-medium text-zinc-300">
          {slot.hint}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">
            Picture {slot.index}
          </span>
          {onRemove && (
            <button
              onClick={onRemove}
              disabled={disabled}
              title="Remove this reference"
              className="text-xs text-zinc-600 hover:text-red-400 disabled:opacity-30"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2.5 p-2.5">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) take(e.dataTransfer.files);
          }}
          className={`relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border text-center transition-colors ${
            disabled ? "cursor-default" : "cursor-pointer"
          } ${
            dragging
              ? "border-brand bg-brand/10"
              : preview
                ? "border-zinc-700"
                : "border-dashed border-zinc-700 hover:border-zinc-500"
          }`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`Picture ${slot.index}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="px-1 text-[10px] leading-tight text-zinc-500">
              Drop or
              <br />
              choose
            </span>
          )}
          <input
            type="file"
            accept={ACCEPT}
            disabled={disabled}
            onChange={(e) => {
              take(e.target.files);
              e.target.value = "";
            }}
            className="hidden"
          />
        </label>

        {showDescription ? (
          <textarea
            value={slot.description}
            onChange={(e) => onDescription(e.target.value)}
            disabled={disabled}
            rows={3}
            placeholder={descriptionPlaceholder}
            className="min-w-0 flex-1 resize-none rounded-md border border-zinc-800 bg-black/40 px-2 py-1.5 text-xs leading-relaxed text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
          />
        ) : (
          <p className="flex-1 self-center text-[11px] leading-relaxed text-zinc-500">
            Call this{" "}
            <span className="font-mono text-zinc-400">
              Picture {slot.index}
            </span>{" "}
            in your prompt.
          </p>
        )}
      </div>
    </div>
  );
}
