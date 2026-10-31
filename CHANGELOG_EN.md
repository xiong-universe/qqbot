# Changelog

> [简体中文](./CHANGELOG.md)

This file records significant dsh-qqbot updates from a product perspective, focusing on user-visible changes.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.10.0] - 2026-10-31

### ✨ Added

- **Per-persona tool binding (hard constraint)**: `personas[].tools` declares a tool whitelist per persona and applies it at runtime via `tools.restrict({ allow })`, so tools outside the whitelist are invisible to the model instead of merely discouraged by the prompt. `tools: []` disables all tools for that persona.
- **Constrained tool defaults (plugin tools only)**: omitting `tools` no longer inherits every host tool. QQ sessions use a default allowlist of the 7 plugin tools (solve / describe image / send file / translate / summarize / explain / rewrite) plus `ask_user_question` and read-only `web_search` / `web_fetch`. Host file access (`read`/`write`/`edit`), shells (`pwsh`/`bash`), sub-agents and scheduled jobs are disabled; persona whitelists are intersected with this list, so naming `read` is denied and logged (fail-closed).
- **Four text utilities**: `qqbot_translate` (optional target/source language), `qqbot_summarize` (adjustable bullet count), `qqbot_explain` (concepts/code/errors with optional audience and focus) and `qqbot_rewrite` (tone and length adjustable). All use the **session's current model** and need no vision or file services; input is capped at 8000 characters per call.
- **Kaomoji styles (`expressions.kaomoji`)**: personas can enable kaomoji with an explicit `enabled: true` (default `false` — the config schema materializes a default sub-object per persona, so merely checking for `kaomoji` would enable it everywhere). Pick a style matching the temperament (daily / genki / chuuni / cat / tsundere / soft / cool / maid, default daily), plus `custom` entries and `maxPerReply` (1–3 per reply). The library lives in `src/expressions/kaomoji.ts`, grouped by mood, and is merged into the persona prompt — **no tool call involved**. The settings panel now has a kaomoji switch on each persona card plus a style dropdown that appears once it is enabled; the `expressions` container leaves room for future sticker support.
- **`/tools` command** (alias `/工具`, admins only, **hidden from the command menu**): diagnostic only — shows the current persona's binding (default policy / limited to N tools), the allowed and denied lists, and the host tool list. Day-to-day binding is done in the settings panel.
- **Applies immediately on switch**: `/persona`, `/persona default` and `/persona off` release the old restriction and re-bind the new persona without `/new`. Restrictions are also released on idle eviction, fork rebuild and session removal.
- **Tool-permission prompt section** (order 86): when tools are bound, an extra section tells the model which tools exist and to say it cannot do something beyond them instead of pretending.
- **Settings panel**: each persona card gained a "Restrict tools" switch and a tool **dropdown picker** — selected tools render as removable chips, and candidates are plugin tools only (solve / describe image / send file / translate / summarize / explain / rewrite), grouped by category. Saving reloads the plugin.
- **Tabbed settings panel**: configuration is split into six tabs — access, identity, memory, conversation, model & prompts, and personas — showing one section at a time. Tabs with unsaved edits show a dot, and the Save button stays pinned at the bottom.
- **`qqbot_solve` problem-solving tool**: separates exam/homework solving from chit-chat. Pass `problem` (question text) or `image` (screenshot path or URL); it calls the **session's current model** (`/model` switches apply immediately) and always answers in a fixed "answer / worked steps" layout. Images need the attachments service; text-only questions do not.

### Notes

- **Behavior change**: personas without `tools` no longer inherit every host tool; the default policy allows plugin tools plus read-only web access and question prompts. Custom personas relying on file access or shells must use plugin tools instead — those host capabilities are intentionally not exposed.
- Tool names must match host registrations; unknown names are ignored and logged. If the tools service is unavailable, the restriction fails closed to "no tools".
- Names outside the default allowlist are silently denied (with a warning in the log) even when listed in a persona's `tools`.
- Host tools mounted by `agentPresets` (e.g. the standard preset) belong to an ancestor layer of the agent scope and are filtered by `restrict` too, so preset file-system, shell and sub-agent tools are likewise invisible in QQ sessions.

## [0.9.0] - 2026-10-31

### ✨ Added

- **Long-term memory and relationship state (`memory`)**: new `memory.enabled` / `memory.autoCapture` / `memory.maxNotes` config plus a "Memory & Relationship" section in the settings panel. Per-chat interaction counts, relationship stage and notes are stored in `~/.dsh-qqbot/memory.json`, separate from session history: `/new` only resets context, and memory survives restarts.
- **Automatic fact capture**: extracts long-term facts from explicit self-descriptions such as "my name is… / I like… / I live in…", with no extra model calls. Questions and hearsay ("he said…") are skipped — better to record less than to record wrong. Group notes are prefixed with the speaker to avoid attributing one member's facts to another.
- **Memory injection**: each system prompt now includes a memory section (order 87) with days known, interaction count, relationship stage and notes, instructing the model to mention them only when relevant, never recite the list, and never invent unrecorded facts.
- **`/memory` command** (alias `/记忆`): shows per-chat memory and relationship stage (admins only), with `/memory add <text>`, `/memory del <n>` and `/memory clear`.

### Notes

- Enabled by default (`enabled: true` / `autoCapture: true` / `maxNotes: 20`); no profile change needed.
- Relationship stage: 初识 (<5) → 眼熟 (<20) → 熟悉 (<60) → 亲近 (<200) → 很亲近. It only affects familiarity, never identity resolution.
- With `memory.enabled: false`, nothing is written or injected and behavior matches 0.8.x.

## [0.8.2] - 2026-10-31

### ✨ Added

- **Command permissions**: commands can declare a minimum role (`minRole`), wrapped into the SDK `authorized` hook by `commands/index.ts`. Friends/strangers get a role-aware rejection message when calling admin commands.
- **Admin-only commands**: `/new`, `/compact`, `/model`, `/preset`, `/persona`, `/bot-status`, `/stop`.
- **Slimmer menu**: `/bot-help` filters by caller identity; friends/strangers only see `/whoami`, `/bot-ping`, `/bot-version`, `/bot-help`, and no model/preset/session details.
- **Tiered `/bot-version`**: non-admins only get the version string, without the current model.

### Notes

- Permission checks share the `identity` lists. If all three lists are empty, permission control is disabled and everyone keeps the previous access.
- With no identity lists configured, behavior is identical to 0.8.1.

## [0.8.1] - 2026-10-31

### ✨ Added

- **Identity resolution (`identity`)**: new `identity.ownerOpenIds` / `identity.adminOpenIds` / `identity.friendOpenIds` config plus an "Identity" section in the settings panel. The plugin resolves each sender by the openid of the current chat and prefixes messages with `[身份: 主人]` / `[身份: 管理员]` / `[身份: 朋友]` / `[身份: 陌生人]` tags. Direct chats now carry the tag too (previously no sender info at all), and group history entries are tagged as well.
- **Personas no longer hardcode openids**: personas only key off the `身份: 主人` tag, so changing the AppID or switching between direct chats and groups no longer breaks the owner check.
- **`/whoami` command** (alias `/我是谁`): echoes the openid of the current chat and the resolved role so owners/friends can be added easily.

### Notes

- No tags are injected while all three lists are empty, so message formatting stays identical to previous versions; set `identity.enabled: false` to turn it off entirely.
- Direct chats use `user_openid` and groups use `member_openid`; the same account needs to be added to both.
- Identity tags only affect tone and familiarity; they do not bypass `access` allowlists.

## [0.8.0] - 2026-10-30

### ⚠️ Breaking changes

- **Per-scope prompts merged into a global prompt**: `groupPrompt` / `directPrompt` (and their panel fields) are removed in favor of a single `globalPrompt` applied to all group and direct chats. Shared rules such as multi-message splitting now live there; personas only describe the character.
- **Split delimiter fixed to `|||`**: `replySplitDelimiter` is removed. `replySplitMode: delimiter` always uses the fixed `|||` delimiter, so personas no longer need to repeat it.

### ✨ Improvements

- **Collapsible persona cards**: persona cards in the settings panel start collapsed, showing only name and id; click the header to expand and edit (new personas expand automatically). The panel no longer grows unbounded with many personas.

## [0.7.0] - 2026-10-30

### ✨ Added

- **Delimiter-based message splitting**: new `replySplitMode: delimiter` and `replySplitDelimiter` (default `|||`). Replies split into multiple messages only at the delimiter; ordinary newlines stay in one message. Delimiters inside fenced code blocks are ignored. Configurable from the settings panel.
- **Persona presets and switching**: new `personas` / `defaultPersona` config plus a "Persona presets" section in the settings panel. A new `/persona` (alias `/人格`) menu in QQ switches personas with one tap; `/persona default` follows the default, `/persona off` disables it for the current chat. Personas are isolated per group/private chat and apply to the next message.
- **Bundled personas**: whale girl, gentle JK girl, cool senior, cat girl, and a general assistant templates are provided in the sample config.

### Fixed

- **Config saving failed with source-direct loading**: in `--patch` source-direct setups the profile directory could not be located; it is now resolved via `--profile` + `DSH_HOME` fallback.

### Compatibility

- Legacy `replySplitMode: line` / `paragraph` still works; the default remains `none` so streaming is preserved unless splitting is enabled.

## [0.6.0] - 2026-10-30

### ✨ Added

- **Persona presets and switching**: new `personas` / `defaultPersona` config plus a "Persona presets" section in the settings panel, letting you split a single prompt into multiple personas. A new `/persona` (alias `/人格`) menu in QQ switches personas with one tap; `/persona default` follows the default, `/persona off` disables the persona for the current chat. Changes apply to the next message without starting a new session.
- **Multi-message replies by line breaks**: new `replySplitMode` (`none`/`line`/`paragraph`) and `replySplitIntervalMs` split a long reply into multiple independent QQ messages by line or paragraph; code blocks and GFM tables stay intact, and streaming is disabled automatically when splitting is enabled.

### Fixed

- **Config saving failed with source-direct loading**: in `--patch` source-direct setups the profile directory could not be located; it is now resolved via `--profile` + `DSH_HOME` fallback.

## [0.5.4] - 2026-10-28

### ⚠️ Behavior Changes (secure defaults)

- **Access control tightened by default**: DMs default to allowlist with an empty list rejecting everyone (previously empty lists silently allowed everyone); groups default to open (guarded by group membership and the @-mention gate). On QR binding, DMs switch to allowlist with the list reset to the scanning user (rebinding swaps the owner) — binding grants access.
- **Isolated default workspace**: the agent working directory now defaults to `~/.dsh-qqbot/workspace` instead of following the DSH process directory; set `cwd` explicitly to override.
- **Approval buttons check permissions**: in allowlist mode, approval buttons only take effect for allowlisted users — clicks by non-authorized members and forwarded DM cards clicked by others are ignored.

### Fixed

- **Saving configuration no longer clobbers other plugins**: binding, saving settings, and unbinding only touch this plugin's own entry; other plugins' content and comments are preserved. (#53)
- **Long prompts can be saved**: the settings-save request body limit is raised from 4KB to 512KB. (#69)
- **Vision-path hazard fixed**: the `qqbot_describe_image` message source now uses the current session format, so future image injection into the main conversation will not fail. (#77)
- **Hardened session ids**: unified `session-` prefix (#81) — community plugins no longer misjudge QQ sessions, multi-process concurrency produces no duplicate ids, and existing sessions keep their original ids.
- **Fixed model switching**: both the `/model` crash and the "history failed to load" error after restarting post-switch are fixed, with conversation history fully preserved.
- **Fixed session-event reads**: `/tokens` showing 0, `/export` producing empty output, and approval buttons not echoing the gated command — all fixed.
- **Fixed compaction**: `/compact` wrongly reporting the service as unavailable or "no active session" — fixed; in the latter case the session is revived from disk before compacting.
- **Fixed config save failure with link installs**: saving from the settings UI kept reporting "profile directory not found" when installed via `dsh plugin add link:` — fixed. With multiple profiles sharing the same source, writes target the profile of the current process. Remaining failures point at manually editing `cordis.patch.yml`. (#78)

### Internal

- Added a host-API adapter layer that uniformly supports both old and new host interface shapes.

## [0.5.3] - 2026-10-27

### Added

- **Streaming replies**: replies stream to QQ in segments while the model generates, and an automatic LLM retry rewrites the same streamed message instead of appending a duplicate. Streaming had never actually worked; it does now.
- **Delivered files reach the chat**: files the model declares as deliverables are automatically sent to the current QQ conversation right after the turn's reply, with a text notice when a file cannot be sent; can be disabled or capped in configuration.

### Fixed

- **Action confirmation restored**: confirmation requests never arrived — sensitive operations kept failing with "no approval channel is available". Fixed. (#51, thanks to [@IrisuM](https://github.com/IrisuM))
- **Settings panel input and copy**: allowlist textareas accept newlines, normalized on save; option labels such as open/disabled read more plainly.

### Metadata

- **Plugin metadata completed**: ships a plugin icon and a bilingual description; the plugin list shows “QQ 机器人 (dsh-qqbot)” / “QQ Bot (dsh-qqbot)” by interface language.
- **Entries and icon**: the sidebar and the plugin detail page gain management-panel entries; the settings panel icon becomes a vector logo.

### Documentation

- README: Desktop installation instructions — add from the Plugins page, connect by scanning in Settings, no command line involved.

## [0.5.2] - 2026-10-12

### Fixed

- **Fixed clean installs failing to activate**: 0.5.1 shipped with the old SDK range (`^1.0.4`), so clean installs resolved 1.0.4 and the disconnect logging feature crashed at startup (`TypeError`), failing plugin activation. The range is now `^1.0.5`.
- **Graceful degradation on stale SDKs**: environments that still carry an older SDK now skip the disconnect listener with an upgrade hint instead of failing activation.

## [0.5.1] - 2026-10-12

### Added

- **In-app QR binding**: bind your bot entirely from the DSH Desktop / Web settings page — scan with your phone's QQ or enter the AppID / AppSecret manually, with live binding status; the sidebar opens a guided page automatically while unbound. Credential rotation and unbinding are one click away.
- **In-app config panel**: no more hand-editing files — c2c/group access control (open, allowlist, disabled), mention-required in groups, streaming, tool-result display, model overrides and extra prompts, all applied automatically on save.

### Improved

- **Upgraded the QQ Bot SDK to 1.0.5**: disconnects are now logged with the reason and whether the bot will recover on its own, and a connection that can never be established fails fast with a clear reason instead of waiting forever.

## [0.5.0] - 2026-09-08

### Added

- **Image understanding**: send images to the bot and it will automatically understand their content (screenshots, photos, charts, etc.), and can analyze them together with text instructions.
- **File sending**: the bot can send local files (documents, images, etc.) directly to you, no longer limited to plain-text replies.
- **Proactive questions**: when the bot encounters uncertain information, it proactively asks you questions, letting you pick an answer with a single tap for smoother interaction.
- **Action confirmation**: before performing sensitive or critical operations, the bot requests confirmation, which you approve or block via "Allow/Deny" buttons.
- **Session compaction**: new `/compact` command to compress the current session history in one step, preserving context while freeing space — ideal for very long conversations.
- **Preset switching**: new `/preset` command to view or switch the bot's persona/behavior preset.
- **Network latency test**: upgraded `/bot-ping` to return network transport time and plugin processing time, making it easier to diagnose connection latency.

### Improved

- Long-task execution timeout extended to 30 minutes, so complex tasks are no longer interrupted mid-way.
- Direct and group chats now receive more context-appropriate system prompts.
- Failed proactive message pushes automatically fall back to passive replies, reducing "the bot didn't respond" situations.
- Media files such as images are automatically cleaned up after use, avoiding long-term disk usage.

### Fixed

- Fixed the `/stop` command not actually aborting in-progress generation (it was previously a no-op).
- Fixed the registration order of the approval channel, ensuring confirmation requests are captured and handled correctly.

### Documentation

- README updated with the new `/preset` and `/compact` commands, plus QR-code upgrade guidance.

## [0.4.0] - 2026-08-16

### Added

- **QR link**: when the QR code renders incorrectly, you can click the link printed in the terminal to complete scanning in a browser.

### Improved

- Supports auto-saving QR credentials on Windows (previously failed due to path issues).
- When auto-saving credentials fails, it now clearly guides manual configuration instead of silently dropping existing config.

### Documentation

- Added QR-code screenshots and upgrade guidance.

## [0.3.0] - 2026-08-15

### Added

- **File understanding**: send a file to the bot and it will automatically download and understand its contents, supporting extract, read, analyze, and more.
- **Streaming replies**: replies are displayed incrementally in real time, no need to wait for full generation — a smoother, more natural experience.
- **Visible progress**: when the bot runs tasks (running commands, reading/writing files), you can see what it is doing — no longer a "black box".
- **Error feedback**: when a task ends abnormally, the bot clearly explains the reason, no more "half replies" or "no response at all".

### Improved

- Correctly displays the speaker's nickname in group chats instead of an unreadable string.
- Automatically clears group chat history after replying to avoid cross-conversation interference.
- Voice messages are recognized and kept as text only, without extra invalid links.
- The bot now "actually gets things done": for requests like "download, extract, install", it executes real tool actions instead of just restating the steps.

### Fixed

- Fixed the bot being unable to read/write files (the working directory was misconfigured).
- Fixed duplicate content and too-few chunks in streaming replies.

## [0.1.0] - 2026-08-14

### Added

- **First release**: QQ bot integrated with an AI assistant, supporting direct and group chats.
- **Model switching**: supports switching between different AI models.
- **Common commands**: built-in help, status query, session management, and more.
- **QR binding**: bind the bot by scanning a QR code on first use, with simple setup.

### Fixed

- Fixed config parsing issues.
