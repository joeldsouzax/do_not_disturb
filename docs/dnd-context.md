# D&D context and visual continuity

The active prompt source is [`dnd-context.ts`](../templates/vidu-s2-avatar/app/lib/dnd-context.ts).
It is shared by the scene planner, Nano Banana and the live world adapters.

The rule basis is [SRD 5.2.1](https://www.dndbeyond.com/srd), including the
[official PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf).
The [2024 Basic Rules overview](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game)
also explains the play loop: the DM presents a situation, players describe
intent, and the DM adjudicates and narrates the result. The renderer illustrates
that result; it does not invent rolls or operate a hidden rules engine.

The context distinguishes exploration, social interaction and combat;
checks, attacks and saves; the action economy; spell prerequisites and
concentration; equipment; and different magical effects. Current character
records do not include numeric character sheets, initiative or spell slots,
so the app never claims to calculate them.

The earlier coastal tavern demonstration drew atmosphere from
[D&D Beyond’s Forgotten Realms introduction](https://www.dndbeyond.com/resources/2037-the-forgotten-realms)
and [Waterdeep introduction](https://www.dndbeyond.com/posts/243-welcome-to-waterdeep-an-introduction-to-the-city).
Those demonstration facts are no longer active campaign context. No official
adventure or commercial rulebook was copied into the project.

## DM ownership and visual defaults

Real games start with no party, setting, quest, NPCs or room layout. The camera
establishes miniature appearance, and human speech establishes names and world
facts. Only DM narration establishes outcomes and location changes. Existing
DM facts carry forward across turns; completed actions are not replayed.
The example recording starts its own empty record and explicitly establishes a
forest gate, the wizard’s action, its result, then a crypt. It cannot change the
real campaign. Legacy mixed demo records are archived intact.

Traditional fantasy materials and flame/daylight/moonlight are visual defaults:
hand-hewn timber, weathered stone, iron, leather, wool, parchment and pottery;
no accidental neon, bulbs, LED strips or wiring. An explicit setting chosen by
the human DM can override those defaults. No particular tavern geometry, wax
seal, sample hero or quest is inserted into the runtime context.

The promotional trailer is a separate bundled video. Its castle, anonymous
figures and dragon are never camera references or campaign facts. Page loads
replay that asset without invoking generation.

The full context goes to Gemini’s scene planner and Nano Banana. The planner
preserves the original narration and produces a separate, bounded visual beat.
Live prompts reserve space for the lighting and continuity constraints before
adding that beat, because HappyOyster has a 2,000-character prompt limit.
Prompting reduces drift; it cannot guarantee a world model obeys every detail.
Rebuild the location from a corrected reference image when a live stream drifts.

## Attribution

This work includes material from the System Reference Document 5.2.1
(“SRD 5.2.1”) by Wizards of the Coast LLC, available at
https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative
Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.

The runtime context paraphrases selected rules for renderer guidance. It is
not a reproduction of the SRD and does not implement its complete mechanics.
