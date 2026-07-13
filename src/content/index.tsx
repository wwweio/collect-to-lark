import React from 'react'
import ReactDOM from 'react-dom/client'
import CollectDialog from './CollectDialog'
import { getHotkeyConfig } from '../shared/storage'
import type { HotkeyConfig } from '../shared/hotkey'
import { matchesHotkey, isInputFocused } from '../shared/hotkey'

// Shadow DOM 容器
let shadowRoot: ShadowRoot | null = null
let dialogContainer: HTMLElement | null = null

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
})

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

  const root = ReactDOM.createRoot(dialogContainer)
  root.render(
    <React.StrictMode>
      <CollectDialog
        url={url}
        initialTitle={title}
        onClose={() => {
          root.unmount()
        }}
      />
    </React.StrictMode>
  )
}
