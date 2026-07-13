/** 快捷键配置数据结构 */
export interface HotkeyConfig {
  key: string        // 物理按键标识（如 's', '1', 'F1'）
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  enabled: boolean
}

export const DEFAULT_HOTKEY: HotkeyConfig = {
  key: 's',
  altKey: true,
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  enabled: true,
}

/** 特殊按键的显示名称映射 */
const KEY_DISPLAY_MAP: Record<string, string> = {
  ' ': 'Space',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  escape: 'Esc',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  tab: 'Tab',
}

/** 将快捷键配置转为可读字符串 */
export function hotkeyToDisplay(config: HotkeyConfig): string {
  const parts: string[] = []
  if (config.ctrlKey) parts.push('Ctrl')
  if (config.altKey) parts.push('Alt')
  if (config.shiftKey) parts.push('Shift')
  if (config.metaKey) parts.push('Meta')
  const display = KEY_DISPLAY_MAP[config.key.toLowerCase()] ?? config.key.toUpperCase()
  parts.push(display)
  return parts.join(' + ')
}

/** Mac 平台符号显示 */
export function hotkeyToSymbols(config: HotkeyConfig): string {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  if (isMac) {
    const parts: string[] = []
    if (config.ctrlKey) parts.push('⌃')
    if (config.altKey) parts.push('⌥')
    if (config.shiftKey) parts.push('⇧')
    if (config.metaKey) parts.push('⌘')
    const display = KEY_DISPLAY_MAP[config.key.toLowerCase()] ?? config.key.toUpperCase()
    parts.push(display)
    return parts.join('')
  }
  return hotkeyToDisplay(config)
}

/** 浏览器保留快捷键集合 */
const RESERVED_KEYS = new Set([
  'ctrl+w', 'ctrl+t', 'ctrl+n', 'ctrl+shift+n', 'ctrl+shift+t',
  'ctrl+q', 'ctrl+h', 'ctrl+j', 'ctrl+d', 'ctrl+l',
  'ctrl+s', 'meta+s', 'meta+w', 'meta+t', 'meta+n',
  'f5', 'f11', 'f12', 'ctrl+r', 'ctrl+shift+r',
])

/** 检查是否与浏览器保留快捷键冲突 */
export function isReservedHotkey(config: HotkeyConfig): boolean {
  const parts: string[] = []
  if (config.ctrlKey) parts.push('ctrl')
  if (config.altKey) parts.push('alt')
  if (config.shiftKey) parts.push('shift')
  if (config.metaKey) parts.push('meta')
  parts.push(config.key.toLowerCase())
  return RESERVED_KEYS.has(parts.join('+'))
}

/** 从 KeyboardEvent 提取按键信息（使用物理按键避免 Alt 修饰符干扰） */
export function extractKeyFromEvent(e: KeyboardEvent): string | null {
  if (e.code.startsWith('Key')) return e.code.slice(3).toLowerCase()
  if (e.code.startsWith('Digit')) return e.code.slice(5)
  // 特殊按键用 e.key
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
       'Enter', 'Backspace', 'Delete', 'Tab'].includes(e.code)) {
    return e.code.toLowerCase()
  }
  if (e.code.startsWith('F') && /^F\d+$/.test(e.code)) return e.code.toLowerCase()
  return null
}

/** 检查事件是否匹配快捷键配置 */
export function matchesHotkey(e: KeyboardEvent, config: HotkeyConfig): boolean {
  const pressedKey = extractKeyFromEvent(e)
  if (!pressedKey) return false
  return (
    pressedKey === config.key.toLowerCase() &&
    e.ctrlKey === config.ctrlKey &&
    e.altKey === config.altKey &&
    e.shiftKey === config.shiftKey &&
    e.metaKey === config.metaKey
  )
}

/** 检查当前焦点是否在输入框内 */
export function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.getAttribute('contenteditable')) return true
  // Shadow DOM 内部
  const shadowActive = (el as HTMLElement).shadowRoot?.activeElement
  if (shadowActive) {
    const shadowTag = shadowActive.tagName
    if (shadowTag === 'INPUT' || shadowTag === 'TEXTAREA') return true
    if (shadowActive.getAttribute('contenteditable')) return true
  }
  return false
}
