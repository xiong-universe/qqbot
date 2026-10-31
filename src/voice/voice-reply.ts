/**
 * 语音回复发送器 — 合成 → 临时文件 → QQ 语音消息
 *
 * 只在 `voice.apiKey` 非空时创建（见 createVoiceSpeaker）。是否发语音由上层模型
 * 决定（调用 qqbot_voice），本模块只在轮末把已扣下的正文合成成语音；任何失败都
 * 返回 false，由出站路由退回文字，避免用户什么都收不到。
 */
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionManager, SessionRecord } from '../session/index.ts';
import type { VoiceConfig } from '../config.ts';
import type { Logger } from '../types.ts';
import { MEDIA_ROOT } from '../media/media-cleaner.ts';
import { isSpeechWebSocketAvailable, synthesizeSpeech } from './tts.ts';
import {
  cleanTextForSpeech,
  normalizeVoiceInstruction,
  resolveVoiceSettings,
  resolveVoiceTuning,
  type ResolvedVoiceSettings,
} from './voice-config.ts';

/** 语音发送器最小接口（bootstrap 的 mediaSender 满足） */
export interface VoiceSenderLike {
  sendVoice(
    target: SessionRecord['replyTarget'],
    source: { localPath?: string },
  ): Promise<unknown>;
}

export interface VoiceSpeakerOptions {
  manager: SessionManager;
  /** 全局语音配置（apiKey 为空时不创建 speaker） */
  voice: VoiceConfig;
  sender: VoiceSenderLike;
  logger: Logger;
}

/** 合成的临时音频名（放在 MEDIA_ROOT，发送后立即删除） */
function temporaryAudioPath(): string {
  return join(MEDIA_ROOT, `voice-${Date.now()}-${randomUUID().slice(0, 8)}.mp3`);
}

/**
 * 创建语音发送器；未配置 API Key 或运行时缺少内置 WebSocket 时返回 undefined。
 *
 * Node 20 没有全局 WebSocket：此时即使填了 Key 也无法合成，启动时告警并关闭，
 * 而不是每轮对话都抛错。
 */
export function createVoiceSpeaker(options: VoiceSpeakerOptions): VoiceSpeaker | undefined {
  const settings = resolveVoiceSettings(options.voice);
  if (settings === undefined) return undefined;
  if (!isSpeechWebSocketAvailable()) {
    options.logger.warn(
      'im-qqbot: 已配置语音 Key，但当前 Node 运行时没有内置 WebSocket（需要 Node 22+），语音回复已关闭',
    );
    return undefined;
  }
  return new VoiceSpeaker(options.manager, settings, options.sender, options.logger);
}

/** 语音回复发送器（每个网关一个实例，无状态） */
export class VoiceSpeaker {
  private readonly manager: SessionManager;
  private readonly settings: ResolvedVoiceSettings;
  private readonly sender: VoiceSenderLike;
  private readonly logger: Logger;

  public constructor(
    manager: SessionManager,
    settings: ResolvedVoiceSettings,
    sender: VoiceSenderLike,
    logger: Logger,
  ) {
    this.manager = manager;
    this.settings = settings;
    this.sender = sender;
    this.logger = logger;
  }

  /**
   * 用语音朗读一段回复文本。
   *
   * 情感指令优先级：本轮 `qqbot_voice({ instruction })` > 人格配置 > 全局配置。
   *
   * @returns true = 已发送语音；false = 文本不可朗读或合成/发送失败（已记日志）
   */
  public async speak(record: SessionRecord, text: string): Promise<boolean> {
    const speech = cleanTextForSpeech(text, this.settings.maxChars);
    if (speech === '') return false;

    const persona = this.manager.getEffectivePersona(record.scope, record.peerId);
    const tuning = resolveVoiceTuning(this.settings, persona?.expressions?.voice);
    const instruction = normalizeVoiceInstruction(record.voiceInstruction) ?? tuning.instruction;

    let audio: Buffer;
    try {
      audio = await synthesizeSpeech(speech, {
        apiKey: this.settings.apiKey,
        model: this.settings.model,
        voice: tuning.voice,
        ...(this.settings.baseUrl !== undefined ? { baseUrl: this.settings.baseUrl } : {}),
        ...(this.settings.workspace !== undefined ? { workspace: this.settings.workspace } : {}),
        ...(tuning.rate !== undefined ? { rate: tuning.rate } : {}),
        ...(tuning.volume !== undefined ? { volume: tuning.volume } : {}),
        ...(instruction !== undefined ? { instruction } : {}),
        timeoutMs: this.settings.timeoutMs,
      });
    } catch (err) {
      this.logger.warn(`im-qqbot: 语音合成失败，本轮改为发送文字: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }

    const filePath = temporaryAudioPath();
    try {
      await mkdir(MEDIA_ROOT, { recursive: true });
      await writeFile(filePath, audio);
      await this.sender.sendVoice(record.replyTarget, { localPath: filePath });
      this.logger.info(
        `im-qqbot: 已发送语音 voice=${tuning.voice} bytes=${audio.length} chars=${speech.length}`
        + ` instruction=${instruction === undefined ? '无' : '有'}`,
      );
      return true;
    } catch (err) {
      this.logger.warn(`im-qqbot: 语音发送失败，本轮改为发送文字: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    } finally {
      await rm(filePath, { force: true }).catch(() => {});
    }
  }
}
