import React from 'react'
import ReactDOM from 'react-dom/client'
import CollectDialog from './CollectDialog'
import { DIALOG_CSS } from './dialogStyles'
import { getHotkeyConfig, getConfig } from '../shared/storage'
import { friendlyError } from '../shared/errors'
import type { HotkeyConfig } from '../shared/hotkey'
import { matchesHotkey, isInputFocused } from '../shared/hotkey'

// Shadow DOM 容器
let shadowRoot: ShadowRoot | null = null
let dialogContainer: HTMLElement | null = null
let reactRoot: ReactDOM.Root | null = null
let toastStack: HTMLElement | null = null

// 快捷键配置缓存
let hotkeyConfig: HotkeyConfig | null = null

async function loadHotkey() {
  hotkeyConfig = await getHotkeyConfig()
}
loadHotkey()

// 监听配置变更实时更新
chrome.storage.onChanged.addListener((changes) => {
  if (changes.hotkey_config?.newValue) {
    hotkeyConfig = changes.hotkey_config.newValue as HotkeyConfig
  }
})

// 快捷键监听
document.addEventListener('keydown', (e) => {
  const config = hotkeyConfig
  if (!config || !config.enabled) return
  // 弹窗已打开时不再响应，否则会重渲染并清掉用户填了一半的内容
  if (reactRoot) return
  if (isInputFocused()) return
  if (matchesHotkey(e, config)) {
    e.preventDefault()
    e.stopPropagation()
    showCollectDialog(window.location.href, document.title)
  }
}, true)

function ensureShadowRoot(): ShadowRoot {
  if (shadowRoot) return shadowRoot

  const host = document.createElement('div')
  host.id = 'collect-to-lark-host'
  host.style.position = 'fixed'
  host.style.top = '0'
  host.style.left = '0'
  host.style.width = '0'
  host.style.height = '0'
  host.style.zIndex = '2147483647'
  host.style.pointerEvents = 'none'
  document.body.appendChild(host)

  // 隔断按键继续冒泡到宿主页面（Vimium、GitHub 等站点会在 document 上监听快捷键）。
  //
  // 必须用冒泡阶段：捕获阶段在 host 上调 stopPropagation 会直接终止派发，
  // 弹窗内部的 onKeyDown（Esc 收起下拉、Enter 创建选项、Backspace 删标签）全都收不到事件。
  // 页面注册在 document 捕获阶段的监听器本来就比 host 更早触发，改成冒泡不会削弱隔断效果。
  const stopKeyboard = (e: Event) => { e.stopPropagation() }
  host.addEventListener('keydown', stopKeyboard)
  host.addEventListener('keyup', stopKeyboard)
  host.addEventListener('keypress', stopKeyboard)

  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = DIALOG_CSS
  shadow.appendChild(style)

  const container = document.createElement('div')
  container.id = 'root'
  container.style.pointerEvents = 'auto'
  shadow.appendChild(container)

  shadowRoot = shadow
  dialogContainer = container
  return shadow
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'OPEN_COLLECT_DIALOG') {
    showCollectDialog(message.url, message.title)
  }
  // 后台保存完成的结果回报（弹窗此时已关闭）
  if (message.type === 'COLLECT_RESULT') {
    showResultToast(message.ok, message.error)
  }
})

// 提供给 popup 调用的接口
window.addEventListener('message', (event) => {
  if (event.data?.type === 'OPEN_COLLECT_DIALOG_FROM_POPUP') {
    showCollectDialog(window.location.href, document.title)
  }
})

function closeDialog() {
  const root = reactRoot
  reactRoot = null
  // 卸载动作从当前事件里挪出去，避免在 React 渲染过程中同步 unmount
  if (root) queueMicrotask(() => root.unmount())
}

async function showCollectDialog(url: string, title: string) {
  ensureShadowRoot()
  if (!dialogContainer) return

  // 预加载创建人名称，确保弹窗打开时立即填充；读配置失败就留空
  const config = await getConfig().catch(() => null)

  if (!reactRoot) reactRoot = ReactDOM.createRoot(dialogContainer)
  reactRoot.render(
    <React.StrictMode>
      <CollectDialog
        url={url}
        initialTitle={title}
        initialCreator={config?.creatorName || ''}
        onClose={closeDialog}
      />
    </React.StrictMode>
  )
}

/* ============ 结果轻提示 ============ */

const TOAST_HOLD_MS = { ok: 2500, error: 8000 }
const TOAST_EXIT_MS = 180
const TOAST_MAX = 3

function ensureToastStack(): HTMLElement {
  if (toastStack?.isConnected) return toastStack
  const shadow = ensureShadowRoot()
  const stack = document.createElement('div')
  stack.className = 'ctl-toast-stack'
  shadow.appendChild(stack)
  toastStack = stack
  return stack
}

/** 右上角轻提示，用于回报后台保存结果；多条纵向堆叠，不再互相压住 */
function showResultToast(ok: boolean, error?: string) {
  const stack = ensureToastStack()

  const toast = document.createElement('div')
  toast.className = `ctl-toast ${ok ? 'ctl-toast--ok' : 'ctl-toast--error'}`
  toast.setAttribute('role', ok ? 'status' : 'alert')

  const title = document.createElement('div')
  title.className = 'ctl-toast-title'
  title.textContent = ok ? '已保存到飞书' : '保存失败'
  toast.appendChild(title)

  if (!ok) {
    const detail = document.createElement('div')
    detail.className = 'ctl-toast-detail'
    detail.textContent = friendlyError(error)
    toast.appendChild(detail)
  }

  let timer = 0
  const dismiss = () => {
    window.clearTimeout(timer)
    toast.dataset.leaving = 'true'
    window.setTimeout(() => toast.remove(), TOAST_EXIT_MS)
  }
  toast.addEventListener('click', dismiss)
  timer = window.setTimeout(dismiss, ok ? TOAST_HOLD_MS.ok : TOAST_HOLD_MS.error)

  stack.appendChild(toast)

  // 堆太多就把最早的挤掉
  while (stack.childElementCount > TOAST_MAX) {
    stack.firstElementChild?.remove()
  }
}
