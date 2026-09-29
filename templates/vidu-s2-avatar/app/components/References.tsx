"use client";

import { useState } from "react";
import {
  callLive,
  LIMITS,
  referencesInEffect,
  type ReferenceInEffect,
  type ReferenceKind,
} from "../lib/call";
import { exampleReferences, exampleThumbnail } from "../lib/references";
import { useSession } from "../lib/session";

const KINDS: ReadonlyArray<{ kind: ReferenceKind; label: string }> = [
  { kind: "object", label: "Objects" },
  { kind: "garment", label: "Outfits" },
  { kind: "background", label: "Backgrounds" },
];
const EXAMPLES = KINDS.flatMap(({ kind }) => exampleReferences(kind));

// The snapshot is the source of truth. Some snapshots only include image_id.
function kindOf(reference: ReferenceInEffect): ReferenceKind | null {
  return (
    KINDS.find(({ kind }) => kind === reference.kind)?.kind ??
    EXAMPLES.find(({ id }) => id === reference.image_id)?.kind ??
    KINDS.find(({ kind }) => reference.image_id.startsWith(`${kind}-`))?.kind ??
    null
  );
}

function labelOf(reference: ReferenceInEffect): string {
  return (
    EXAMPLES.find(({ id }) => id === reference.image_id)?.label ??
    `Custom ${kindOf(reference) ?? "image"}`
  );
}

export function References() {
  const { snapshot, addReference, clearReference } = useSession();
  const [kind, setKind] = useState<ReferenceKind>("object");
  const [url, setURL] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!callLive(snapshot)) return null;
  const inEffect = referencesInEffect(snapshot);
  const current = inEffect.find((reference) => kindOf(reference) === kind);
  const full = inEffect.length >= LIMITS.referenceImages && !current;

  async function apply(reference: {
    url: string;
    kind: ReferenceKind;
    text: string;
    imageID?: string;
  }) {
    const previous = inEffect.find((entry) => kindOf(entry) === reference.kind);
    setSending(true);
    setError(null);
    try {
      if (previous && previous.image_id === reference.imageID) {
        await clearReference(previous.image_id);
        return;
      }
      if (previous && !(await clearReference(previous.image_id))) return;
      const applied = await addReference(reference);
      if (applied && !reference.imageID) {
        setURL("");
        setText("");
      }
    } catch {
      setError("The image could not be applied. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function remove(imageID: string) {
    setSending(true);
    setError(null);
    try {
      await clearReference(imageID);
    } catch {
      setError("The image could not be removed. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div>
        <h2 className="text-xs font-medium text-zinc-100">Change the scene</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          Give the character something to hold, wear, or stand in.
        </p>
      </div>

      <div className="grid grid-cols-3 overflow-hidden rounded-md border border-zinc-800 text-xs">
        {KINDS.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            aria-pressed={kind === entry.kind}
            onClick={() => setKind(entry.kind)}
            className={`py-2 ${kind === entry.kind
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {exampleReferences(kind).map((reference) => {
          const active = inEffect.some((entry) => entry.image_id === reference.id);
          return (
            <button
              key={reference.id}
              type="button"
              aria-label={`${active ? "Remove" : "Apply"} ${reference.label}`}
              aria-pressed={active}
              title={reference.text}
              disabled={sending || (full && !active)}
              onClick={() => void apply({
                url: reference.url,
                kind: reference.kind,
                text: reference.text,
                imageID: reference.id,
              })}
              className={`group overflow-hidden rounded-lg border text-left transition-colors disabled:opacity-40 ${active
                ? "border-brand bg-brand/10"
                : "border-zinc-800 bg-black/30 hover:border-zinc-600"}`}
            >
              <span
                aria-hidden="true"
                className="block aspect-square bg-zinc-800 bg-cover bg-center"
                style={{ backgroundImage: `url("${exampleThumbnail(reference)}")` }}
              />
              <span className="block truncate px-1.5 py-1.5 text-[10px] text-zinc-300">
                {reference.label}
              </span>
            </button>
          );
        })}
      </div>

      <details className="rounded-md border border-zinc-800 px-2.5 py-2">
        <summary className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200">
          Use your own public image URL
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <input
            aria-label="Reference image URL"
            value={url}
            onChange={(event) => setURL(event.target.value)}
            placeholder="https://…"
            className="rounded-md border border-zinc-800 bg-black/40 p-2 text-xs text-zinc-200 placeholder:text-zinc-600"
          />
          <input
            aria-label="Reference image instruction"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={LIMITS.referenceText}
            placeholder="Optional instruction, like ‘Hold this’"
            className="rounded-md border border-zinc-800 bg-black/40 p-2 text-xs text-zinc-200 placeholder:text-zinc-600"
          />
          <button
            type="button"
            disabled={sending || full || !/^https?:\/\//.test(url.trim())}
            onClick={() => void apply({ url, kind, text })}
            className="rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            Apply image
          </button>
          <p className="text-[10px] leading-relaxed text-zinc-500">
            The generation service fetches this URL directly, so localhost images cannot be used here.
          </p>
        </div>
      </details>

      {inEffect.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-zinc-800 pt-2">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            In the scene
          </span>
          {inEffect.map((reference) => (
            <div key={reference.image_id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-zinc-300">{labelOf(reference)}</span>
              <button
                type="button"
                disabled={sending}
                onClick={() => void remove(reference.image_id)}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-[11px] text-rose-300">{error}</p>}
    </section>
  );
}
