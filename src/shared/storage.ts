import { FeishuConfig, FieldOption, FieldMeta } from './types'
import { HotkeyConfig, DEFAULT_HOTKEY } from './hotkey'

export type { HotkeyConfig } from './hotkey'

const STORAGE_KEYS = {
  CONFIG: 'feishu_config',
  HOTKEY: 'hotkey_config',
  CATEGORY_CACHE: 'category_cache',
  TAG_CACHE: 'tag_cache',
  TOKEN_CACHE: 'token_cache',
  FIELDS_CACHE: 'fields_cache',
} as const

export async function getConfig(): Promise<FeishuConfig | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONFIG)
  const cfg = result[STORAGE_KEYS.CONFIG] as Partial<FeishuConfig> | undefined
  if (!cfg || Object.keys(cfg).length === 0) return null
  return {
    appId: cfg.appId ?? '',
    appSecret: cfg.appSecret ?? '',
    feishuUrl: cfg.feishuUrl ?? '',
    appToken: cfg.appToken ?? '',
    tableId: cfg.tableId ?? '',
    tableName: cfg.tableName ?? '',
    creatorName: cfg.creatorName ?? '',
  }
}

/** 获取快捷键配置 */
export async function getHotkeyConfig(): Promise<HotkeyConfig> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.HOTKEY)
  const cfg = result[STORAGE_KEYS.HOTKEY] as Partial<HotkeyConfig> | undefined
  if (!cfg) return { ...DEFAULT_HOTKEY }
  return {
    key: cfg.key ?? DEFAULT_HOTKEY.key,
    ctrlKey: cfg.ctrlKey ?? DEFAULT_HOTKEY.ctrlKey,
    altKey: cfg.altKey ?? DEFAULT_HOTKEY.altKey,
    shiftKey: cfg.shiftKey ?? DEFAULT_HOTKEY.shiftKey,
    metaKey: cfg.metaKey ?? DEFAULT_HOTKEY.metaKey,
    enabled: cfg.enabled ?? DEFAULT_HOTKEY.enabled,
  }
}

/** 保存快捷键配置 */
export async function saveHotkeyConfig(config: HotkeyConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.HOTKEY]: config })
}

export async function saveConfig(config: Partial<FeishuConfig>): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIG]: config,
  })
}

export async function getCategoryCache(): Promise<FieldOption[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CATEGORY_CACHE)
  return result[STORAGE_KEYS.CATEGORY_CACHE] || []
}

export async function setCategoryCache(options: FieldOption[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CATEGORY_CACHE]: options })
}

export async function getTagCache(): Promise<FieldOption[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TAG_CACHE)
  return result[STORAGE_KEYS.TAG_CACHE] || []
}

export async function setTagCache(options: FieldOption[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.TAG_CACHE]: options })
}

interface FieldsCache {
  key: string
  data: FieldMeta[]
  fetchedAt: number
  expireAt: number
}

/** 字段缓存命中结果，fetchedAt 用于判断快照新鲜度 */
export interface FieldsCacheEntry {
  fields: FieldMeta[]
  fetchedAt: number
}

/** 缓存 key 绑定表格，切换表格后旧缓存自动失效 */
function fieldsCacheKey(appToken: string, tableId: string): string {
  return `${appToken}:${tableId}`
}

export async function getFieldsCache(appToken: string, tableId: string): Promise<FieldsCacheEntry | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.FIELDS_CACHE)
  const cache = result[STORAGE_KEYS.FIELDS_CACHE] as FieldsCache | undefined
  if (!cache || cache.key !== fieldsCacheKey(appToken, tableId)) return null
  if (cache.expireAt > Date.now()) return { fields: cache.data, fetchedAt: cache.fetchedAt ?? 0 }
  return null
}

export async function setFieldsCache(appToken: string, tableId: string, fields: FieldMeta[]): Promise<void> {
  const now = Date.now()
  await chrome.storage.local.set({
    [STORAGE_KEYS.FIELDS_CACHE]: {
      key: fieldsCacheKey(appToken, tableId),
      data: fields,
      fetchedAt: now,
      expireAt: now + 30 * 60 * 1000, // 缓存 30 分钟，新增选项后会回写，打开弹窗时会静默刷新
    },
  })
}

interface TokenCache {
  token: string
  expireAt: number
}

export async function getTokenCache(): Promise<TokenCache | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TOKEN_CACHE)
  const cache = result[STORAGE_KEYS.TOKEN_CACHE] as TokenCache | undefined
  if (cache && cache.expireAt > Date.now()) return cache
  return null
}

export async function setTokenCache(token: string, expireSeconds: number): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.TOKEN_CACHE]: {
      token,
      expireAt: Date.now() + (expireSeconds - 300) * 1000, // 提前5分钟刷新
    },
  })
}

/** 导出配置为 JSON */
export async function exportConfig(): Promise<string> {
  const config = await getConfig()
  return JSON.stringify(config, null, 2)
}

/** 从 JSON 导入配置 */
export async function importConfig(json: string): Promise<void> {
  const config = JSON.parse(json) as FeishuConfig
  await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: config })
}

/**
 * 从飞书 URL 解析 app_token
 * 支持格式:
 * - https://xxx.feishu.cn/wiki/TOKEN
 * - https://xxx.feishu.cn/base/TOKEN
 * - https://xxx.feishu.cn/base/TOKEN?table=tblXXX
 */
export function parseFeishuUrl(url: string): { appToken: string; tableId?: string } | null {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname

    // wiki 格式: /wiki/TOKEN
    const wikiMatch = path.match(/\/wiki\/([A-Za-z0-9]+)/)
    if (wikiMatch) {
      return { appToken: wikiMatch[1] }
    }

    // base 格式: /base/TOKEN
    const baseMatch = path.match(/\/base\/([A-Za-z0-9]+)/)
    if (baseMatch) {
      const tableId = parsed.searchParams.get('table') || undefined
      return { appToken: baseMatch[1], tableId }
    }

    return null
  } catch {
    return null
  }
}
