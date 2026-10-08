// Original campaign direction, informed by the official SRD 5.2.1 and
// D&D Beyond's public Forgotten Realms introductions. Sources and scope are
// recorded in docs/dnd-context.md; a renderer never adjudicates game rules.

export const FANTASY_VISUAL_LOCK = `Traditional D&D high fantasy, a pre-industrial sword-and-sorcery world. Weathered stone, hand-hewn timber, wrought iron, leather, wool, parchment and pottery. Light comes ONLY from visible candle flames, oil lantern flames, the hearth, daylight or moonlight. Every wall light is a wrought-iron candle sconce or an oil lantern with a visible flame. No neon, fluorescent tubes, LED strips, electric bulbs, electric chandeliers, illuminated signage, electrical wires, modern furniture, plastic, screens or modern clothing. Magical light appears only when the Dungeon Master explicitly describes a spell; it is a localized supernatural glow, never a modern lighting fixture. No unexplained new people, objects or spell effects. Preserve faces, anatomy, clothing, equipment and room geometry. Keep the camera steady at eye level unless an actual movement is requested. No automatic orbit, zoom, cut, teleport or walking.`;

export const DND_RULES_CONTEXT = `
The rules basis is the 2024-style System Reference Document 5.2.1.
The play loop is Dungeon Master description, player intent, Dungeon Master adjudication and narration of the result. Social interaction, exploration and combat are different situations; not every interaction is combat.
Ability checks, attack rolls and saving throws are distinct D20 Tests. Strength, Dexterity, Constitution, Intelligence, Wisdom and Charisma describe different capabilities. An uncertain outcome needs the DM's ruling and, where called for, a supplied roll; the image or video model cannot decide success.
Actions include Attack, Dash, Disengage, Dodge, Help, Hide, Influence, Magic, Ready, Search, Study and Utilize. A player saying they cast a spell does not establish that they know it, have an available slot, meet its range or components, or succeed. A spell is not unlimited merely because the player is a Wizard.
Combat has initiative and turns. Movement, an action, eligible bonus actions and reactions are distinct resources. Concentration, conditions, cover, visibility and range matter. Do not narrate a hit, kill, damage, healing, lost equipment or spent resources unless the DM has established it.
The current prototype does not store levels, prepared spells, ability scores, spell slots, hit points, initiative or inventory counts. Never invent these numbers or claim a rules check has been executed. Preserve uncertainty in player requests; only the latest DM narration establishes an outcome.
Ordinary equipment includes swords, axes, bows, crossbows, shields, staves, armor, rope, packs, spellbooks and material component pouches. Items should match the miniature reference and the character record. A quarterstaff stays a quarterstaff; a bow does not become a gun.
Magic has differentiated effects: flame, frost, force, thunder, radiant light, healing, illusion, enchantment and transformation are not interchangeable. Depict only the named effect established by the DM. A healing spell does not destroy enemies; a spell that repairs objects does not restore a person; an illusion is not automatically physical terrain.
Common adventure creatures include goblins, kobolds, orcs, wolves, skeletons, zombies, trolls, giants and dragons, with consistent anatomy and scale. Do not add them simply to make a tavern more dramatic. Creatures appear only when established by the DM, and hostility is not automatic.
`;

// Campaign facts come exclusively from the human DM and the captured party.
export const DND_CONTEXT = `${DND_RULES_CONTEXT}\nVisual defaults (the DM can explicitly establish a different setting): ${FANTASY_VISUAL_LOCK}\nNo prepared campaign, named tavern, sample hero, letter, room layout or story exists until the DM establishes it. Retain only facts in the current campaign record. Miniature appearance comes from the current camera capture. Never import a demo character or promotional trailer into the campaign.`;

export function lockedWorldPrompt(
  narration: string,
  title: string,
  party: string
): string {
  // HappyOyster caps prompts at 2000 characters. Put invariants first and
  // reserve the remaining budget for this scene instead of slicing them off.
  const lock = `Living traditional D&D fantasy; no modern technology. Only candle flames, oil lanterns, hearth fire and moonlight; iron candle sconces, NEVER neon, LEDs, electric bulbs, fluorescent tubes or illuminated signs. Weathered timber and stone, leather, wool, parchment, pottery. Preserve the reference characters' faces, costumes, weapons, anatomy and room layout. Steady eye-level camera; no automatic cuts, zoom, orbit, walking, extra actors or effects. Animate only breathing, cloth, flames and established actions. Only the DM's result is fact; never invent dice, damage, victory or new plot events.`;
  const prefix = `${lock} The DM's explicit setting overrides visual defaults. Location: ${title}. Party: ${party.slice(0, 350)}. DM-established scene: `;
  return prefix + narration.slice(0, Math.max(0, 1950 - prefix.length));
}
