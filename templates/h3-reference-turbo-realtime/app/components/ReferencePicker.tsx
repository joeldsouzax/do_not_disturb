"use client";

import { useEffect, useMemo } from "react";
import { MAX_REFERENCES } from "../lib/model";

// The reference set for one clip, in order.
//
// Order is the whole point: the first image is `Picture 1` in the prompt, the
// second is `Picture 2`, and so on. So this list is reorderable and every
// thumbnail shows the name the prompt has to use.
//
// Files are held locally and uploaded at queue time, not here. Uploading
// needs a live session, and a session that exists only to hold an image the
// user may still remove is a session burning budget for nothing.
export interface ReferencePickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp";

export function ReferencePicker({
  files,
  onChange,
  disabled,
}: ReferencePickerProps) {
  // Object URLs are revoked when the set changes, or the previews leak.
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  useEffect(
    () => () => previews.forEach((p) => URL.revokeObjectURL(p.url)),
    [previews],
  );

  const full = files.length >= MAX_REFERENCES;

  function add(selected: FileList | null) {
    if (!selected?.length) return;
    onChange([...files, ...Array.from(selected)].slice(0, MAX_REFERENCES));
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const next = [...files];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          References
        </span>
        <span className="font-mono text-[11px] text-zinc-500">
          {files.length}/{MAX_REFERENCES}
        </span>
      </div>

      {previews.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {previews.map(({ file, url }, index) => (
            <li
              key={`${file.name}-${index}`}
              className="overflow-hidden rounded-md border border-zinc-800 bg-black/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Picture ${index + 1}`}
                className="aspect-square w-full object-cover"
              />
              <div className="flex items-center justify-between px-1.5 py-1">
                <span className="font-mono text-[10px] text-zinc-400">
                  Picture {index + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => move(index, -1)}
                    disabled={disabled || index === 0}
                    title="Move earlier"
                    className="px-1 text-[10px] text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === files.length - 1}
                    title="Move later"
                    className="px-1 text-[10px] text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                  >
                    →
                  </button>
                  <button
                    onClick={() => removeAt(index)}
                    disabled={disabled}
                    title="Remove"
                    className="px-1 text-[10px] text-zinc-500 hover:text-red-400 disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label
        className={`rounded-md border border-dashed border-zinc-700 px-3 py-2 text-center text-xs ${
          disabled || full
            ? "text-zinc-600"
            : "cursor-pointer text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        }`}
      >
        {full ? `Nine references is the limit` : "Add reference images"}
        <input
          type="file"
          accept={ACCEPT}
          multiple
          disabled={disabled || full}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
      </label>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        JPEG, PNG, or WebP. Every clip needs at least one. Name them in the
        prompt as <span className="font-mono">Picture 1</span>,{" "}
        <span className="font-mono">Picture 2</span>, and so on — the order
        here is the order the prompt refers to.
      </p>
    </div>
  );
}
