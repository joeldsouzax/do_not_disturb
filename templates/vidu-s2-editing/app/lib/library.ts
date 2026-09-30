// Reference images bundled under public/references/ so they display and
// upload during local development without depending on the CDN.
//
// Each scenario reads the image differently, so an image belongs to one:
// a whole-scene look for `style_transfer`, a garment for `virtual_tryon`,
// a character for `subject_replacement`, a place for
// `background_replacement`. Swap in your own images the same way; a file
// under this app's public/ folder works because the app uploads the image
// rather than sending its URL.

import type { EditingType } from "./edit";

const CDN = "https://inc-reactor-static.b-cdn.net";

export interface Reference {
  id: string;
  label: string;
  editingType: EditingType;
  url: string;
}

const LIBRARY: Record<EditingType, ReadonlyArray<{ id: string; label: string; path: string }>> = {
  subject_replacement: [
    { id: "marble-statue", label: "Marble Statue", path: "vidu/editing/character-swap/marble-statue.jpg" },
    { id: "claymation-grandpa", label: "Claymation Grandpa", path: "vidu/editing/character-swap/claymation-grandpa.jpg" },
    { id: "knight", label: "Knight", path: "vidu/editing/character-swap/knight.jpg" },
    { id: "office-retriever", label: "Office Retriever", path: "vidu/editing/character-swap/office-retriever.jpg" },
    { id: "astronaut", label: "Astronaut", path: "vidu/editing/character-swap/astronaut.jpg" },
    { id: "garden-gnome", label: "Garden Gnome", path: "vidu/editing/character-swap/garden-gnome.jpg" },
    { id: "silent-film-star", label: "Silent Film Star", path: "vidu/editing/character-swap/silent-film-star.jpg" },
    { id: "forest-spirit", label: "Forest Spirit", path: "vidu/editing/character-swap/forest-spirit.jpg" },
    { id: "balloon-figure", label: "Balloon Figure", path: "vidu/editing/character-swap/balloon-figure.jpg" },
    { id: "luchador-grandma", label: "Luchador Grandma", path: "vidu/editing/character-swap/luchador-grandma.jpg" },
  ],
  virtual_tryon: [
    { id: "lobster-costume", label: "Lobster Costume", path: "vidu/editing/virtual-try-on/lobster-costume.jpg" },
    { id: "royal-crown", label: "Royal Crown", path: "vidu/editing/virtual-try-on/royal-crown.jpg" },
    { id: "sunflower-hat", label: "Sunflower Hat", path: "vidu/editing/virtual-try-on/sunflower-hat.jpg" },
    { id: "hazmat-suit", label: "Hazmat Suit", path: "vidu/editing/virtual-try-on/hazmat-suit.jpg" },
    { id: "sequin-tuxedo", label: "Sequin Tuxedo", path: "vidu/editing/virtual-try-on/sequin-tuxedo.jpg" },
    { id: "chef-hat", label: "Chef's Hat", path: "vidu/editing/virtual-try-on/chef-hat.jpg" },
    { id: "viking-helmet", label: "Viking Helmet", path: "vidu/editing/virtual-try-on/viking-helmet.jpg" },
    { id: "dinosaur-suit", label: "Dinosaur Suit", path: "vidu/editing/virtual-try-on/dinosaur-suit.jpg" },
    { id: "tinfoil-hat", label: "Tinfoil Hat", path: "vidu/editing/virtual-try-on/tinfoil-hat.jpg" },
    { id: "rainbow-wig", label: "Rainbow Wig", path: "vidu/editing/virtual-try-on/rainbow-wig.jpg" },
  ],
  style_transfer: [
    { id: "claymation", label: "Claymation", path: "vidu/editing/style-transfer/claymation.jpg" },
    { id: "stained-glass", label: "Stained Glass", path: "vidu/editing/style-transfer/stained-glass.jpg" },
    { id: "ukiyo-e", label: "Ukiyo-e", path: "vidu/editing/style-transfer/ukiyo-e.jpg" },
    { id: "blueprint", label: "Blueprint", path: "vidu/editing/style-transfer/blueprint.jpg" },
    { id: "anime", label: "Anime", path: "vidu/editing/style-transfer/anime.jpg" },
    { id: "impasto", label: "Impasto", path: "vidu/editing/style-transfer/impasto.jpg" },
    { id: "charcoal", label: "Charcoal", path: "vidu/editing/style-transfer/charcoal.jpg" },
    { id: "bauhaus", label: "Bauhaus", path: "vidu/editing/style-transfer/bauhaus.jpg" },
    { id: "neon-cyberpunk", label: "Neon Cyberpunk", path: "vidu/editing/style-transfer/neon-cyberpunk.jpg" },
    { id: "risograph", label: "Risograph", path: "vidu/editing/style-transfer/risograph.jpg" },
  ],
  background_replacement: [
    { id: "mars", label: "Mars", path: "vidu/editing/background-swap/mars.jpg" },
    { id: "coral-reef", label: "Coral Reef", path: "vidu/editing/background-swap/coral-reef.jpg" },
    { id: "snow-globe", label: "Snow Globe", path: "vidu/editing/background-swap/snow-globe.jpg" },
    { id: "news-desk", label: "News Desk", path: "vidu/editing/background-swap/news-desk.jpg" },
    { id: "eighties-mall", label: "80s Mall", path: "vidu/editing/background-swap/eighties-mall.jpg" },
    { id: "tokyo-alley", label: "Tokyo Alley", path: "vidu/editing/background-swap/tokyo-alley.jpg" },
    { id: "old-library", label: "Old Library", path: "vidu/editing/background-swap/old-library.jpg" },
    { id: "spaceship-bridge", label: "Spaceship Bridge", path: "vidu/editing/background-swap/spaceship-bridge.jpg" },
    { id: "jungle-waterfall", label: "Jungle Waterfall", path: "vidu/editing/background-swap/jungle-waterfall.jpg" },
    { id: "cloud-kingdom", label: "Cloud Kingdom", path: "vidu/editing/background-swap/cloud-kingdom.jpg" },
  ],
};

export function referencesFor(editingType: EditingType): Reference[] {
  return LIBRARY[editingType].map((entry) => ({
    id: entry.id,
    label: entry.label,
    editingType,
    url: `/references/${entry.path.replace(/^vidu\/editing\//, "")}`,
  }));
}

/** A short clip to edit when there is no camera, or nobody in front of it. */
export const SAMPLE_CLIP_URL = `${CDN}/assets/clips/sana-streaming/replace-background-softly.mp4`;
