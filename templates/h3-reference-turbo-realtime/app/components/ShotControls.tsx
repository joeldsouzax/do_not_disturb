"use client";

import { useSession } from "../lib/session";
import { DURATIONS } from "../lib/shot";

// Duration and seed.
//
// Both are pickers rather than number boxes because both have a small set of
// sensible answers. The duration you ask for is rounded to the model's own
// frame grid, so the accepted value can differ by a fraction of a second —
// the reply reports what you actually got, and the stage shows it.
export function ShotControls() {
  const { draft, patchDraft, busy } = useSession();
  const seedFixed = draft.seed.trim() !== "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Length
        </span>
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
          {DURATIONS.map((value) => {
            const active = draft.seconds === value;
            return (
              <button
                key={value}
                onClick={() => patchDraft({ seconds: value })}
                disabled={busy}
                className={`flex-1 rounded-md px-1 py-1 font-mono text-[11px] transition-colors disabled:opacity-40 ${
                  active
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                {value}s
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">
            Seed
          </span>
          <span className="text-[10px] text-zinc-600">
            {seedFixed ? "same seed, same take" : "a new take each time"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
            <button
              onClick={() => patchDraft({ seed: "" })}
              disabled={busy}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                !seedFixed
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              Auto
            </button>
            <button
              onClick={() =>
                patchDraft({
                  seed: String(Math.floor(Math.random() * 100_000)),
                })
              }
              disabled={busy}
              className={`flex-1 rounded-md px-2 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                seedFixed
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              Fixed
            </button>
          </div>
          {seedFixed && (
            <>
              <input
                value={draft.seed}
                onChange={(e) =>
                  patchDraft({ seed: e.target.value.replace(/[^0-9]/g, "") })
                }
                disabled={busy}
                className="w-20 rounded-lg border border-zinc-800 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-zinc-600"
              />
              <button
                onClick={() =>
                  patchDraft({
                    seed: String(Math.floor(Math.random() * 100_000)),
                  })
                }
                disabled={busy}
                title="Roll a new seed"
                className="rounded-lg border border-zinc-800 px-2 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
              >
                Roll
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
