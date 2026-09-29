export interface ExampleReference {
  id: string;
  label: string;
  kind: "object" | "garment" | "background";
  url: string;
  text: string;
}

// These URLs are publicly reachable by the generation service.
const exampleReferenceCatalog: readonly ExampleReference[] = [
  {
    id: "tiny-dragon",
    label: "Tiny dragon",
    kind: "object",
    url: "https://inc-reactor-static.b-cdn.net/vidu/avatar/objects/tiny-dragon.jpg",
    text: "Hold the tiny dragon",
  },
  {
    id: "unimpressed-cat",
    label: "Unimpressed cat",
    kind: "object",
    url: "https://inc-reactor-static.b-cdn.net/vidu/avatar/objects/unimpressed-cat.jpg",
    text: "Hold the unimpressed cat",
  },
  {
    id: "flaming-marshmallow",
    label: "Flaming marshmallow",
    kind: "object",
    url: "https://inc-reactor-static.b-cdn.net/vidu/avatar/objects/flaming-marshmallow.jpg",
    text: "Hold the flaming marshmallow",
  },
  {
    id: "crystal-ball",
    label: "Crystal ball",
    kind: "object",
    url: "https://inc-reactor-static.b-cdn.net/vidu/avatar/objects/crystal-ball.jpg",
    text: "Hold the crystal ball",
  },
  {
    id: "live-lobster",
    label: "Live lobster",
    kind: "object",
    url: "https://inc-reactor-static.b-cdn.net/vidu/avatar/objects/live-lobster.jpg",
    text: "Hold the live lobster",
  },
  {
    id: "rotary-phone",
    label: "Rotary phone",
    kind: "object",
    url: "https://inc-reactor-static.b-cdn.net/vidu/avatar/objects/rotary-phone.jpg",
    text: "Answer the rotary phone",
  },
  {
    id: "lobster-costume",
    label: "Lobster costume",
    kind: "garment",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/virtual-try-on/lobster-costume.jpg",
    text: "Wear the lobster costume",
  },
  {
    id: "sequin-tuxedo",
    label: "Sequin tuxedo",
    kind: "garment",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/virtual-try-on/sequin-tuxedo.jpg",
    text: "Wear the sequin tuxedo",
  },
  {
    id: "dinosaur-suit",
    label: "Dinosaur suit",
    kind: "garment",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/virtual-try-on/dinosaur-suit.jpg",
    text: "Wear the dinosaur suit",
  },
  {
    id: "pharaoh-headdress",
    label: "Pharaoh headdress",
    kind: "garment",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/virtual-try-on/pharaoh-headdress.jpg",
    text: "Wear the pharaoh headdress",
  },
  {
    id: "powdered-wig",
    label: "Powdered wig",
    kind: "garment",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/virtual-try-on/powdered-wig.jpg",
    text: "Wear the powdered wig",
  },
  {
    id: "tinfoil-hat",
    label: "Tinfoil hat",
    kind: "garment",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/virtual-try-on/tinfoil-hat.jpg",
    text: "Wear the tinfoil hat",
  },
  {
    id: "mars",
    label: "Mars",
    kind: "background",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/background-swap/mars.jpg",
    text: "Stand on Mars",
  },
  {
    id: "snow-globe",
    label: "Snow globe",
    kind: "background",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/background-swap/snow-globe.jpg",
    text: "Stand inside a snow globe",
  },
  {
    id: "news-desk",
    label: "News desk",
    kind: "background",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/background-swap/news-desk.jpg",
    text: "Sit at the news desk",
  },
  {
    id: "eighties-mall",
    label: "80s mall",
    kind: "background",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/background-swap/eighties-mall.jpg",
    text: "Stand in an 80s mall",
  },
  {
    id: "space-cupola",
    label: "Space station",
    kind: "background",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/background-swap/space-cupola.jpg",
    text: "Float in the space station cupola",
  },
  {
    id: "hot-air-balloon",
    label: "Hot air balloon",
    kind: "background",
    url: "https://inc-reactor-static.b-cdn.net/vidu/editing/background-swap/hot-air-balloon.jpg",
    text: "Ride in a hot air balloon",
  },
];

export function exampleReferences(
  kind: ExampleReference["kind"]
): readonly ExampleReference[] {
  return exampleReferenceCatalog.filter((reference) => reference.kind === kind);
}

export function exampleThumbnail(reference: ExampleReference): string {
  const folder =
    reference.kind === "object"
      ? "objects"
      : reference.kind === "garment"
        ? "virtual-try-on"
        : "background-swap";
  return `/references/${folder}/${reference.id}.jpg`;
}
