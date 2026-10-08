# do-not-disturb project idea

do-not-disturb is a shared, interactive D&D table on a screen. Players bring their physical miniatures, customize the characters behind them, and watch those heroes come alive before joining an adventure together. The experience combines the personal investment of a painted miniature with an animated world, character voices, and multiplayer play.

The central moment is: **put your miniature in front of the camera, give it a story, and meet the character you created.**

## Player experience

1. **Capture a miniature.** Photograph one figure with the webcam or upload an image. A sample miniature lets someone try the experience immediately.
2. **Create the character.** Choose a name, ancestry, class, appearance, equipment, personality, backstory, and voice. Preserve the distinctive paint, clothing, weapons, and accessories of the original figure.
3. **Approve the look.** Use the image API to turn the miniature into a character portrait and matching digital miniature. Let the player revise the result before accepting it.
4. **Bring the hero alive.** Animate the approved character and give it a spoken introduction. The player can interact with it rather than only watch a prerecorded reveal.
5. **Join the table.** Each player controls their own character on a shared top-down battlemap. The in-game camera focuses on the active hero and returns to the party overview.
6. **Play together.** Move, investigate, negotiate, interact with objects, and use abilities. A human Dungeon Master controls encounters and reveals the world. Resolved actions produce visible reactions, such as a spell illuminating a room.

The webcam captures the physical miniature during creation. The in-game camera follows the digital character during play. Continuous tracking of physical figures around a real table is a possible later feature.

## Shared world and game rules

The board is the main play surface. Everyone joins the same campaign and shares its map, characters, and resolved actions. Players control their characters; the Dungeon Master controls the environment and encounters.

A game server owns character positions, turns, health, inventory, walls, distances, dice results, and action outcomes. It validates player actions and distributes the resulting state to everyone. Generated visuals portray those outcomes; they cannot silently change the rules or character state.

The world stays bounded by the campaign and its D&D rules. Freeform action descriptions can be interpreted or adjudicated by the Dungeon Master before they change the board. Full rules coverage is outside the first prototype.

## Proposed model roles

| Capability | Intended role | What needs checking |
| --- | --- | --- |
| Nano Banana image API | Transform a miniature photo into an approved portrait and matching character assets | Exact provider, reference-image support, and visual consistency |
| Vidu S2-Avatar | Bring the portrait alive for introductions and live conversation | Whether miniature photos work directly or need portrait conversion first |
| Voice API | Provide a chosen character voice where supported | Provider and compatibility with the avatar’s audio flow; Vidu already supplies speech |
| SANA-Streaming | Add atmosphere and effects to a board rendered by the app | Whether editing preserves terrain alignment well enough for tactical play |
| LingBot World 2 | Explore generated environments and try character-focused action scenes | Character identity, camera behavior, and consistency with the shared board |

These are candidate roles, not a requirement to use every model. An avatar video does not by itself provide a controllable game miniature. Character assets and game state must connect creation, conversation, and play.

## First interactive prototype

Start with one miniature and complete the creation-to-animation loop before expanding the game:

- Load the sample wizard, upload a photo, or capture a miniature with the webcam.
- Edit its name, class, and backstory.
- Prepare the character from the selected image, then start its live introduction and conversation.
- Show preparation, connection, and model errors clearly, and allow the session to end.
- Add portrait conversion once the image API is configured and compare it with direct miniature input.

Evaluate this interactively, without adding an automated test suite. The first acceptance criterion is that the player recognizes their own miniature in the living character and can speak with it.

The next milestone is two player-created heroes on one shared encounter map. Each player takes an action that changes the shared state and has a visible effect. Keep a human Dungeon Master and a small set of actions initially.

## Key design questions

- Can the portrait, animated avatar, and digital miniature preserve one recognizable character identity?
- Can generated terrain remain aligned with the tactical map?
- Can the board respond immediately while generated effects arrive later?
- Does live world generation make the encounter more engaging, beyond the character creation and voice reveal?
- Which hackathon track fits the final experience: avatars, world models, or both?

## Starting materials

The repository was cloned from [Reactor’s create-reactor-app](https://github.com/reactor-team/create-reactor-app). Its [Vidu avatar starter](../templates/vidu-s2-avatar/README.md) provides image upload, persona setup, microphone input, live video and audio, transcripts, and clip capture.

The initial reference is [Elfsera the Wise Wizard by em4miniatures](https://em4miniatures.com/en-us/products/elfsera-the-wise-wizard), downloaded to [wizard.jpg](../templates/vidu-s2-avatar/public/miniatures/wizard.jpg). It is a development sample; players supply their own miniatures in the intended experience.
