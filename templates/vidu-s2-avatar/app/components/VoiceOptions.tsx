import { CHARACTERS } from "../lib/characters";
import { systemVoices, voiceLabel, type Voice } from "../lib/call";
import type { ViduS2AvatarVoicesMessage } from "../lib/model";

const exampleVoices = new Set(CHARACTERS.map((character) => character.voice));

function options(voices: Voice[]) {
  return voices.map((entry) => (
    <option key={entry.voice} value={entry.voice}>
      {voiceLabel(entry)}
    </option>
  ));
}

export function VoiceOptions({ voices }: { voices: ViduS2AvatarVoicesMessage | null }) {
  const catalog = systemVoices(voices);
  if (catalog.length === 0) return <option value="">Loads on connect</option>;

  const featured = catalog.filter((entry) => exampleVoices.has(entry.voice));
  const others = catalog.filter((entry) => !exampleVoices.has(entry.voice));

  return (
    <>
      {featured.length > 0 && (
        <optgroup label="Example character voices">{options(featured)}</optgroup>
      )}
      {others.length > 0 && (
        <optgroup label={featured.length > 0 ? "More voices" : "Voices"}>
          {options(others)}
        </optgroup>
      )}
    </>
  );
}
