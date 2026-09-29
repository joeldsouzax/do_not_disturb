"use client";

import Image from "next/image";
import { useRef } from "react";
import { callActive } from "../lib/call";
import { CHARACTERS } from "../lib/characters";
import { useSession } from "../lib/session";

// Setup phase: pick who you are calling.
//
// Picking connects the session and builds the character, which takes a few
// seconds, so it happens now rather than when you press Start. An example
// also fills in the persona, greeting and voice; an upload leaves them to
// you. The model wants one person, full or half body, as PNG, JPG, WEBP or
// HEIC under 20 MB; a phone photo arrives upright, because the model applies
// its EXIF orientation. The input accepts any image: an iPhone's HEIC does
// not always carry a MIME type a narrower list would match.
export function CharacterPicker() {
  const { phase, photo, busy, chooseCharacter, choosePhoto } = useSession();
  const input = useRef<HTMLInputElement>(null);

  if (callActive(phase)) return null;
  const locked = busy !== null || phase === "preparing_avatar";

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          Character
        </span>
        <button
          onClick={() => input.current?.click()}
          disabled={locked}
          className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-900 disabled:opacity-40"
        >
          Upload a photo
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) choosePhoto(file);
          }}
        />
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {CHARACTERS.map((character) => {
          const selected = photo?.key === character.id;
          return (
            <button
              key={character.id}
              onClick={() => chooseCharacter(character)}
              disabled={locked}
              title={character.name}
              className={`group relative aspect-square overflow-hidden rounded-lg border disabled:cursor-wait ${
                selected
                  ? "border-brand"
                  : "border-zinc-800 hover:border-zinc-600"
              }`}
            >
              <Image
                src={character.portrait}
                alt={character.name}
                fill
                sizes="80px"
                className="object-cover"
              />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[9px] text-zinc-200">
                {character.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
