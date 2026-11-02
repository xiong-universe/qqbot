/**
 * 插件自更新 — 安装方式识别、远端检查与执行
 *
 * 背景：桌面版插件管理器只对带 installTarget 的市场条目显示「可更新」；
 * 通过 git 地址自装的包没有 installTarget，升级时 lockfile 又固定旧 commit，
 * 所以用户只能卸载重装。本模块补上这条链路：
 *
 * 1. 从 profile 的 package.json 读依赖写法，从 pnpm-lock.yaml 读已装引用；
 * 2. git 依赖用 `git ls-remote` 对比远端 HEAD，npm 依赖查询 registry；
 * 3. 更新交给宿主的 desktopPnpm 执行 `dsh plugin update <包名>`（pnpm update），
 *    完成后由宿主触发 HMR 重组合，插件模块从磁盘重新加载。
 *
 * 本模块不做任何写操作；更新执行由调用方注入 runner（便于测试与宿主降级）。
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parse } from 'yaml';
import type { UpdateCheckWire, UpdateInstallKind, UpdateInstallWire } from '../shared/bind-protocol.ts';

/** 安装信息（在线上协议之外额外携带 profile 目录，供更新执行使用） */
export interface InstallationInfo extends UpdateInstallWire {
  /** profile 目录（更新命令的 cwd；不返回给客户端） */
  profileDir?: string;
}

/** 远端检查结果 */
export type UpdateCheckResult = UpdateCheckWire;

/** 更新执行结果 */
export interface UpdateRunResult {
  ok: boolean;
  exitCode: number | null;
  message: string;
}

/** 宿主注入的更新执行器：argv = 透传给 pnpm 的参数，cwd = profile 目录 */
export interface UpdateCommandRunner {
  (argv: string[], cwd: string): Promise<{ exitCode: number | null; output?: string }>;
}

/** 外部命令依赖（测试可注入，避免真实网络请求） */
export interface UpdateCheckDeps {
  /** 读取 git 远端引用（缺省 `git ls-remote`） */
  lsRemote?: (url: string, ref?: string) => Promise<string>;
  /** 读取 npm registry 最新版本（缺省请求 registry） */
  fetchLatestVersion?: (packageName: string) => Promise<string>;
}

/** 识别安装方式时的输入 */
export interface InspectOptions {
  packageName: string;
  /** 当前加载的插件版本 */
  version: string;
  profileDir: string | null;
  /** 宿主是否提供一键更新能力 */
  canUpdate?: boolean;
}

/** 本地路径类依赖（源码直载 / link 安装，无法自更新） */
const LOCAL_PREFIXES = ['file:', 'link:', 'portal:', 'workspace:'];

/** git 托管平台的简写前缀 */
const GIT_HOSTS: Record<string, string> = {
  github: 'https://github.com',
  gitee: 'https://gitee.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://bitbucket.org',
};

/** 常见 git 托管平台的网页地址（`https://github.com/owner/repo` 不带 .git 也按 git 处理） */
const GIT_HOST_URL = /^https?:\/\/(?:www\.)?(?:github|gitee|gitlab|bitbucket)\.[a-z]+(?::\d+)?\/\S+/i;

/** git ls-remote 的超时（远端不可达时不至于卡住面板） */
const GIT_LS_REMOTE_TIMEOUT_MS = 20_000;

/** registry 查询超时 */
const REGISTRY_TIMEOUT_MS = 15_000;

/** 更新命令输出保留的尾部长度（失败时展示给用户） */
const OUTPUT_TAIL_CHARS = 600;

/**
 * 判断依赖写法属于哪种安装方式。
 *
 * 先排除本地路径，再识别显式 git 地址与 `github:owner/repo` 简写，
 * 最后把 semver / tag 形态归为 npm；无法识别的返回 unknown。
 */
export function classifySpec(spec: string | undefined): UpdateInstallKind {
  const text = spec?.trim() ?? '';
  if (text === '') return 'unknown';
  if (LOCAL_PREFIXES.some((prefix) => text.startsWith(prefix))) return 'local';
  if (
    text.startsWith('git+') || text.startsWith('git://') || text.startsWith('ssh://')
    || text.startsWith('git@') || /^https?:\/\/\S+\.git(?:#.*)?$/i.test(text)
  ) {
    return 'git';
  }
  // README 推荐的 fork 安装写法是仓库网页地址（不带 .git），也按 git 处理
  if (GIT_HOST_URL.test(text) && !/\.(?:tgz|tar\.gz|tar)(?:#.*)?$/i.test(text)) return 'git';
  const hostShorthand = /^(github|gitee|gitlab|bitbucket):\S+/i.exec(text);
  if (hostShorthand !== null) return 'git';
  // 裸 owner/repo 是 GitHub 简写（npm 包名不会出现斜杠，scope 包以 @ 开头）
  if (/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+(#.+)?$/.test(text)) return 'git';
  if (looksLikeNpmSpec(text)) return 'npm';
  return 'unknown';
}

/** semver / dist-tag 形态（`1.2.3`、`^1.2`、`latest`、`npm:alias@1` 等） */
function looksLikeNpmSpec(spec: string): boolean {
  if (spec.startsWith('npm:')) return true;
  if (spec === '*' || spec === 'latest' || spec === 'next' || spec === 'beta') return true;
  if (/^[v=<>~^*]?\d+(?:\.\d+){0,2}(?:[-+].*)?$/.test(spec)) return true;
  // 区间写法（>=1 <2）与 dist-tag
  if (/^(?:>=?|<=?|~|^)\s*v?\d/.test(spec)) return true;
  // 纯标识符 = dist-tag（latest / next / canary …）
  return /^[a-z][a-z0-9._-]*$/i.test(spec);
}

/**
 * 把 git 依赖写法拆成「远端 URL + 可选 ref」。
 *
 * 支持 `git+https://…`、`https://….git`、`ssh://`、`git@host:path`、
 * `github:owner/repo` 与裸 `owner/repo` 简写；`#` 之后视为分支/标签。
 * 无法解析时返回 null（避免把 npm 包误判成 git 远端）。
 */
export function parseGitSpec(spec: string): { url: string; ref?: string } | null {
  let text = spec.trim();
  if (text === '' || classifySpec(text) !== 'git') return null;

  let ref: string | undefined;
  const hash = text.lastIndexOf('#');
  if (hash >= 0) {
    const tail = text.slice(hash + 1).trim();
    ref = tail === '' ? undefined : tail;
    text = text.slice(0, hash);
  }

  const shorthand = /^(github|gitee|gitlab|bitbucket):(.+)$/i.exec(text);
  if (shorthand !== null) {
    const host = GIT_HOSTS[shorthand[1]!.toLowerCase()]!;
    const repo = shorthand[2]!.replace(/\.git$/, '');
    return { url: `${host}/${repo}.git`, ...(ref !== undefined ? { ref } : {}) };
  }

  if (/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(text)) {
    return { url: `https://github.com/${text}.git`, ...(ref !== undefined ? { ref } : {}) };
  }

  text = text.replace(/^git\+/, '');
  return { url: text, ...(ref !== undefined ? { ref } : {}) };
}

/** 短引用（commit 显示前 7 位；版本号原样返回） */
export function shortRef(ref: string): string {
  return /^[0-9a-f]{7,40}$/i.test(ref) ? ref.slice(0, 7) : ref;
}

/** commit 是否相同（支持 short / full 互比） */
export function sameCommit(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === '' || right === '') return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

/** ref 是否被固定成具体 commit（固定后不再跟随远端） */
function isPinnedRef(ref: string | undefined): boolean {
  return ref !== undefined && /^[0-9a-f]{7,40}$/i.test(ref);
}

/** 版本号比较（仅覆盖日常 semver 场景：数字段 + 预发布标识） */
export function compareVersions(a: string, b: string): number {
  const parseVersion = (raw: string): { nums: number[]; pre: string[] } => {
    const value = raw.trim().replace(/^v/, '').split('+')[0] ?? '';
    const dash = value.indexOf('-');
    const core = dash >= 0 ? value.slice(0, dash) : value;
    const pre = dash >= 0 ? value.slice(dash + 1) : '';
    return {
      nums: core.split('.').map((part) => {
        const number = Number.parseInt(part, 10);
        return Number.isFinite(number) ? number : 0;
      }),
      pre: pre === '' ? [] : pre.split('.'),
    };
  };
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.nums.length, right.nums.length);
  for (let i = 0; i < length; i++) {
    const diff = (left.nums[i] ?? 0) - (right.nums[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  // 正式版 > 预发布版
  if (left.pre.length === 0 && right.pre.length > 0) return 1;
  if (right.pre.length === 0 && left.pre.length > 0) return -1;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const leftPart = left.pre[i];
    const rightPart = right.pre[i];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumber = Number.parseInt(leftPart, 10);
    const rightNumber = Number.parseInt(rightPart, 10);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      if (leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1;
      continue;
    }
    if (leftPart !== rightPart) return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

/** lockfile 里本包的直接依赖记录 */
interface LockedDependency {
  specifier?: string;
  version?: string;
  commit?: string;
  repo?: string;
}

/** pnpm-lock.yaml 的局部投影 */
interface LockfileShape {
  importers?: Record<string, {
    dependencies?: Record<string, { specifier?: string; version?: string }>;
    devDependencies?: Record<string, { specifier?: string; version?: string }>;
  }>;
  packages?: Record<string, { resolution?: { commit?: string; repo?: string; type?: string } }>;
}

/** 读取 lockfile 中本包的直接依赖与 git resolution（解析失败按无 lockfile 处理） */
function readLockedDependency(profileDir: string, packageName: string): LockedDependency | undefined {
  const lockPath = resolve(profileDir, 'pnpm-lock.yaml');
  if (!existsSync(lockPath)) return undefined;
  let lock: LockfileShape;
  try {
    lock = parse(readFileSync(lockPath, 'utf8')) as LockfileShape;
  } catch {
    return undefined;
  }
  const importers = lock.importers ?? {};
  const importer = importers['.'] ?? Object.values(importers)[0];
  const direct = importer?.dependencies?.[packageName] ?? importer?.devDependencies?.[packageName];
  const version = typeof direct?.version === 'string' ? direct.version : undefined;
  const specifier = typeof direct?.specifier === 'string' ? direct.specifier : undefined;

  let commit: string | undefined;
  let repo: string | undefined;
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (!key.startsWith(`${packageName}@`)) continue;
    if (version !== undefined && key !== `${packageName}@${version}`) continue;
    const resolution = entry?.resolution;
    if (typeof resolution?.commit === 'string' && resolution.commit !== '') commit = resolution.commit;
    if (typeof resolution?.repo === 'string' && resolution.repo !== '') repo = resolution.repo;
    if (commit !== undefined) break;
  }

  // git 依赖的 lock version 形如 git+https://…git#<commit>，resolution 缺失时从 # 后兜底
  if (commit === undefined && version !== undefined) {
    const hash = version.lastIndexOf('#');
    const tail = hash >= 0 ? version.slice(hash + 1).trim() : '';
    if (/^[0-9a-f]{7,40}$/i.test(tail)) commit = tail;
  }
  return { specifier, version, commit, repo };
}

/** 读取 profile package.json 中本包的依赖写法（dependencies 优先，其次 devDependencies） */
function readProfileSpec(profileDir: string, packageName: string): string | undefined {
  const manifestPath = resolve(profileDir, 'package.json');
  if (!existsSync(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return manifest.dependencies?.[packageName] ?? manifest.devDependencies?.[packageName];
  } catch {
    return undefined;
  }
}

/** 手动更新命令（CLI 与桌面版都可用：`dsh plugin update` 会把参数透传给 pnpm） */
export function buildUpdateCommand(packageName: string, profileName: string): string {
  return `dsh plugin --profile ${profileName} update ${packageName}`;
}

/**
 * 识别当前安装信息。
 *
 * 依赖写法以 profile 的 package.json 为准（lockfile 的 specifier 作为兜底），
 * 已装引用以 lockfile 为准；识别不到 profile/依赖时返回 unknown，
 * 面板据此提示「源码直载不支持自更新」。
 */
export function inspectInstallation(options: InspectOptions): InstallationInfo {
  const { packageName, version, profileDir, canUpdate = false } = options;
  const profileName = profileDir === null ? 'desktop' : basename(profileDir) || 'desktop';
  const command = buildUpdateCommand(packageName, profileName);

  if (profileDir === null) {
    return {
      packageName,
      kind: 'unknown',
      version,
      installed: version,
      canUpdate: false,
      command,
      message: '未定位到 profile 目录（源码直载或非常规安装），不支持自更新；请更新源码后重启。',
    };
  }

  const locked = readLockedDependency(profileDir, packageName);
  const spec = readProfileSpec(profileDir, packageName) ?? locked?.specifier;
  const classified = classifySpec(spec);
  // profile 里没有依赖写法时，从 lockfile 记录反推（有 commit = git，有版本号 = npm）
  const kind = classified !== 'unknown'
    ? classified
    : locked?.commit !== undefined
      ? 'git'
      : locked?.version !== undefined ? 'npm' : 'unknown';

  const parsedGit = kind === 'git' && spec !== undefined ? parseGitSpec(spec) : null;
  const remote = parsedGit?.url ?? locked?.repo;
  const installed = kind === 'git'
    ? (locked?.commit ?? '')
    : kind === 'npm'
      ? (locked?.version ?? version)
      : kind === 'local'
        ? (spec ?? '')
        : version;

  const supported = kind === 'git' || kind === 'npm';
  const message = kind === 'local'
    ? '本地路径 / link 安装不支持自更新，请更新源码后重启 DSH。'
    : kind === 'unknown'
      ? '未在 profile 中找到本插件依赖，无法判断更新方式；请手动更新。'
      : kind === 'git' && remote === undefined
        ? '未能解析 git 远端地址，仍可尝试一键更新。'
        : undefined;

  return {
    packageName,
    kind,
    version,
    installed,
    ...(spec !== undefined ? { spec } : {}),
    ...(remote !== undefined ? { remote } : {}),
    ...(parsedGit?.ref !== undefined ? { ref: parsedGit.ref } : {}),
    canUpdate: canUpdate && supported,
    command,
    ...(message !== undefined ? { message } : {}),
    profileDir,
  };
}

/** `git ls-remote` 取远端引用（ref 缺省读默认分支 HEAD） */
async function defaultLsRemote(url: string, ref?: string): Promise<string> {
  const pattern = ref !== undefined && ref !== '' ? ref : 'HEAD';
  const stdout = await execFileText('git', ['ls-remote', url, pattern]);
  const rows = stdout.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const [sha, name] = line.split('\t');
      return { sha: sha ?? '', name: name ?? '' };
    })
    .filter((row) => /^[0-9a-f]{40}$/i.test(row.sha));

  if (rows.length === 0) {
    if (pattern !== 'HEAD') {
      // 分支/标签名不存在时退回默认分支，避免把「写错 ref」误报成无更新
      return defaultLsRemote(url, undefined);
    }
    throw new Error('远端仓库没有可用的分支');
  }
  const exact = [
    `refs/heads/${pattern}`,
    `refs/tags/${pattern}`,
  ];
  const hit = rows.find((row) => exact.includes(row.name)) ?? rows[0]!;
  return hit.sha;
}

/** 执行外部命令并返回 stdout（带超时与「不弹认证输入」环境） */
function execFileText(file: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      file,
      args,
      {
        timeout: GIT_LS_REMOTE_TIMEOUT_MS,
        windowsHide: true,
        env: {
          ...process.env,
          // 没有终端可交互：私有仓库缺凭据时立即失败，而不是挂起等待输入
          GIT_TERMINAL_PROMPT: '0',
          GIT_ASKPASS: process.env.GIT_ASKPASS ?? 'echo',
        },
      },
      (error, stdout) => {
        if (error === null) {
          resolvePromise(stdout);
          return;
        }
        const detail = typeof (error as { stderr?: unknown }).stderr === 'string'
          ? (error as { stderr: string }).stderr.trim()
          : '';
        const timedOut = (error as { killed?: boolean }).killed === true;
        reject(new Error(timedOut
          ? `git ls-remote 超时（${GIT_LS_REMOTE_TIMEOUT_MS / 1000}s）`
          : detail !== '' ? detail : error.message));
      },
    );
  });
}

/** 查询 npm registry 最新版本（scoped 包的 / 需要转义成 %2F） */
async function defaultFetchLatestVersion(packageName: string): Promise<string> {
  const registry = (process.env.npm_config_registry
    ?? process.env.NPM_CONFIG_REGISTRY
    ?? 'https://registry.npmjs.org').replace(/\/$/, '');
  const encoded = packageName.startsWith('@')
    ? packageName.replace('/', '%2F')
    : encodeURIComponent(packageName);
  const response = await fetch(`${registry}/${encoded}/latest`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`registry 查询失败（HTTP ${response.status}）`);
  }
  const body = await response.json() as { version?: unknown };
  if (typeof body.version !== 'string' || body.version === '') {
    throw new Error('registry 未返回版本号');
  }
  return body.version;
}

/**
 * 对比远端是否有新版本。
 *
 * git：远端 HEAD / 指定 ref 的 commit 与 lockfile 记录不同即可更新；
 * npm：registry 的 latest 高于已装版本才提示（避免预览版误报）。
 * 本地安装抛出错误（面板会展示为「不支持检测」）。
 */
export async function checkForUpdate(
  info: InstallationInfo,
  deps: UpdateCheckDeps = {},
): Promise<UpdateCheckResult> {
  const checkedAt = Date.now();

  if (info.kind === 'git') {
    if (info.remote === undefined) {
      throw new Error('未能解析 git 远端地址，无法检查更新');
    }
    if (isPinnedRef(info.ref)) {
      return {
        updateAvailable: false,
        latest: info.ref!,
        checkedAt,
        message: '依赖已固定到指定 commit，不会自动跟随远端更新。',
      };
    }
    const latest = await (deps.lsRemote ?? defaultLsRemote)(info.remote, info.ref);
    const updateAvailable = !sameCommit(latest, info.installed);
    return {
      updateAvailable,
      latest,
      checkedAt,
      message: updateAvailable
        ? `发现新版本：本地 ${shortRef(info.installed || '未知')} → 远端 ${shortRef(latest)}`
        : `已是最新（${shortRef(latest)}）`,
    };
  }

  if (info.kind === 'npm') {
    const latest = await (deps.fetchLatestVersion ?? defaultFetchLatestVersion)(info.packageName);
    // 以 lockfile 记录的已装版本为准（拿不到时才退回当前加载版本）
    const current = info.installed !== '' ? info.installed : info.version;
    const updateAvailable = compareVersions(latest, current) > 0;
    return {
      updateAvailable,
      latest,
      checkedAt,
      message: updateAvailable
        ? `发现新版本：${current} → ${latest}`
        : `已是最新（${latest}）`,
    };
  }

  throw new Error(info.message ?? '当前安装方式不支持自动检查更新');
}

/** 更新命令输出只保留尾部，避免把整段 pnpm 日志塞进响应 */
function tailOf(output: string | undefined): string {
  const text = (output ?? '').trim();
  return text.length > OUTPUT_TAIL_CHARS ? text.slice(-OUTPUT_TAIL_CHARS) : text;
}

/**
 * 执行更新。
 *
 * runner 由宿主注入（桌面版走 desktopPnpm，内部执行 `dsh plugin update`）。
 * 没有 runner 时只返回手动命令提示，不会静默什么都没做。
 */
export async function runUpdate(
  info: InstallationInfo,
  runner?: UpdateCommandRunner,
): Promise<UpdateRunResult> {
  if (info.kind !== 'git' && info.kind !== 'npm') {
    return { ok: false, exitCode: null, message: info.message ?? '当前安装方式不支持一键更新。' };
  }
  if (info.profileDir === undefined) {
    return { ok: false, exitCode: null, message: '未定位到 profile 目录，无法执行更新。' };
  }
  if (runner === undefined) {
    return {
      ok: false,
      exitCode: null,
      message: `当前宿主不支持一键更新，请手动执行：${info.command}`,
    };
  }

  try {
    const result = await runner(['update', info.packageName], info.profileDir);
    if (result.exitCode !== 0) {
      const tail = tailOf(result.output);
      return {
        ok: false,
        exitCode: result.exitCode,
        message: `更新命令失败（退出码 ${result.exitCode ?? 'unknown'}）${tail === '' ? '' : `：${tail}`}`,
      };
    }
    return { ok: true, exitCode: 0, message: '更新完成，插件正在重载。' };
  } catch (err) {
    return {
      ok: false,
      exitCode: null,
      message: `更新命令执行失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
