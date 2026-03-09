# Setup Roleplay Scenario

Use this skill when the user wants to set up or reset a roleplay scenario for the Telegram roleplay bot.

## What this skill does

Creates all lorebook files (lorebook.md, characters/*.md, locations/*.md) for a new roleplay scenario in the `groups/telegram_roleplay/` folder and clears conversation history so the bot starts fresh with an opening scene.

This skill is exclusively for the roleplay group — do not apply it to other groups.

## Steps

### 1. Target group folder

Always use `groups/telegram_roleplay`. Do not ask the user which folder to use.

### 2. Ask for scenario details

Ask the user:
- What character or characters should the bot play? (existing fictional character, or original?)
- What world/setting? (can be inferred from the character)
- Any specific starting scenario or location they want to begin in?
- Any special rules or restrictions for this roleplay?

### 3. Research the character and world

Use WebSearch or your knowledge to gather:
- Character background, appearance, personality, speech patterns, relationships
- World lore: factions, geography, history, tone
- Key locations in that world

### 4. Clear old files

Use Glob to list all existing files in:
- `groups/telegram_roleplay/characters/`
- `groups/telegram_roleplay/locations/`

Then overwrite each with new content (or write new files). Also reset:
- `groups/telegram_roleplay/rp-history.json` → write `[]`
- `groups/telegram_roleplay/character-stats.json` → write new stats
- `groups/telegram_roleplay/player-stats.json` → write `{}`

### 5. Create lorebook.md

Write `groups/telegram_roleplay/lorebook.md` with:
- Overview of the world/setting
- Key lore, history, factions
- The curse/magic/power systems relevant to the world
- The character's backstory and role in the world
- Speech patterns and verbal quirks of the main character

### 6. Create character files

For each main character, write `groups/telegram_roleplay/characters/<Name>.md` with exactly three sections:

**## Description**
Exhaustive physical profile — gender, species/race, age, height, body type and build, skin/fur/scale color and texture, hair (color, length, style, texture), eyes (color, shape, unique traits), face shape and features, distinguishing marks, usual clothing and accessories, how they move and carry themselves, voice quality and speech mannerisms, any alternate forms.

**## Personality**
Deep personality breakdown — core temperament, emotional patterns and triggers, fears and insecurities, desires and motivations, moral values and ethical limits, sense of humor, how they handle conflict, stress, intimacy, and loss, mental strengths and weaknesses, habits and mannerisms, how they present themselves vs who they truly are.

**## Relationships**
How they relate to specific known characters (one paragraph per major character), and how they behave toward strangers in general.

### 7. Create location files

For each notable location in the world, write `groups/telegram_roleplay/locations/<Location-Name>.md` with:
- Physical description and atmosphere
- Dangers and notable features
- Lore significance
- Who inhabits it

Create at least 3-5 location files for the main areas of the world.

### 8. Initialize stats

Write `groups/telegram_roleplay/character-stats.json`:
```json
{
  "mood": "neutral",
  "hunger": 50,
  "energy": 80,
  "items": []
}
```
Adjust fields to make sense for the character (e.g. a robot has no hunger).

Write `groups/telegram_roleplay/player-stats.json`:
```json
{
  "trust": 0,
  "affection": 0
}
```

### 9. Done

Tell the user:
- What scenario was set up (character name, world, starting location)
- To send any message to the roleplay bot to begin — the bot will open with an immersive scene
- They can use `/setup-roleplay` again any time to switch characters or reset the story
