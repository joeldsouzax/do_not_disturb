"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { acceptsImage, SCENARIOS, type EditingType } from "../lib/edit";
import { referencesFor } from "../lib/library";
import { lookFromReference, useSession } from "../lib/session";

// Both phases: what the reference image is, and what it supplies.
//
// Before an edit, a pick sets the reference `start_edit` will send. During
// one, a pick is a `switch_reference`: the picture changes within a few
// seconds and the edit keeps running. Each scenario reads an image
// differently, so the library is split by scenario, and an upload is filed
// under the scenario tab it was added from.
export function ReferencePicker() {
  const { look, pending, busy, chooseLook, uploadLook } = useSession();
  const [tab, setTab] = useState<EditingType>(look.editingType);
  const [rejected, setRejected] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const scenario = SCENARIOS.find((entry) => entry.editingType === tab)!;
  const shown = pending ?? look;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Reference
        </span>
        <button
          onClick={() => input.current?.click()}
          disabled={busy === "switching"}
          className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        >
          Upload an image
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (!acceptsImage(file)) {
              setRejected(true);
              return;
            }
            setRejected(false);
            uploadLook(file, tab);
          }}
        />
      </div>

      <div className="grid grid-cols-4 overflow-hidden rounded-md border border-zinc-800 text-[11px]">
        {SCENARIOS.map((entry) => (
          <button
            key={entry.editingType}
            onClick={() => setTab(entry.editingType)}
            className={`px-1 py-1.5 ${
              tab === entry.editingType
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-zinc-500">{scenario.hint}</p>
      {rejected && (
        <p className="text-[11px] text-amber-300">
          Use a PNG, JPG or WEBP under 10 MB.
        </p>
      )}

      <div className="grid grid-cols-5 gap-2">
        {referencesFor(tab).map((reference) => {
          const selected = shown.key === reference.url;
          return (
            <button
              key={reference.id}
              onClick={() => chooseLook(lookFromReference(reference))}
              disabled={busy === "switching"}
              title={reference.label}
              className={`relative aspect-square overflow-hidden rounded-lg border disabled:cursor-wait ${
                selected ? "border-brand" : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <Image
                src={reference.url}
                alt={reference.label}
                fill
                sizes="72px"
                className="object-cover"
              />
            </button>
          );
        })}
      </div>

      <p className="truncate text-[11px] text-zinc-400">
        {pending ? "Applying " : "Selected: "}
        <span className="text-zinc-200">{shown.label}</span>
        {" · "}
        {SCENARIOS.find((entry) => entry.editingType === shown.editingType)?.label}
      </p>
    </section>
  );
}
