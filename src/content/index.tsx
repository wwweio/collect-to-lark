import React from 'react'
import ReactDOM from 'react-dom/client'
import CollectDialog from './CollectDialog'
import { getHotkeyConfig, getConfig } from '../shared/storage'
import type { HotkeyConfig } from '../shared/hotkey'
import { matchesHotkey, isInputFocused } from '../shared/hotkey'

// Shadow DOM 容器
let shadowRoot: ShadowRoot | null = null
let dialogContainer: HTMLElement | null = null
let reactRoot: ReactDOM.Root | null = null

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
  if (isInputFocused()) return
  if (matchesHotkey(e, config)) {
    e.preventDefault()
    e.stopPropagation()
    if (!shadowRoot) createDialogContainer()
    showCollectDialog(window.location.href, document.title)
  }
}, true)

function createDialogContainer(): ShadowRoot {
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

  // 在 shadow host 上拦截键盘事件，防止冒泡到宿主页面的 capture 监听器
  const stopKeyboard = (e: Event) => { e.stopPropagation() }
  host.addEventListener('keydown', stopKeyboard, true)
  host.addEventListener('keyup', stopKeyboard, true)
  host.addEventListener('keypress', stopKeyboard, true)

  const shadow = host.attachShadow({ mode: 'open' })

  // 注入样式到 Shadow DOM
  const style = document.createElement('style')
  style.textContent = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    input[type="text"], input[type="url"], textarea, select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #E8E6E3;
      border-radius: 8px;
      background: #FFFFFF;
      color: #1A1A1A;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s ease;
      font-family: inherit;
    }
    input:focus, textarea:focus, select:focus {
      border-color: #0D7377;
      box-shadow: 0 0 0 3px rgba(13, 115, 119, 0.1);
    }
    textarea { resize: vertical; min-height: 60px; }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    [data-dropdown-item]:hover {
      background: #F5F3F0 !important;
    }
    button:hover, [role="button"]:hover {
      opacity: 0.85;
    }
    .submit-btn:hover:not(:disabled) {
      background: #0A6265 !important;
    }
    .cancel-btn:hover {
      background: #EDEAE6 !important;
    }
  `
  shadow.appendChild(style)

  const container = document.createElement('div')
  container.id = 'root'
  container.style.pointerEvents = 'auto'

  // 阻止键盘事件冒泡到宿主页面（防止触发 Vimium、GitHub 等网站快捷键）
  const blockKeys = (e: Event) => { e.stopPropagation() }
  container.addEventListener('keydown', blockKeys, true)
  container.addEventListener('keyup', blockKeys, true)
  container.addEventListener('keypress', blockKeys, true)

  shadow.appendChild(container)

  shadowRoot = shadow
  dialogContainer = container
  return shadow
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'OPEN_COLLECT_DIALOG') {
    if (!shadowRoot) {
      createDialogContainer()
    }
    showCollectDialog(message.url, message.title)
  }
  // 后台保存完成的结果回报（弹窗此时已关闭）
  if (message.type === 'COLLECT_RESULT') {
    showResultToast(message.ok, message.error)
  }
})

/** 右上角轻提示，用于回报后台保存结果 */
function showResultToast(ok: boolean, error?: string) {
  const shadow = shadowRoot || createDialogContainer()

  const toast = document.createElement('div')
  toast.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 2147483647;
    max-width: 320px; padding: 12px 16px; border-radius: 10px;
    background: #FFFFFF; border-left: 4px solid ${ok ? '#16A34A' : '#DC2626'};
    box-shadow: 0 8px 30px rgba(0,0,0,0.15); pointer-events: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px; color: #1A1A1A; line-height: 1.5;
    animation: slideUp 0.2s ease;
  `

  const title = document.createElement('div')
  title.style.cssText = 'font-weight: 600; margin-bottom: 2px;'
  title.textContent = ok ? '已保存到飞书' : '保存失败'
  toast.appendChild(title)

  if (!ok) {
    const detail = document.createElement('div')
    detail.style.cssText = 'font-size: 12px; color: #78716C;'
    const msg = error || '未知错误'
    detail.textContent = /Forbidden|permission/i.test(msg)
      ? '权限不足：打开飞书多维表格 → 右上角「分享」→ 添加应用为协作者 → 「可编辑」'
      : msg
    toast.appendChild(detail)
  }

  shadow.appendChild(toast)
  setTimeout(() => toast.remove(), ok ? 2500 : 8000)
}

// 提供给 popup 调用的接口
window.addEventListener('message', (event) => {
  if (event.data?.type === 'OPEN_COLLECT_DIALOG_FROM_POPUP') {
    if (!shadowRoot) {
      createDialogContainer()
    }
    showCollectDialog(window.location.href, document.title)
  }
})

function showCollectDialog(url: string, title: string) {
  if (!dialogContainer) return

  // 预加载创建人名称，确保弹窗打开时立即填充
  getConfig().then(config => {
    const creatorName = config?.creatorName || ''

    if (!reactRoot) {
      reactRoot = ReactDOM.createRoot(dialogContainer!)
    }

    reactRoot.render(
      <React.StrictMode>
        <CollectDialog
          url={url}
          initialTitle={title}
          initialCreator={creatorName}
          onClose={() => {
            reactRoot?.unmount()
            reactRoot = null
          }}
        />
      </React.StrictMode>
    )
  }).catch(() => {
    // 即使获取配置失败也打开弹窗，创建人为空
    if (!reactRoot) {
      reactRoot = ReactDOM.createRoot(dialogContainer!)
    }

    reactRoot.render(
      <React.StrictMode>
        <CollectDialog
          url={url}
          initialTitle={title}
          onClose={() => {
            reactRoot?.unmount()
            reactRoot = null
          }}
        />
      </React.StrictMode>
    )
  })
}
