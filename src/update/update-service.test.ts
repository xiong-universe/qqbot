/**
 * 插件自更新服务测试
 *
 * 覆盖安装方式识别、git/npm 检查与更新执行；不触达真实网络
 * （ls-remote 与 registry 查询都通过 deps 注入）。
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildUpdateCommand,
  checkForUpdate,
  classifySpec,
  compareVersions,
  inspectInstallation,
  parseGitSpec,
  runUpdate,
  sameCommit,
  shortRef,
} from './update-service.ts';

const PACKAGE = '@tencent-connect/dsh-qqbot';
const OLD_COMMIT = '889ef5232dfe48d8e2954d41be0866d749229c3e';
const NEW_COMMIT = 'abcdef0123456789abcdef0123456789abcdef01';

const tempDirs: string[] = [];

function makeProfile(files: { manifest?: unknown; lockfile?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-qqbot-update-'));
  tempDirs.push(dir);
  if (files.manifest !== undefined) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify(files.manifest, null, 2), 'utf8');
  }
  if (files.lockfile !== undefined) {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), files.lockfile, 'utf8');
  }
  return dir;
}

function gitLockfile(spec: string, commit: string, repo: string): string {
  return [
    "lockfileVersion: '9.0'",
    '',
    'importers:',
    '',
    '  .:',
    '    dependencies:',
    `      '${PACKAGE}':`,
    `        specifier: ${spec}`,
    `        version: git+${repo}#${commit}`,
    '',
    'packages:',
    '',
    `  '${PACKAGE}@git+${repo}#${commit}':`,
    `    resolution: {commit: ${commit}, repo: ${repo}, type: git}`,
    '    version: 0.11.0',
    '',
  ].join('\n');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('classifySpec', () => {
  it('识别 git 地址与简写', () => {
    expect(classifySpec('https://gitee.com/x/qq-bot.git')).toBe('git');
    expect(classifySpec('git+https://gitee.com/x/qq-bot.git')).toBe('git');
    expect(classifySpec('git+ssh://git@github.com/x/qq-bot.git')).toBe('git');
    expect(classifySpec('git@github.com:x/qq-bot.git')).toBe('git');
    expect(classifySpec('github:x/qq-bot')).toBe('git');
    expect(classifySpec('x/qq-bot#main')).toBe('git');
    // README 的 fork 安装写法：仓库网页地址不带 .git
    expect(classifySpec('https://github.com/xiong-universe/qqbot')).toBe('git');
    expect(classifySpec('https://gitee.com/x17598923823/qq-bot#main')).toBe('git');
  });

  it('识别 npm 与本地安装', () => {
    expect(classifySpec('^1.2.3')).toBe('npm');
    expect(classifySpec('1.0.0')).toBe('npm');
    expect(classifySpec('latest')).toBe('npm');
    expect(classifySpec('*')).toBe('npm');
    expect(classifySpec('file:../qq-bot')).toBe('local');
    expect(classifySpec('link:/path/to/repo')).toBe('local');
    expect(classifySpec('workspace:*')).toBe('local');
  });

  it('tarball 地址不误判成 git 仓库', () => {
    expect(classifySpec('https://github.com/x/qq-bot/archive/refs/tags/v1.0.0.tar.gz')).toBe('unknown');
    expect(classifySpec('https://registry.npmjs.org/x/-/x-1.0.0.tgz')).toBe('unknown');
  });

  it('无法识别时返回 unknown', () => {
    expect(classifySpec(undefined)).toBe('unknown');
    expect(classifySpec('')).toBe('unknown');
    expect(classifySpec('not a spec')).toBe('unknown');
  });
});

describe('parseGitSpec', () => {
  it('拆分远端与 ref', () => {
    expect(parseGitSpec('https://gitee.com/x/qq-bot.git#main'))
      .toEqual({ url: 'https://gitee.com/x/qq-bot.git', ref: 'main' });
    expect(parseGitSpec('git+https://gitee.com/x/qq-bot.git'))
      .toEqual({ url: 'https://gitee.com/x/qq-bot.git' });
    expect(parseGitSpec('git@github.com:x/qq-bot.git'))
      .toEqual({ url: 'git@github.com:x/qq-bot.git' });
    expect(parseGitSpec('github:x/qq-bot'))
      .toEqual({ url: 'https://github.com/x/qq-bot.git' });
    expect(parseGitSpec('x/qq-bot#v1.0.0'))
      .toEqual({ url: 'https://github.com/x/qq-bot.git', ref: 'v1.0.0' });
    // 网页地址不带 .git：原样交给 git ls-remote 解析
    expect(parseGitSpec('https://github.com/xiong-universe/qqbot#main'))
      .toEqual({ url: 'https://github.com/xiong-universe/qqbot', ref: 'main' });
  });

  it('非 git 写法返回 null', () => {
    expect(parseGitSpec('^1.2.3')).toBeNull();
    expect(parseGitSpec('file:../qq-bot')).toBeNull();
  });
});

describe('compareVersions / 引用工具', () => {
  it('按数字段比较版本', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0', '1.2.0-beta.1')).toBe(1);
    expect(compareVersions('v2.0.0', '2.0.0')).toBe(0);
  });

  it('短引用与 commit 前缀比较', () => {
    expect(shortRef(OLD_COMMIT)).toBe('889ef52');
    expect(shortRef('main')).toBe('main');
    expect(sameCommit(NEW_COMMIT, NEW_COMMIT.slice(0, 7))).toBe(true);
    expect(sameCommit(OLD_COMMIT, NEW_COMMIT)).toBe(false);
    expect(sameCommit('', OLD_COMMIT)).toBe(false);
  });

  it('生成手动更新命令', () => {
    expect(buildUpdateCommand(PACKAGE, 'desktop'))
      .toBe(`dsh plugin --profile desktop update ${PACKAGE}`);
  });
});

describe('inspectInstallation', () => {
  it('git 安装：读依赖写法与 lockfile commit', () => {
    const dir = makeProfile({
      manifest: { dependencies: { [PACKAGE]: 'https://gitee.com/x/qq-bot.git' } },
      lockfile: gitLockfile('https://gitee.com/x/qq-bot.git', OLD_COMMIT, 'https://gitee.com/x/qq-bot.git'),
    });
    const info = inspectInstallation({
      packageName: PACKAGE,
      version: '0.11.0',
      profileDir: dir,
      canUpdate: true,
    });
    expect(info.kind).toBe('git');
    expect(info.installed).toBe(OLD_COMMIT);
    expect(info.remote).toBe('https://gitee.com/x/qq-bot.git');
    expect(info.spec).toBe('https://gitee.com/x/qq-bot.git');
    expect(info.canUpdate).toBe(true);
    expect(info.command).toBe(`dsh plugin --profile ${basename(dir)} update ${PACKAGE}`);
  });

  it('npm 安装：读 lockfile 版本', () => {
    const dir = makeProfile({
      manifest: { dependencies: { [PACKAGE]: '^1.2.0' } },
      lockfile: [
        "lockfileVersion: '9.0'",
        '',
        'importers:',
        '  .:',
        '    dependencies:',
        `      '${PACKAGE}':`,
        '        specifier: ^1.2.0',
        '        version: 1.2.3',
        '',
        'packages:',
        `  '${PACKAGE}@1.2.3': {}`,
        '',
      ].join('\n'),
    });
    const info = inspectInstallation({
      packageName: PACKAGE,
      version: '1.2.3',
      profileDir: dir,
      canUpdate: true,
    });
    expect(info.kind).toBe('npm');
    expect(info.installed).toBe('1.2.3');
    expect(info.canUpdate).toBe(true);
    expect(info.remote).toBeUndefined();
  });

  it('本地路径安装不支持自更新', () => {
    const dir = makeProfile({ manifest: { dependencies: { [PACKAGE]: 'file:../qq-bot' } } });
    const info = inspectInstallation({
      packageName: PACKAGE,
      version: '0.11.0',
      profileDir: dir,
      canUpdate: true,
    });
    expect(info.kind).toBe('local');
    expect(info.canUpdate).toBe(false);
    expect(info.message).toContain('不支持自更新');
  });

  it('未定位到 profile 时返回 unknown 与说明', () => {
    const info = inspectInstallation({
      packageName: PACKAGE,
      version: '0.11.0',
      profileDir: null,
      canUpdate: true,
    });
    expect(info.kind).toBe('unknown');
    expect(info.canUpdate).toBe(false);
    expect(info.message).toContain('未定位到 profile');
  });
});

describe('checkForUpdate', () => {
  const gitInfo = () => inspectInstallation({
    packageName: PACKAGE,
    version: '0.11.0',
    profileDir: makeProfile({
      manifest: { dependencies: { [PACKAGE]: 'https://gitee.com/x/qq-bot.git' } },
      lockfile: gitLockfile('https://gitee.com/x/qq-bot.git', OLD_COMMIT, 'https://gitee.com/x/qq-bot.git'),
    }),
    canUpdate: true,
  });

  it('git 远端 commit 变化 = 有更新', async () => {
    const lsRemote = vi.fn(async () => NEW_COMMIT);
    const result = await checkForUpdate(gitInfo(), { lsRemote });
    expect(lsRemote).toHaveBeenCalledWith('https://gitee.com/x/qq-bot.git', undefined);
    expect(result.updateAvailable).toBe(true);
    expect(result.latest).toBe(NEW_COMMIT);
    expect(result.message).toContain('发现新版本');
  });

  it('git 远端 commit 相同 = 已是最新', async () => {
    const result = await checkForUpdate(gitInfo(), { lsRemote: async () => OLD_COMMIT });
    expect(result.updateAvailable).toBe(false);
    expect(result.message).toContain('已是最新');
  });

  it('锁定到具体 commit 时不再检查远端', async () => {
    const dir = makeProfile({
      manifest: { dependencies: { [PACKAGE]: `https://gitee.com/x/qq-bot.git#${OLD_COMMIT}` } },
      lockfile: gitLockfile(`https://gitee.com/x/qq-bot.git#${OLD_COMMIT}`, OLD_COMMIT, 'https://gitee.com/x/qq-bot.git'),
    });
    const info = inspectInstallation({ packageName: PACKAGE, version: '0.11.0', profileDir: dir });
    const lsRemote = vi.fn(async () => NEW_COMMIT);
    const result = await checkForUpdate(info, { lsRemote });
    expect(lsRemote).not.toHaveBeenCalled();
    expect(result.updateAvailable).toBe(false);
  });

  it('npm registry 版本更高 = 有更新', async () => {
    const dir = makeProfile({
      manifest: { dependencies: { [PACKAGE]: '^1.2.0' } },
      lockfile: "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n"
        + `      '${PACKAGE}':\n        specifier: ^1.2.0\n        version: 1.2.3\n`,
    });
    const info = inspectInstallation({ packageName: PACKAGE, version: '1.2.3', profileDir: dir });
    const result = await checkForUpdate(info, { fetchLatestVersion: async () => '1.3.0' });
    expect(result.updateAvailable).toBe(true);
    expect(result.latest).toBe('1.3.0');
  });

  it('npm registry 版本相同 = 已是最新', async () => {
    const dir = makeProfile({ manifest: { dependencies: { [PACKAGE]: '1.2.3' } } });
    const info = inspectInstallation({ packageName: PACKAGE, version: '1.2.3', profileDir: dir });
    const result = await checkForUpdate(info, { fetchLatestVersion: async () => '1.2.3' });
    expect(result.updateAvailable).toBe(false);
  });

  it('npm 以 lockfile 已装版本为准（当前加载版本更旧时不误报）', async () => {
    const dir = makeProfile({
      manifest: { dependencies: { [PACKAGE]: '^1.2.0' } },
      lockfile: "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n"
        + `      '${PACKAGE}':\n        specifier: ^1.2.0\n        version: 1.2.3\n`,
    });
    const info = inspectInstallation({ packageName: PACKAGE, version: '1.1.9', profileDir: dir });
    const result = await checkForUpdate(info, { fetchLatestVersion: async () => '1.2.3' });
    expect(result.updateAvailable).toBe(false);
    expect(result.message).toContain('已是最新');
  });

  it('本地安装检查抛出可展示的错误', async () => {
    const dir = makeProfile({ manifest: { dependencies: { [PACKAGE]: 'link:../qq-bot' } } });
    const info = inspectInstallation({ packageName: PACKAGE, version: '0.11.0', profileDir: dir });
    await expect(checkForUpdate(info)).rejects.toThrow('不支持自更新');
  });
});

describe('runUpdate', () => {
  it('git 安装：把 update 与包名交给注入的 runner', async () => {
    const dir = makeProfile({
      manifest: { dependencies: { [PACKAGE]: 'https://gitee.com/x/qq-bot.git' } },
      lockfile: gitLockfile('https://gitee.com/x/qq-bot.git', OLD_COMMIT, 'https://gitee.com/x/qq-bot.git'),
    });
    const info = inspectInstallation({ packageName: PACKAGE, version: '0.11.0', profileDir: dir });
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const result = await runUpdate(info, runner);
    expect(runner).toHaveBeenCalledWith(['update', PACKAGE], dir);
    expect(result.ok).toBe(true);
  });

  it('命令失败时带回退出码与输出尾部', async () => {
    const dir = makeProfile({ manifest: { dependencies: { [PACKAGE]: 'https://gitee.com/x/qq-bot.git' } } });
    const info = inspectInstallation({ packageName: PACKAGE, version: '0.11.0', profileDir: dir });
    const result = await runUpdate(info, async () => ({ exitCode: 1, output: 'fatal: unable to access' }));
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('unable to access');
  });

  it('没有宿主 runner 时返回手动命令', async () => {
    const dir = makeProfile({ manifest: { dependencies: { [PACKAGE]: 'https://gitee.com/x/qq-bot.git' } } });
    const info = inspectInstallation({ packageName: PACKAGE, version: '0.11.0', profileDir: dir });
    const result = await runUpdate(info);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('dsh plugin --profile');
    expect(result.message).toContain(PACKAGE);
  });

  it('本地安装拒绝执行更新', async () => {
    const dir = makeProfile({ manifest: { dependencies: { [PACKAGE]: 'link:../qq-bot' } } });
    const info = inspectInstallation({ packageName: PACKAGE, version: '0.11.0', profileDir: dir });
    const runner = vi.fn(async () => ({ exitCode: 0 }));
    const result = await runUpdate(info, runner);
    expect(runner).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
