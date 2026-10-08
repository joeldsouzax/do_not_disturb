export interface Hero {
  id: string;
  name: string;
  ancestry: string;
  heroClass: string;
  backstory: string;
  photo: string;
}

export interface PlayerAction {
  id: string;
  heroId: string;
  text: string;
}

export interface StoryBeat {
  title: string;
  narration: string;
  image: string | null;
  visualBeat?: string;
  revision: number;
}

export type TableMode = "live" | "example";

export interface Adventure {
  mode: TableMode;
  revision: number;
  heroes: Hero[];
  scene: StoryBeat;
  pending: PlayerAction[];
  journal: { id: string; speaker: string; text: string }[];
}

export const VOICES = [
  { name: "Charon", label: "Charon · storyteller" },
  { name: "Kore", label: "Kore · resolute" },
  { name: "Puck", label: "Puck · spirited" },
  { name: "Fenrir", label: "Fenrir · bold" },
  { name: "Aoede", label: "Aoede · warm" },
];
