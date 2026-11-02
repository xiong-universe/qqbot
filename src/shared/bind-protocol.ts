/**
 * 端内绑定协议 —— 宿主路由与客户端面板的共享契约
 *
 * 类型与路径常量的唯一事实源：宿主（setup/bind-routes.ts）与浏览器
 * （client/bind-page.ts）各自 import，杜绝两端协议漂移。
 * 本模块必须保持纯类型 + 纯常量（零 node 依赖、零副作用）：
 * 客户端 tsdown 构建会将其内联进 bundle。
 */

/** 状态查询（绑定页轮询） */
export const BIND_STATE_PATH = '/qqbot/im-qqbot/bind';

/** 刷新二维码（绑定页按钮） */
export const BIND_REFRESH_PATH = '/qqbot/im-qqbot/bind/refresh';

/** 手动填写/编辑凭据（绑定页表单） */
export const BIND_MANUAL_PATH = '/qqbot/im-qqbot/bind/manual';

/** 解绑：移除已保存凭据，回到绑定流程 */
export const BIND_UNBIND_PATH = '/qqbot/im-qqbot/bind/unbind';

/** 配置读写（设置面板表单） */
export const BIND_CONFIG_PATH = '/qqbot/im-qqbot/config';

/** 插件更新检查与执行（设置面板「插件更新」页签） */
export const BIND_UPDATE_PATH = '/qqbot/im-qqbot/update';

/** 线上协议（HTTP 路由序列化形态） */
export type BindStateWire =
  | { phase: 'starting' }
  | { phase: 'waiting'; url: string; qrSvg?: string; issuedAt: number }
  | { phase: 'saving' }
  | { phase: 'failed'; reason: string }
  | { phase: 'bound'; appId: string };

/** manual / unbind 操作的统一响应 */
export interface BindActionResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

/** 安装方式（决定更新检查走 git 远端还是 npm registry） */
export type UpdateInstallKind = 'git' | 'npm' | 'local' | 'unknown';

/** 当前安装信息（GET /update 回显，也是检查/更新的输入） */
export interface UpdateInstallWire {
  packageName: string;
  kind: UpdateInstallKind;
  /** 当前加载的插件版本（package.json 的 version） */
  version: string;
  /** 已安装引用：git = commit，npm = 版本号，local = 依赖写法 */
  installed: string;
  /** profile package.json 里的依赖写法 */
  spec?: string;
  /** git 远端地址 */
  remote?: string;
  /** git 分支/标签（依赖写法 # 之后的内容） */
  ref?: string;
  /** 当前宿主是否支持一键更新（桌面版提供 pnpm 服务） */
  canUpdate: boolean;
  /** 无法一键更新时展示的手动命令 */
  command: string;
  /** 附加说明（不支持自更新的原因等） */
  message?: string;
}

/** 远端检查结果 */
export interface UpdateCheckWire {
  updateAvailable: boolean;
  /** 远端最新引用：git = commit，npm = 版本号 */
  latest: string;
  /** 检查时间（epoch ms） */
  checkedAt: number;
  message: string;
}

/** GET / POST(update) 的响应 */
export interface UpdateStateWire {
  ok?: boolean;
  install?: UpdateInstallWire;
  check?: UpdateCheckWire;
  message?: string;
  error?: string;
}
