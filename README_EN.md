<div align="center">

<img width="120" src="https://img.shields.io/badge/🤖-QQ_Bot-blue?style=for-the-badge" alt="QQ Bot" />

**A QQ Bot plugin for [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (dsh), connecting DeepSeek AI assistants to QQ private and group chats.**

[![npm version](https://img.shields.io/npm/v/@tencent-connect/dsh-qqbot)](https://www.npmjs.com/package/@tencent-connect/dsh-qqbot)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/tencent-connect/dsh-qqbot)](https://github.com/tencent-connect/dsh-qqbot)
[![QQ Bot](https://img.shields.io/badge/QQ_Bot-API_v2-red)](https://bot.q.qq.com/wiki/)

<br/>

**[简体中文](./README.md) | English**

Scan to join the QQ group / channel

<table>
<tr>
<td align="center" width="50%"><img src="./assets/docs/qqgroup.jpg" height="360" alt="QQ Group QR Code" /><br /><b>QQ Developer Group</b><br /><sub>Group 1: 1032635674 · Group 2: 1056948758</sub></td>
<td align="center" width="50%"><img src="./assets/docs/qqchannel.jpg" height="360" alt="QQ Channel QR Code" /><br /><b>QQ Developer Channel</b><br /><sub>Channel ID: 20dnumts4z</sub></td>
</tr>
</table>

</div>

## Architecture

```
QQ User → QQ WebSocket → dsh-qqbot → ctx.agents → dsh agent loop → LLM
                                 ↑                           │
                                 └── session/event ──────────┘
                                       (assistant reply → QQ sendMarkdown)
```

## Installation

### Method 1: Desktop install (recommended)

No command line needed — everything happens inside the app:

1. **Install**: click "Plugins" in the left sidebar → "Add plugin" → enter `@tencent-connect/dsh-qqbot@latest` → install and start now

<img src="./assets/docs/install.png" alt="In-app plugin install" width="560" />

2. **Connect**: avatar at the bottom-left → Settings → "QQ Bots" → scan the QR code with mobile QQ

<img src="./assets/docs/setting.png" alt="Settings QR binding" width="560" />

Credentials are saved automatically after the scan; later launches need no re-scan.

### Method 2: Manual

```bash
# Add to a profile
npx @deepseek-ai/dsh plugin --profile qqbot add @tencent-connect/dsh-qqbot

# Start
npx @deepseek-ai/dsh --profile qqbot
```

On first launch, the plugin detects missing credentials and automatically starts the QR flow: a QR code is printed in the terminal → scan it with the QQ mobile app → credentials are saved to the profile, so subsequent launches require no re-scan.

In environments without the in-app binding page (pure CLI), set `QQBOT_BIND_OPEN_BROWSER=1` to additionally open a browser QR page as a fallback.

<img src="./assets/docs/qrcode.png" alt="QR code scan example" width="280" />

> **Note**: Upgrade to `0.4.0` or later for browser-link scanning, which avoids QR code misalignment in some terminals.

### Method 3: Local path

```bash
# Build
cd /path/to/dsh-qqbot
pnpm install && pnpm build

# Add to a profile (local path)
npx @deepseek-ai/dsh plugin --profile qqbot add /path/to/dsh-qqbot

# Start
export QQBOT_APPID="yourAppID" QQBOT_SECRET="yourAppSecret"
npx @deepseek-ai/dsh --profile qqbot
```

### Method 4: --patch dev mode

```bash
export QQBOT_APPID="yourAppID" QQBOT_SECRET="yourAppSecret"
npx @deepseek-ai/dsh web --patch /path/to/dsh-qqbot/cordis.dev.yml
```

## Configuration

| Config | Type | Default | Description |
|------|------|--------|------|
| `appId` | string | **required** | QQ Bot AppID (or via `QQBOT_APPID` env var) |
| `appSecret` | string | **required** | QQ Bot AppSecret (or via `QQBOT_SECRET` env var) |
| `provider` | string | `deepseek-official` | LLM provider name |
| `model` | string | `deepseek-chat` | Model name |
| `preset` | string | - | Agent preset id |
| `cwd` | string | `process.cwd()` | Agent working directory |
| `requireMention` | boolean | `true` | Whether group messages require @bot to trigger |
| `globalPrompt` | string | `''` | Global system prompt applied to all group/direct chats (put split rules here) |
| `personas` | array | `[]` | Persona presets (switchable via `/persona` in QQ, each with an optional `tools` whitelist) |
| `defaultPersona` | string | `''` | Default persona id; empty disables personas |
| `textChunkLimit` | number | `4500` | Max chars per message |
| `streaming` | boolean | `true` | Enable streaming output (always disabled in groups) |
| `replySplitMode` | `none`/`delimiter`/`line`/`paragraph` | `none` | Reply split mode: `delimiter` splits only at the fixed `|||` delimiter; splitting disables streaming |
| `replySplitIntervalMs` | number | `0` | Delay between split messages (ms), `0` = send immediately |
| `sessionIdleTimeout` | number | `1800000` | Session idle timeout (ms), default 30 min |
| `processingTimeoutMs` | number | `1800000` | Processing timeout (ms), aborts the current LLM call |
| `maxQueue` | number | `20` | Max concurrent queue length |
| `historyLimit` | number | `10` | Group history buffer size |
| `askTimeoutMs` | number | `300000` | Question timeout (ms), default 5 min (ask_user_question) |
| `showToolResults` | boolean | `false` | Show successful tool-call results (errors always shown) |
| `debug` | boolean | `false` | Debug mode |

### Personas (personas)

Split the single prompt into several switchable personas, each with its own tool whitelist:

```yaml
- id: im-qqbot
  config:
    defaultPersona: assistant
    personas:
      - id: assistant
        name: Assistant
        prompt: You are a rigorous, concise assistant.
      - id: chat
        name: Chat
        prompt: You are a casual chat partner.
        tools: []          # pure-chat persona: no tools at all
        expressions:
          kaomoji:
            enabled: true  # must be explicitly enabled
            style: genki   # daily/genki/chuuni/cat/tsundere/soft/cool/maid
      - id: media
        name: Media helper
        prompt: You are good at reading images and sending files.
        tools:
          - qqbot_describe_image
          - qqbot_send_file
```

- `expressions.kaomoji`: **kaomoji** (optional; requires an explicit `enabled: true`). Choose a style that matches the persona (`daily`, `genki`, `chuuni`, `cat`, `tsundere`, `soft`, `cool`, `maid`; default `daily`). The style's kaomoji list and usage rules (at most one per reply by default) are merged into the persona prompt — **no tool call needed**.
  - `enabled`: whether to enable it (default `false`). Explicit opt-in is required because the config schema materializes a default sub-object for every persona — testing for the mere presence of `kaomoji` would silently enable it everywhere.
  - `maxPerReply`: max kaomoji per reply (1–3, default 1).
  - `custom`: extra kaomoji (up to 20 entries, ≤32 chars each), appended after the preset list.
  - The library lives in `src/expressions/kaomoji.ts`; future sticker (image) support will add a `sticker` field to the same `expressions` container without changing the persona shape.
- `tools` is a **hard** runtime constraint: the persona's agent calls `tools.restrict({ allow })`, so tools outside the whitelist are not even visible to the model (not just discouraged by the prompt).
  - Omit `tools` to use the **default allowlist**: the 7 plugin tools (`qqbot_solve`, `qqbot_describe_image`, `qqbot_send_file`, `qqbot_translate`, `qqbot_summarize`, `qqbot_explain`, `qqbot_rewrite`) plus `ask_user_question` and read-only `web_search` / `web_fetch`.
  - `tools: []` disables all tools for that persona.
  - Persona tool names are intersected with the default allowlist: host tools such as `read`, `write`, `pwsh`, `bash` are never granted (a warning is logged), and unknown names are ignored.
  - Switching personas re-applies the binding immediately; `/tools` shows the current binding (admins only, diagnostic — hidden from the command menu).
  - Bind tools in the settings panel: expand a persona card, turn on "limit available tools", then pick from the dropdown (candidates are plugin tools only; chosen ones render as removable chips).
- Personas are per-chat (group id / direct-chat user id); `/persona <id>` override > `defaultPersona`.
- Prompt order: `globalPrompt` (80) → identity (82) → persona prompt (85) → tool-permission note (86, when `tools` is set) → memory (87).

### Identity (identity)

Resolves who sent each message by openid and injects an identity tag so personas can decide how close to be:

```yaml
- id: im-qqbot
  config:
    identity:
      enabled: true
      ownerOpenIds:
        - 8E4BF9DF3A321BC03F55845EE32C623D   # owner (direct chat user_openid)
      adminOpenIds: []
      friendOpenIds: []
```

| Config | Type | Default | Description |
|------|------|--------|------|
| `identity.enabled` | boolean | `true` | Enable identity resolution; no tags are injected while all lists are empty |
| `identity.ownerOpenIds` | string[] | `[]` | Owner openids; persona-specific forms of address only apply to them |
| `identity.adminOpenIds` | string[] | `[]` | Admin openids |
| `identity.friendOpenIds` | string[] | `[]` | Friend openids; anyone else is a stranger |

- Each message is prefixed with `[身份: 主人]` (`[Identity: owner]`-style tag), direct chats included. Group history entries carry the tag too.
- Persona prompts should reference the tag instead of hardcoding an openid — openids change with AppID and differ between direct chats (`user_openid`) and groups (`member_openid`).
- Send `/whoami` in QQ to read the openid for the current chat; add the direct-chat and group values separately.
- Identity tags only affect tone and forms of address; they do not bypass `access` allowlists.

### Long-term memory (memory)

Per-chat memory of what was said and how the relationship has progressed, stored separately from session history: `/new` only resets context, memory survives `/new` and restarts (`~/.dsh-qqbot/memory.json`).

```yaml
- id: im-qqbot
  config:
    memory:
      enabled: true       # disable = no writes, no prompt injection
      autoCapture: true   # extract facts from user self-descriptions
      maxNotes: 20        # max notes per chat (oldest evicted)
```

| Config | Type | Default | Description |
|------|------|--------|------|
| `memory.enabled` | boolean | `true` | Enable memory and relationship state; when off, nothing is written or injected |
| `memory.autoCapture` | boolean | `true` | Auto-capture self-descriptions such as "my name is… / I like…"; no extra model calls |
| `memory.maxNotes` | number | `20` | Max notes per chat (1–100); oldest notes are evicted |

- Relationship stage is derived from cumulative interactions: 初识 (<5) → 眼熟 (<20) → 熟悉 (<60) → 亲近 (<200) → 很亲近. It only affects familiarity, never the identity rules.
- Auto-capture is a conservative heuristic: explicit self-descriptions only, skipping questions and hearsay ("he said…").
- Group notes are prefixed with the speaker's name to avoid attributing one member's facts to another.
- The injected section contains days known, interaction count, relationship stage and the notes, with instructions to mention them naturally, never recite the list, and never invent unrecorded facts.
- Manage it with `/memory` in QQ (admins only), or edit the switches and note limit in the "Memory & Relationship" tab of the settings panel.

### Access control (access)

| Config | Type | Default | Description |
|------|------|--------|------|
| `access.c2cMode` | `open`/`allowlist`/`disabled` | `open` | Direct-chat access mode |
| `access.c2cAllow` | string[] | `[]` | Direct-chat allowlist (user openid) |
| `access.groupMode` | `open`/`allowlist`/`disabled` | `open` | Group access mode |
| `access.groupAllow` | string[] | `[]` | Group allowlist (group openid) |

### Rich media (media)

| Config | Type | Default | Description |
|------|------|--------|------|
| `media.enabled` | boolean | `true` | Enable rich media understanding (image/video download + tool analysis) |
| `media.maxMB` | number | `200` | Max download size (MB) |
| `media.ttlHours` | number | `24` | Media lifetime (hours), 0 = never expire |

### Vision (vision)

| Config | Type | Default | Description |
|------|------|--------|------|
| `vision.enabled` | boolean | `false` | Enable vision (qqbot_describe_image tool) |
| `vision.provider` | string | - | Vision model provider (e.g. pi-ai) |
| `vision.model` | string | - | Vision model id (e.g. qwen-vl-max) |
| `vision.maxBytes` | number | `10MB` | Max image bytes |
| `vision.maxTokens` | number | `1024` | Max output tokens |
| `vision.timeoutMs` | number | `120000` | Vision call timeout (ms) |

### File sending (sendFile)

| Config | Type | Default | Description |
|------|------|--------|------|
| `sendFile.restrictPaths` | boolean | `true` | Enable path allowlist (media + cwd + extraRoots only) |
| `sendFile.extraRoots` | string[] | `[]` | Extra allowed root directories |

## Built-in Commands

| Command | Description |
|------|------|
| `/new` (aliases `/reset` `/clear`) | Start a new session (admins only) |
| `/compact` | Compact session history (admins only) |
| `/model` | View or switch model (admins only) |
| `/preset` | View or switch agent preset (admins only) |
| `/persona` | List and switch personas per chat (admins only) |
| `/tools` | Diagnostic: show the current persona's tool binding and host tool list (admins only, hidden from the command menu); bind tools from the settings panel dropdown instead |
| `/memory` | Show per-chat memory and relationship stage (admins only); `/memory add <text>`, `/memory del <n>`, `/memory clear` |
| `/whoami` | Show your openid and resolved identity for the current chat |
| `/stop` | Abort the current generation (admins only, hidden from help) |
| `/bot-ping` | Network latency test (transport & processing time) |
| `/bot-version` | View version info (model details are admin-only) |
| `/bot-status` | View current session status (admins only) |
| `/bot-help` | List commands available to your identity |

> Admin-only commands are hidden from `/bot-help` and rejected with a role message for friends/strangers.
> When the `identity` lists are empty, permission checks are disabled and everyone keeps full access.

## Core Modules

```
src/
├── index.ts                    # Cordis plugin entry (async apply)
├── config.ts                   # Config schema
├── types.ts                    # Global types
├── setup.ts                    # Credential binding (QR)
├── gateway/                    # Gateway assembly
│   ├── bootstrap.ts            # Startup wiring (session/event listeners, etc.)
│   └── middleware-setup.ts     # Middleware chain config
├── transport/                  # Transport layer
│   ├── inbound.ts              # QQ inbound message → agent.followup()
│   ├── outbound.ts             # session/event → QQ sendMarkdown
│   ├── outbound-buffer.ts      # Streaming buffer
│   ├── streaming-writer.ts     # Streaming writer
│   ├── reply-target.ts         # Reply target resolution
│   ├── msgid-cache.ts          # Passive reply msgid cache
│   ├── reply-limiter.ts        # Passive reply rate limiter
│   ├── tool-presenter.ts       # Tool-call presentation
│   └── chunker.ts              # Markdown chunking
├── session/                    # Session management
│   ├── session-manager.ts      # QQ peer → Agent mapping
│   └── idle-evictor.ts         # Idle eviction
├── model/                      # Model routing
│   ├── model-resolver.ts       # Route resolution
│   ├── prefs-store.ts          # Per-peer preference persistence
│   └── settings-reader.ts      # settings.yaml read-only
├── personas/                   # Persona presets
│   ├── persona-utils.ts        # Persona resolution + system prompt sections
│   └── persona-tools.ts        # Tool whitelist → tools.restrict hard constraint
├── memory/                     # Long-term memory & relationship state
│   ├── memory-store.ts         # ~/.dsh-qqbot/memory.json persistence
│   └── memory-prompt.ts        # Relationship stage / fact capture / prompt section (order 87)
├── features/                   # Interaction features
│   ├── question-channel.ts     # ask_user_question Q&A channel
│   ├── approval-channel.ts     # approval confirmation channel
│   └── answer-parser.ts        # Answer parsing
├── media/                      # Media
│   ├── vision-tool.ts          # Image vision understanding
│   ├── send-file-tool.ts       # Send local files
│   └── media-cleaner.ts        # Media TTL cleanup
├── middleware/                 # Middleware
│   ├── question-answer.ts      # Q&A answer handling
│   └── attachment.ts           # Attachment handling
├── shared/                     # Shared utilities
│   ├── utils.ts                # Common helpers
│   ├── scope.ts                # scope/peer extraction
│   └── send-helper.ts          # Chunked send
└── commands/                   # Slash commands
```

## Session Routing

sessionKey: `qqbot:${appId}:${scope}:${peerId}`; a UUID session id is minted for new sessions and persisted to `model-prefs.json`, resuming by the persisted id after restarts; pre-0.6 sessions keep their originally derived ids.

Resolution strategy: in-process reuse → persisted resume → fresh create.

## Design Principles

- **Pure Cordis plugin** — follows the dsh "Plugins, not loop changes" principle
- **Declarative dependencies** — `inject = ['agents']`, no direct coupling to other plugins
- **Session isolation** — one independent Agent per QQ direct user / group
- **Preset support** — mount presets (toolkits, prompts, etc.) via the `agent-presets` service
- **Idle eviction** — auto-dispose Agents on timeout to prevent memory leaks
- **Markdown output** — replies sent as Markdown with code-block/table-aware chunking
- **Image understanding** — supports `qqbot_describe_image` vision to analyze images sent by users
- **Problem solving** — supports `qqbot_solve` to solve exam/homework problems (question text or screenshot, using the session's current model) and returns a fixed answer + worked-steps layout
- **Text utilities** — `qqbot_translate`, `qqbot_summarize`, `qqbot_explain` (concepts/code/errors) and `qqbot_rewrite` polish, all using the session's current model with no extra dependencies
- **Kaomoji** — personas can enable `expressions.kaomoji` with a mood-grouped style (daily / genki / chuuni / cat / tsundere / soft / cool / maid); rules are injected into the prompt, no tool call required
- **File sending** — supports `qqbot_send_file` to send local files to users (path allowlist enabled by default)
- **Safe tool defaults** — QQ sessions only allow plugin tools plus read-only web access and question prompts; host file-system and shell tools stay off-limits
- **Question interaction** — supports `ask_user_question` with inline keyboard buttons (mutually exclusive) or numbered replies, one question at a time with timeout
- **Approval confirmation** — supports `approval/request` to ask for user confirmation on critical actions via allow/deny buttons

## Local Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Dev mode (watch)
pnpm dev

# Debug via --patch
export QQBOT_APPID="xxx" QQBOT_SECRET="xxx"
npx @deepseek-ai/dsh web --patch /path/to/dsh-qqbot/cordis.dev.yml
```

## License

[MIT](./LICENSE)
