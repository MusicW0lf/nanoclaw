/**
 * NanoClaw Roleplay Agent Runner
 * Runs inside a container, uses OpenRouter instead of the Claude Agent SDK.
 *
 * Input protocol (same as main agent-runner):
 *   Stdin: Full ContainerInput JSON
 *   IPC:   Follow-up messages as JSON files in /workspace/ipc/input/
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Output protocol (same as main agent-runner):
 *   Each result wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';
const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const HISTORY_FILE = '/workspace/group/rp-history.json';
const LOREBOOK_FILE = '/workspace/group/lorebook.md';
const CHARACTER_STATS_FILE = '/workspace/group/character-stats.json';
const PLAYER_STATS_FILE = '/workspace/group/player-stats.json';
const CHARACTERS_DIR = '/workspace/group/characters';
const LOCATIONS_DIR = '/workspace/group/locations';
const MAX_HISTORY = 60; // messages to keep in context
const MAX_TOOL_ITERATIONS = 10;
// Update stats every N exchanges (but also updates when context clearly warrants it)
const STAT_UPDATE_INTERVAL = 3;

interface ContainerInput {
  prompt: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  secrets?: Record<string, string>;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  error?: string;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

type StatsObject = Record<string, unknown>;

// ── Output helpers ─────────────────────────────────────────────────────────

function emitOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

// ── History ────────────────────────────────────────────────────────────────

function loadHistory(): HistoryMessage[] {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch { /* start fresh */ }
  return [];
}

function saveHistory(history: HistoryMessage[]): void {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-MAX_HISTORY), null, 2));
}

// ── Stats ──────────────────────────────────────────────────────────────────

function loadStats(file: string): StatsObject {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch { /* start fresh */ }
  return {};
}

function saveStats(file: string, stats: StatsObject): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(stats, null, 2));
}

function formatStats(stats: StatsObject, label: string): string {
  if (Object.keys(stats).length === 0) return '';
  const lines = Object.entries(stats)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join('\n');
  return `## ${label}\n${lines}`;
}

// ── Characters & Locations ─────────────────────────────────────────────────

function loadDirectory(dir: string): Array<{ name: string; content: string }> {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => ({
        name: path.basename(f, '.md').replace(/-/g, ' '),
        content: fs.readFileSync(path.join(dir, f), 'utf-8').trim(),
      }));
  } catch {
    return [];
  }
}

function formatDirectory(entries: Array<{ name: string; content: string }>): string {
  if (entries.length === 0) return '';
  return entries
    .map((e) => `### ${e.name}\n${e.content}`)
    .join('\n\n');
}

// ── Lorebook & system prompt ───────────────────────────────────────────────

function loadLorebook(): string {
  try {
    if (fs.existsSync(LOREBOOK_FILE)) return fs.readFileSync(LOREBOOK_FILE, 'utf-8');
  } catch { /* none */ }
  return '';
}

function buildSystemPrompt(): string {
  const lorebook = loadLorebook();
  const characterStats = loadStats(CHARACTER_STATS_FILE);
  const playerStats = loadStats(PLAYER_STATS_FILE);
  const characters = loadDirectory(CHARACTERS_DIR);
  const locations = loadDirectory(LOCATIONS_DIR);

  const statsSection = [
    formatStats(characterStats, 'Your Stats (character)'),
    formatStats(playerStats, 'Player Stats'),
  ].filter(Boolean).join('\n\n');

  const charactersSection = formatDirectory(characters);
  const locationsSection = formatDirectory(locations);

  if (!lorebook) {
    return `You are a roleplay AI assistant. No character has been set up yet.

Ask the user to describe a character they'd like to roleplay with. This can be:
- An existing character from anime, games, books, movies, etc.
- An original character with a description

Once they provide a character, do the following:
1. Use bash with curl to research the character online (wikis, fandom sites, etc.)
2. Create a detailed lorebook at ${LOREBOOK_FILE} covering: personality, speech patterns, background, relationships, world context, notable quirks
3. Create a file at ${CHARACTERS_DIR}/<character-name>.md with a focused profile: appearance, personality traits, speech style, key relationships
4. Research the character's world and create files in ${LOCATIONS_DIR}/ for notable locations (one file each, e.g. ${LOCATIONS_DIR}/crystal-forest.md)
5. Initialize character stats at ${CHARACTER_STATS_FILE} as a JSON object with sensible starting values (e.g. {"hunger": 50, "thirst": 40, "mood": "neutral", "items": []})
6. Initialize player stats at ${PLAYER_STATS_FILE} as a JSON object (e.g. {"trust": 0, "affection": 0})
7. Tell the user the character is ready and start the roleplay immediately

Rules:
- Do NOT use markdown formatting like **, *, #, _ in your replies — plain text and emojis only
- Keep responses natural and conversational`;
  }

  return `You are a roleplay AI. You portray characters based on the lorebook and world files below. Stay in character at all times.

## Lorebook
${lorebook}
${charactersSection ? `\n## Characters\n${charactersSection}\n` : ''}${locationsSection ? `\n## Locations\n${locationsSection}\n` : ''}${statsSection ? `\n${statsSection}\n` : ''}
## Rules
- Stay in character — always respond as the character, never as an AI
- Use the character's established speech patterns and personality from the lorebook
- Do NOT use markdown formatting like **, *, #, _ in replies — plain text and emojis only
- Keep responses engaging, natural, and true to the character
- React naturally to your current stats — if hungry, mention it; if affection is high, be warmer
- You can use bash (curl) to look up information mid-conversation when relevant to the scene
- When a new notable character appears in the story, create ${CHARACTERS_DIR}/<name>.md for them
- When a new notable location is visited or mentioned, create ${LOCATIONS_DIR}/<name>.md for it
- If the user asks to switch characters: research the new character, rewrite ${LOREBOOK_FILE}, update ${CHARACTERS_DIR}/, and reinitialize both stat files
- If you learn something important about the character's world, update the relevant file`;
}

// ── Tools ──────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a bash command. Use curl for web requests. Useful for researching characters and looking up lore.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The bash command to run' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute file path to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file in the workspace. Use this to create or update the lorebook and stat files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Absolute file path to write' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
];

function executeTool(name: string, args: Record<string, string>): string {
  switch (name) {
    case 'bash': {
      try {
        const result = execSync(args.command, {
          timeout: 30_000,
          encoding: 'utf-8',
          maxBuffer: 2 * 1024 * 1024,
        });
        return (result || '(no output)').slice(0, 8000);
      } catch (e: any) {
        return `Error: ${e.message}\n${e.stderr || ''}`.slice(0, 2000);
      }
    }
    case 'read_file': {
      try {
        return fs.readFileSync(args.path, 'utf-8').slice(0, 8000);
      } catch (e: any) {
        return `Error reading file: ${e.message}`;
      }
    }
    case 'write_file': {
      try {
        fs.mkdirSync(path.dirname(args.path), { recursive: true });
        fs.writeFileSync(args.path, args.content);
        return 'File written successfully.';
      } catch (e: any) {
        return `Error writing file: ${e.message}`;
      }
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

// ── OpenRouter API ─────────────────────────────────────────────────────────

async function callOpenRouter(
  messages: OpenRouterMessage[],
  model: string,
  apiKey: string,
  tools?: unknown[],
): Promise<{
  content: string | null;
  toolCalls: Array<{ id: string; name: string; args: Record<string, string> }>;
}> {
  const body: Record<string, unknown> = { model, messages };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/qwibitai/nanoclaw',
      'X-Title': 'NanoClaw Roleplay',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as any;
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error('No response from OpenRouter');

  const toolCalls = (msg.tool_calls ?? []).map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || '{}') as Record<string, string>,
  }));

  return { content: msg.content as string | null, toolCalls };
}

// ── Stat update ────────────────────────────────────────────────────────────

async function updateStats(
  userText: string,
  characterResponse: string,
  model: string,
  apiKey: string,
): Promise<void> {
  const characterStats = loadStats(CHARACTER_STATS_FILE);
  const playerStats = loadStats(PLAYER_STATS_FILE);

  // Skip stat update if no stats exist yet (character not set up)
  if (
    Object.keys(characterStats).length === 0 &&
    Object.keys(playerStats).length === 0
  ) {
    return;
  }

  const prompt = `You are a stat tracker for a roleplay session. Given the exchange below, update the stats as appropriate.

Current character stats:
${JSON.stringify(characterStats, null, 2)}

Current player stats:
${JSON.stringify(playerStats, null, 2)}

Recent exchange:
User: ${userText}
Character: ${characterResponse}

Instructions:
- Only update stats that meaningfully changed based on the exchange content
- You may ADD new stats that are relevant (e.g. a new item acquired, a new relationship metric)
- You may REMOVE stats that no longer apply
- Numeric stats should reflect realistic incremental changes
- String stats can reflect mood, status, location, etc.
- Items should be arrays of strings
- If nothing meaningful changed, return the stats unchanged

Respond with ONLY a JSON object in this exact format (no other text):
{
  "character": { ...updated character stats... },
  "player": { ...updated player stats... }
}`;

  try {
    const { content } = await callOpenRouter(
      [{ role: 'user', content: prompt }],
      model,
      apiKey,
    );

    if (!content) return;

    // Extract JSON from response (model might wrap it)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const updated = JSON.parse(jsonMatch[0]);
    if (updated.character && typeof updated.character === 'object') {
      saveStats(CHARACTER_STATS_FILE, updated.character);
    }
    if (updated.player && typeof updated.player === 'object') {
      saveStats(PLAYER_STATS_FILE, updated.player);
    }
  } catch {
    // Stat update failure is non-critical — continue silently
  }
}

// ── Message processing ─────────────────────────────────────────────────────

async function processMessage(
  userText: string,
  history: HistoryMessage[],
  model: string,
  apiKey: string,
  exchangeCount: number,
): Promise<string> {
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: userText },
  ];

  let finalContent: string | null = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const { content, toolCalls } = await callOpenRouter(messages, model, apiKey, TOOLS);

    if (toolCalls.length === 0) {
      finalContent = content;
      break;
    }

    // Append assistant message with tool calls
    messages.push({
      role: 'assistant',
      content,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    });

    // Execute each tool and append results
    for (const tc of toolCalls) {
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: executeTool(tc.name, tc.args),
      });
    }
  }

  const response = finalContent ?? '(no response)';

  // Update stats every STAT_UPDATE_INTERVAL exchanges
  if (exchangeCount % STAT_UPDATE_INTERVAL === 0) {
    await updateStats(userText, response, model, apiKey);
  }

  return response;
}

// ── IPC polling ────────────────────────────────────────────────────────────

async function pollIpc(model: string, apiKey: string, initialExchangeCount: number): Promise<void> {
  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  let exchangeCount = initialExchangeCount;

  return new Promise<void>((resolve) => {
    let idleTimer = setTimeout(resolve, IDLE_TIMEOUT_MS);

    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(resolve, IDLE_TIMEOUT_MS);
    };

    const poll = async () => {
      // Check close sentinel
      if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
        fs.rmSync(IPC_INPUT_CLOSE_SENTINEL, { force: true });
        clearTimeout(idleTimer);
        resolve();
        return;
      }

      // Process any queued messages
      let files: string[] = [];
      try {
        files = fs
          .readdirSync(IPC_INPUT_DIR)
          .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
          .sort();
      } catch { /* dir not ready */ }

      for (const file of files) {
        const filePath = path.join(IPC_INPUT_DIR, file);
        try {
          const msg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          fs.rmSync(filePath, { force: true });

          if (msg.type === 'message' && typeof msg.text === 'string') {
            resetIdle();
            exchangeCount++;
            const history = loadHistory();
            const response = await processMessage(msg.text, history, model, apiKey, exchangeCount);
            history.push({ role: 'user', content: msg.text });
            history.push({ role: 'assistant', content: response });
            saveHistory(history);
            emitOutput({ status: 'success', result: response });
          }
        } catch { /* skip bad files */ }
      }

      setTimeout(poll, IPC_POLL_MS);
    };

    setTimeout(poll, IPC_POLL_MS);
  });
}

// ── Entry point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Read ContainerInput from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const input: ContainerInput = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

  const secrets = input.secrets ?? {};
  const apiKey = secrets['OPENROUTER_API_KEY'] ?? '';
  const model = secrets['ROLEPLAY_MODEL'] || 'anthropic/claude-3.5-haiku';

  if (!apiKey) {
    emitOutput({ status: 'error', result: null, error: 'OPENROUTER_API_KEY is not set in .env' });
    return;
  }

  // Determine exchange count from history length (for stat update interval)
  const history = loadHistory();
  const exchangeCount = Math.floor(history.length / 2);

  // Process the initial message
  try {
    const response = await processMessage(input.prompt, history, model, apiKey, exchangeCount + 1);
    history.push({ role: 'user', content: input.prompt });
    history.push({ role: 'assistant', content: response });
    saveHistory(history);
    emitOutput({ status: 'success', result: response });
  } catch (e: any) {
    emitOutput({ status: 'error', result: null, error: e.message });
    return;
  }

  // Stay alive and handle follow-up messages via IPC
  await pollIpc(model, apiKey, exchangeCount + 1);
}

main().catch((e) => {
  emitOutput({ status: 'error', result: null, error: String(e) });
  process.exit(1);
});
