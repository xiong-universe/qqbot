<div align="center">

<img width="120" src="https://img.shields.io/badge/🤖-QQ_Bot-blue?style=for-the-badge" alt="QQ Bot" />

**基于 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) 的 QQ Bot 插件，将 DeepSeek AI 助手接入 QQ 私聊与群聊。**

[![npm version](https://img.shields.io/npm/v/@tencent-connect/dsh-qqbot)](https://www.npmjs.com/package/@tencent-connect/dsh-qqbot)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/tencent-connect/dsh-qqbot)](https://github.com/tencent-connect/dsh-qqbot)
[![QQ Bot](https://img.shields.io/badge/QQ_Bot-API_v2-red)](https://bot.q.qq.com/wiki/)

<br/>

**[English](./README_EN.md) | 简体中文**

扫码加入 QQ 群 / 频道

<table>
<tr>
<td align="center" width="50%"><img src="./assets/docs/qqgroup.jpg" height="360" alt="QQ 群二维码" /><br /><b>QQ 开发者交流群</b><br /><sub>1群: 1032635674 · 2群: 1056948758</sub></td>
<td align="center" width="50%"><img src="./assets/docs/qqchannel.jpg" height="360" alt="QQ 频道二维码" /><br /><b>QQ 开发者社区频道</b><br /><sub>频道号: 20dnumts4z</sub></td>
</tr>
</table>

</div>

## 架构

```
QQ 用户 → QQ WebSocket → dsh-qqbot → ctx.agents → dsh agent loop → LLM
                                 ↑                           │
                                 └── session/event ──────────┘
                                       (assistant reply → QQ sendMarkdown)
```

## 安装

### 方式一：桌面版安装（推荐）

无需命令行，全程在应用内完成：

1. **安装**：左侧栏点击「插件」→「添加插件」→ 输入 `@tencent-connect/dsh-qqbot@latest` → 安装并立即启动

<img src="./assets/docs/install.png" alt="端内添加插件" width="560" />

2. **连接**：左下角头像 → 设置 →「QQ 机器人」→ 手机 QQ 扫码连接

<img src="./assets/docs/setting.png" alt="设置页扫码连接" width="560" />

扫码成功后凭据自动保存，后续启动无需再次扫码。

### 方式二：手动执行

```bash
# 安装到 profile
npx @deepseek-ai/dsh plugin --profile qqbot add @tencent-connect/dsh-qqbot

# 启动
npx @deepseek-ai/dsh --profile qqbot
```

首次启动时，插件检测到凭据未配置会自动进入扫码引导：终端输出二维码 → 手机 QQ 扫码绑定 → 凭据自动保存到 profile，后续启动无需再次扫码。

无端内绑定页的环境（如纯 CLI）可设置 `QQBOT_BIND_OPEN_BROWSER=1`，额外拉起系统浏览器扫码页作为降级通道。

<img src="./assets/docs/qrcode.png" alt="二维码扫码示意图" width="280" />

> **提示**：建议升级至 `0.4.0` 以上版本扫码，支持点击链接在浏览器打开，避免部分终端二维码渲染错位的问题。

### 方式三：本地路径安装

```bash
# 构建
cd /path/to/dsh-qqbot
pnpm install && pnpm build

# 安装到 profile（本地路径）
npx @deepseek-ai/dsh plugin --profile qqbot add /path/to/dsh-qqbot

# 启动
export QQBOT_APPID="你的AppID" QQBOT_SECRET="你的AppSecret"
npx @deepseek-ai/dsh --profile qqbot
```

### 方式四：--patch 开发模式

```bash
export QQBOT_APPID="你的AppID" QQBOT_SECRET="你的AppSecret"
npx @deepseek-ai/dsh web --patch /path/to/dsh-qqbot/cordis.dev.yml
```

### 方式五：从本仓库（fork）安装

本仓库是 `@tencent-connect/dsh-qqbot` 的二次开发分支，构建产物 `lib/` 已入库，直接从 GitHub 安装即可，无需本地构建：

- **桌面版**：左侧栏「插件」→「添加插件」→ 填入仓库地址 `https://github.com/xiong-universe/qqbot`
- **命令行（tarball）**：
  ```bash
  npm pack   # 产出 tencent-connect-dsh-qqbot-0.7.0.tgz
  npx @deepseek-ai/dsh plugin --profile qqbot add ./tencent-connect-dsh-qqbot-0.7.0.tgz
  ```

> 安装 fork 版前请先卸载官方 `@tencent-connect/dsh-qqbot`，避免同一 profile 内出现两份实例。

## 配置项

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `appId` | string | **必填** | QQ Bot AppID（或通过 `QQBOT_APPID` 环境变量） |
| `appSecret` | string | **必填** | QQ Bot AppSecret（或通过 `QQBOT_SECRET` 环境变量） |
| `provider` | string | `deepseek-official` | LLM 提供商名称 |
| `model` | string | `deepseek-chat` | 模型名称 |
| `preset` | string | - | Agent preset id |
| `cwd` | string | `process.cwd()` | Agent 工作目录 |
| `requireMention` | boolean | `true` | 群聊是否需要 @bot 才触发 |
| `globalPrompt` | string | `''` | 全局 system prompt：对所有群聊/私聊生效（多条消息拆分规则建议写在这里） |
| `personas` | array | `[]` | 人格预设列表（QQ 端 `/persona` 切换，可配置 `tools` 工具白名单），见下文 |
| `defaultPersona` | string | `''` | 默认人格 id，留空表示不启用人格 |
| `textChunkLimit` | number | `4500` | 单条消息最大字符数 |
| `streaming` | boolean | `true` | 是否启用流式输出（群聊始终不启用） |
| `replySplitMode` | `none`/`delimiter`/`line`/`paragraph` | `none` | 回复拆分方式：`delimiter` 只在固定分隔符 `|||` 处拆（推荐），`none` 只按长度切分，`line` 每个换行发一条，`paragraph` 按空行分段。开启后自动关闭流式输出 |
| `replySplitIntervalMs` | number | `0` | 拆分后相邻消息的间隔(ms)，`0` 表示立即顺序发送；遇到平台限流可调大 |
| `sessionIdleTimeout` | number | `1800000` | 会话闲置超时(ms)，默认 30 分钟 |
| `processingTimeoutMs` | number | `1800000` | 处理超时(ms)，超时中断当前 LLM 调用 |
| `maxQueue` | number | `20` | 并发队列最大长度 |
| `historyLimit` | number | `10` | 群历史缓冲条数 |
| `askTimeoutMs` | number | `300000` | 待答问题超时(ms)，默认 5 分钟（ask_user_question） |
| `showToolResults` | boolean | `false` | 是否展示工具调用成功结果（错误始终展示） |
| `debug` | boolean | `false` | 调试模式 |

> 拆分说明：推荐 `replySplitMode: delimiter`，分隔符固定为 `|||`（不可配置），模型只在 `|||` 处拆条，正文换行不会触发多条消息；代码块内的分隔符不拆，整体一条。同一 `msg_id` 最多支持 4 次被动回复，超出部分自动降级为主动推送。

### 全局提示词（globalPrompt）

`globalPrompt` 对所有群聊/私聊生效，适合放通用约束（如多条消息拆条规则、语气底线）：

```yaml
- id: im-qqbot
  config:
    replySplitMode: delimiter
    globalPrompt: |
      【多条消息规则】
      - 想把一句话拆成多条气泡时，用固定分隔符 ||| 分隔，例如：真的假的|||你别骗我
      - 只有情绪转折、补充吐槽或停顿时才拆；普通回答不要拆，一次最多 3 条
      - 绝对不要用换行符来分条；一条消息内部可以正常换行
```

### 人格预设（personas）

把原来的单一 prompt 拆成多套人格，可在 QQ 聊天里随时切换：

```yaml
- id: im-qqbot
  config:
    defaultPersona: assistant
    personas:
      - id: assistant
        name: 严谨助手
        prompt: 你是严谨、简洁的助手，回答先给结论。
      - id: catgirl
        name: 猫娘
        prompt: 你是一只可爱的猫娘，句尾带「喵」。
        tools: []          # 纯聊天人格：不绑定任何工具
        expressions:
          kaomoji:
            enabled: true  # 必须显式开启
            style: cat     # 颜文字风格：daily/genki/chuuni/cat/tsundere/soft/cool/maid
      - id: media
        name: 看图助手
        prompt: 你擅长看图和发文件。
        tools:
          - qqbot_describe_image
          - qqbot_send_file
```

- `id`：字母/数字/`-`/`_`，1–64 位，列表内唯一；`name` 是 QQ 菜单展示名；`prompt` 是该人格的 system prompt；`tools` 是该人格可用的工具白名单。
- `expressions.kaomoji`：**颜文字**（可选，必须显式 `enabled: true` 才启用）。按气质选一套风格（`daily` 日常 / `genki` 元气 / `chuuni` 中二 / `cat` 猫系 / `tsundere` 傲娇 / `soft` 温柔 / `cool` 清冷 / `maid` 女仆，缺省 `daily`）；运行时把该风格的颜文字清单与使用规则（可加语气、一条回复最多 1 个）并入人格 prompt，**不需要工具调用**。
  - `enabled`：是否启用（缺省 `false`）。之所以要求显式开启，是因为配置 Schema 会为每个人格物化默认子对象，只看「有没有 `kaomoji`」会让所有人格都被误开。
  - `maxPerReply`：一条回复最多用几个颜文字（1–3，缺省 1）。
  - `custom`：自定义补充颜文字（最多 20 条，每条 ≤32 字），排在预设清单之后供模型挑选。
  - 颜文字库在 `src/expressions/kaomoji.ts`，按情绪分组；后续表情包（图片）会在同一 `expressions` 容器下新增 `sticker`，人格配置形态不变。
- **工具权限是硬约束，不是提示词**：QQ 会话在运行时通过 `tools.restrict({ allow })` 限制模型可见的工具，白名单之外的工具模型根本看不到、调不到（宿主 preset 里的文件读写、命令执行、子 agent、定时任务等一律被挡掉）。
  - 不写 `tools`（缺省）：使用**默认放行清单**——7 个插件内置工具（`qqbot_solve`、`qqbot_describe_image`、`qqbot_send_file`、`qqbot_translate`、`qqbot_summarize`、`qqbot_explain`、`qqbot_rewrite`）+ `ask_user_question` + 只读的 `web_search` / `web_fetch`。
  - `tools: []`：该人格没有任何工具能力（不能做题、看图、发文件、翻译/总结，也不能联网）。
  - 人格写的 `tools` 与默认清单**求交**：默认清单之外的名字（如 `read`、`write`、`pwsh`、`bash`）不会生效，日志会告警「配置了默认不开放的工具（已禁用）」；未注册的名字会被忽略。
  - 切换人格后工具权限**立即重新绑定**，无需 `/new`；`/tools` 可查看当前人格的绑定（仅管理员，诊断用，不在命令菜单中展示）。
  - 日常绑定建议在设置面板里做：展开人格卡片 → 开启「限制可用工具」→ 从下拉里逐个选择（候选只有插件内置工具，已选的显示为可删除的标签）。
- **人格按会话隔离**：群聊按群 ID、私聊按用户 ID 分别记录，同一个群里切人格不会影响其他群或其他私聊。
- 生效优先级：本会话 `/persona <id>` 选择 > `defaultPersona`；都没有则不启用人格（仅保留 `globalPrompt`）。
- 注入顺序：`globalPrompt`（order 80）→ 身份说明（order 82，配置了 `identity` 时）→ 人格 prompt（order 85）→ 工具权限说明（order 86，配置了 `tools` 时）→ 记忆与关系（order 87，开启 `memory` 时）；人格只描述「是谁」，拆条等通用规则统一写在 `globalPrompt`。
- 人格在每次构建 system prompt 时注入，切换后**下一条消息**即生效，无需 `/new`。
- 多条消息统一用固定分隔符 `|||`，并配合 `replySplitMode: delimiter`；人格 prompt 里无需重复约定。
- 也可以在 dsh 设置面板的「人格预设」页签里增删改（卡片默认收起，点击展开编辑），保存后自动重载。

### 身份与权限（identity）

按 openid 判定「这条消息是谁发的」，并在消息前注入身份标签，人格据此决定称呼与亲疏：

```yaml
- id: im-qqbot
  config:
    identity:
      enabled: true
      ownerOpenIds:
        - 8E4BF9DF3A321BC03F55845EE32C623D   # 主人（私聊 user_openid）
      adminOpenIds: []                        # 管理员
      friendOpenIds: []                       # 朋友
```

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `identity.enabled` | boolean | `true` | 是否启用身份识别；三份名单都为空时不注入标签 |
| `identity.ownerOpenIds` | string[] | `[]` | 主人 openid，人格里的专属称呼只对这些人生效 |
| `identity.adminOpenIds` | string[] | `[]` | 管理员 openid |
| `identity.friendOpenIds` | string[] | `[]` | 朋友 openid；未命中任何名单的人都是「陌生人」 |

- 注入形式：消息开头加 `[身份: 主人] ` 这样的标签（私聊也会带，旧版本私聊完全不注入发送者信息）。群聊历史里的每条记录同样带标签。
- 人格提示词只写「身份: 主人」这类标签，**不要写死 openid**——换 AppID、私聊/群聊都会让 openid 变化。
- **私聊与群聊的 openid 不同**（`user_openid` / `member_openid`），同一个账号需要分别添加；在 QQ 里发送 `/whoami` 可查看当前场景的 openid。
- 也可以在设置面板「身份与权限」页签里编辑三份名单，保存后自动重载。
- 身份标签只影响模型的称呼与语气，不放宽 `access` 访问控制（白名单仍然生效）。

### 长期记忆与关系状态（memory）

按会话独立保存「聊过什么 + 关系进展」，与会话历史解耦：`/new` 只重置上下文，记忆仍在；重启后同样保留（`~/.dsh-qqbot/memory.json`）。

```yaml
- id: im-qqbot
  config:
    memory:
      enabled: true       # 关闭后不写盘、不注入
      autoCapture: true   # 从用户自述里自动提取要点
      maxNotes: 20        # 每个会话最多保留的要点条数（超出淘汰最旧）
```

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `memory.enabled` | boolean | `true` | 是否启用记忆与关系状态；关闭后不写盘、不注入 |
| `memory.autoCapture` | boolean | `true` | 是否自动捕获「我叫… / 我喜欢… / 我住在…」这类自述；不额外调用模型 |
| `memory.maxNotes` | number | `20` | 每个会话最多保留的要点条数（1–100），超出淘汰最旧 |

- **关系阶段**由累计互动次数推导：初识（<5）→ 眼熟（<20）→ 熟悉（<60）→ 亲近（<200）→ 很亲近；只影响亲近程度，不改变身份设定。
- **自动捕获是保守启发式**：只匹配明确的自述句式，跳过疑问句与「他说/听说」这类转述；宁可少记也不乱记。
- **群聊按群记录**：同一群里不同说话人的要点会带 `[昵称]` 前缀，避免把 A 的自述算到 B 头上。
- **注入内容**：认识天数、互动次数、关系阶段与要点清单，并要求模型只在相关话题时自然提起、不复述清单、不编造未记录的内容。
- 可在 QQ 端用 `/memory` 查看和管理（仅管理员），也可在设置面板「记忆与关系」页签调整开关与条数。

### 访问控制（access）

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `access.c2cMode` | `open`/`allowlist`/`disabled` | `open` | 私聊访问模式 |
| `access.c2cAllow` | string[] | `[]` | 私聊白名单（user openid） |
| `access.groupMode` | `open`/`allowlist`/`disabled` | `open` | 群聊访问模式 |
| `access.groupAllow` | string[] | `[]` | 群聊白名单（group openid） |

### 富媒体理解（media）

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `media.enabled` | boolean | `true` | 是否启用富媒体理解（图片/视频下载 + 工具分析） |
| `media.maxMB` | number | `200` | 富媒体下载大小上限(MB) |
| `media.ttlHours` | number | `24` | 富媒体存活时长(小时)，0=永不过期 |

### 视觉理解（vision）

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `vision.enabled` | boolean | `false` | 是否启用视觉理解（qqbot_describe_image 工具） |
| `vision.provider` | string | - | 视觉模型 provider（如 pi-ai） |
| `vision.model` | string | - | 视觉模型 id（如 qwen-vl-max） |
| `vision.maxBytes` | number | `10MB` | 图片字节上限 |
| `vision.maxTokens` | number | `1024` | 输出 token 上限 |
| `vision.timeoutMs` | number | `120000` | 视觉调用超时(ms) |

### 附件发送（sendFile）

| 配置 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `sendFile.restrictPaths` | boolean | `true` | 是否启用路径白名单（仅 media + cwd + extraRoots） |
| `sendFile.extraRoots` | string[] | `[]` | 额外允许访问的根目录 |

## 内置命令

| 命令 | 说明 |
|------|------|
| `/new`（别名 `/reset` `/clear`） | 开始新会话（清空上下文，仅管理员） |
| `/compact` | 压缩会话历史（摘要替换旧记录，保留上下文，仅管理员） |
| `/model` | 查看或切换模型（仅管理员） |
| `/preset` | 查看或切换 agent preset（新会话生效，仅管理员） |
| `/persona`（别名 `/人格`） | 查看人格菜单并切换人格（下一条消息生效，仅管理员）；`/persona default` 跟随默认，`/persona off` 关闭本会话人格 |
| `/tools`（别名 `/工具`） | 诊断用：查看当前人格的工具绑定与宿主可用工具清单（仅管理员，不在命令菜单中展示）；日常在设置面板用下拉绑定工具 |
| `/memory`（别名 `/记忆`） | 查看本会话的长期记忆与关系阶段（仅管理员）；`/memory add <内容>` 手动记一条，`/memory del <序号>` 删除，`/memory clear` 清空要点 |
| `/whoami`（别名 `/我是谁`） | 查看当前场景下的 openid 与被判定的身份（配置主人/管理员名单用） |
| `/stop` | 中止当前生成（仅管理员，不在菜单中展示） |
| `/bot-ping` | 网络延迟检测（返回传输与处理耗时） |
| `/bot-version` | 查看版本信息（模型信息仅管理员可见） |
| `/bot-status` | 查看当前会话状态（含模型/Preset，仅管理员） |
| `/bot-help` | 查看当前身份可用的指令（非管理员看不到管理类指令） |

> 权限与 `identity` 名单一致：主人/管理员可用管理类指令，朋友/陌生人只能看到并使用 `/whoami`、`/bot-ping`、`/bot-version`、`/bot-help`。
> **身份名单为空时视为未启用权限控制**，所有人仍可使用全部指令（避免新配置把自己锁在外面）。

## 核心模块

```
src/
├── index.ts                    # Cordis 插件入口（async apply）
├── config.ts                   # 配置 Schema
├── types.ts                    # 全局类型定义
├── setup/                      # 凭据绑定（扫码）
│   ├── index.ts                # 绑定编排（ensureCredentials）
│   ├── binding-service.ts      # 扫码状态机（宿主内唯一事实源）
│   ├── bind-routes.ts          # 端内绑定页路由（/qqbot/im-qqbot/bind）
│   ├── presenters.ts           # 呈现策略（终端/浏览器降级）
│   ├── qr-svg.ts               # 二维码 SVG 渲染（宿主侧）
│   └── persist.ts              # 凭据写入 cordis.patch.yml
├── client/                     # 浏览器半边（dsh.client Web Bundle）
│   ├── index.ts                # 侧栏 Tab 注册 + 待绑定自动引导
│   └── bind-page.ts             # 端内绑定页（二维码 + 状态轮询）
├── gateway/                    # 网关装配
│   ├── bootstrap.ts            # 启动装配（监听 session/event 等）
│   └── middleware-setup.ts     # 中间件链配置
├── transport/                  # 传输层
│   ├── inbound.ts              # QQ 入站消息 → agent.followup()
│   ├── outbound.ts             # session/event → QQ sendMarkdown
│   ├── outbound-buffer.ts      # 流式缓冲
│   ├── streaming-writer.ts     # 流式写入
│   ├── reply-target.ts         # 回复目标解析
│   ├── msgid-cache.ts          # 被动回复 msgid 缓存
│   ├── reply-limiter.ts        # 被动回复限流
│   ├── tool-presenter.ts       # 工具调用展示
│   └── chunker.ts              # Markdown 文本切分
├── session/                    # 会话管理层
│   ├── session-manager.ts      # QQ peer → Agent 映射
│   └── idle-evictor.ts         # 闲置回收
├── model/                      # 模型路由层
│   ├── model-resolver.ts       # 路由解析
│   ├── prefs-store.ts          # per-peer 偏好持久化（模型/preset/人格）
│   └── settings-reader.ts      # settings.yaml 只读
├── personas/                   # 人格预设
│   ├── persona-utils.ts        # 人格解析 + system prompt section 构造
│   └── persona-tools.ts        # 人格工具白名单 → tools.restrict 硬约束
├── identity/                   # 身份识别
│   └── role.ts                 # openid → 主人/管理员/朋友/陌生人 + 身份标签注入
├── memory/                     # 长期记忆与关系状态
│   ├── memory-store.ts         # ~/.dsh-qqbot/memory.json 持久化
│   └── memory-prompt.ts        # 关系阶段 / 自述捕获 / prompt section（order 87）
├── features/                   # 交互特性
│   ├── question-channel.ts     # ask_user_question 问答通道
│   ├── approval-channel.ts     # approval 审批确认通道
│   └── answer-parser.ts        # 答案解析
├── media/                      # 多媒体
│   ├── vision-tool.ts          # 图片视觉理解
│   ├── send-file-tool.ts       # 发送本地文件
│   └── media-cleaner.ts        # 媒体 TTL 清理
├── middleware/                 # 中间件
│   ├── question-answer.ts      # 问答答案处理
│   └── attachment.ts           # 附件处理
├── shared/                     # 共享工具
│   ├── utils.ts                # 通用函数
│   ├── scope.ts                # scope/peer 提取
│   └── send-helper.ts          # 分块发送
└── commands/                   # 斜杠命令
```

## 会话路由

sessionKey: `qqbot:${appId}:${scope}:${peerId}`，新会话铸造 UUID 会话 id 并持久化到 `model-prefs.json`，重启后按持久化 id 恢复；0.5.x 老会话按原派生 id 沿用。

解析策略：进程内复用 → 持久化恢复 → 全新创建。

## 设计原则

- **纯 Cordis 插件** — 遵循 dsh "Plugins, not loop changes" 原则
- **声明式依赖** — `inject = ['agents']`，不直接耦合其他插件
- **会话隔离** — 每个 QQ 私聊用户/群聊各一个独立 Agent
- **Preset 支持** — 可通过 `agent-presets` 服务挂载预设（工具集、prompt 等）
- **长期记忆** — 按会话保存互动次数、关系阶段与要点（`memory.json`），`/new` 与重启都不清除
- **闲置回收** — 超时自动 dispose Agent，防止内存泄漏
- **Markdown 输出** — 回复以 Markdown 格式发送，支持代码块/表格感知切分
- **图片理解** — 支持 `qqbot_describe_image` 视觉理解，可分析用户发送的图片
- **做题** — 支持 `qqbot_solve` 解题（题干文本 / 题目截图，走会话当前模型），固定输出「答案 + 过程」两段
- **文本小工具** — `qqbot_translate`（翻译）、`qqbot_summarize`（长文总结）、`qqbot_explain`（讲解概念/代码/报错）、`qqbot_rewrite`（改写润色），同样走会话当前模型，无需额外依赖
- **颜文字** — 人格可开启 `expressions.kaomoji`，按气质选风格（日常 / 元气 / 中二 / 猫系 / 傲娇 / 温柔 / 清冷 / 女仆），按情绪分组直接注入 prompt，不额外调用工具
- **附件发送** — 支持 `qqbot_send_file` 将本地文件发送给用户（默认启用路径白名单）
- **工具默认收敛** — QQ 会话默认只放行插件内置工具 + 只读联网/提问能力，宿主的文件读写与命令执行不对外开放
- **问答互动** — 支持 `ask_user_question`，单选生成内联按钮（点一个其余变灰）、多选回复编号，逐题推进 + 问题级超时
- **操作确认** — 支持 `approval/request`，关键操作通过「允许/拒绝」按钮请求用户确认

## 本地开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 开发模式（watch）
pnpm dev

# 用 --patch 方式调试
export QQBOT_APPID="xxx" QQBOT_SECRET="xxx"
npx @deepseek-ai/dsh web --patch /path/to/dsh-qqbot/cordis.dev.yml
```

## License

[MIT](./LICENSE)
