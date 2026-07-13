import { useState, useEffect } from 'react'
import { getConfig, getHotkeyConfig } from '../shared/storage'
import { HotkeyConfig, hotkeyToSymbols } from '../shared/hotkey'

export default function PopupApp() {
  const [config, setConfig] = useState<Awaited<ReturnType<typeof getConfig>>>(null)
  const [hotkey, setHotkey] = useState<HotkeyConfig | null>(null)

  useEffect(() => {
    getConfig().then(setConfig)
    getHotkeyConfig().then(setHotkey)
  }, [])

  async function handleCollect() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    // 通知 content script 打开弹窗
    chrome.tabs.sendMessage(tab.id, {
      type: 'OPEN_COLLECT_DIALOG',
      url: tab.url,
      title: tab.title,
    })
    window.close()
  }

  function openCollectPage() {
    if (config?.feishuUrl) {
      chrome.tabs.create({ url: config.feishuUrl })
    } else {
      chrome.runtime.openOptionsPage()
    }
  }

  function openSettings() {
    chrome.runtime.openOptionsPage()
  }

  return (
    <div className="w-80 bg-bg p-4 font-sans">
      {/* Logo + 标题 */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-border">
        <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center text-white font-bold text-sm">
          C
        </div>
        <div>
          <h1 className="text-base font-semibold text-text">Collect to Lark</h1>
          <p className="text-xs text-muted mt-0.5">收藏网页到飞书多维表格</p>
        </div>
      </div>

      {/* 主要操作区 */}
      <div className="space-y-2 mb-4">
        <button
          className="btn-primary w-full flex items-center justify-center gap-2 py-3"
          onClick={handleCollect}
          disabled={!config?.appId}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
          </svg>
          收藏当前页面
        </button>

        <button
          className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5"
          onClick={openCollectPage}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          打开收藏页面
        </button>

        <button
          className="btn-secondary w-full flex items-center justify-center gap-2 py-2.5"
          onClick={openSettings}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          设置
        </button>
      </div>

      {/* 未配置提示 */}
      {!config?.appId && (
        <div className="bg-[#FEF3C7] border border-[#FDE68A] rounded-lg p-3 mb-4">
          <p className="text-xs text-[#92400E]">
            尚未配置飞书应用，请先在设置页完成配置
          </p>
        </div>
      )}

      {/* 快捷键提示 */}
      <div className="mt-4 pt-3 border-t border-border text-center">
                {hotkey?.enabled && (
                  <p className="text-xs text-muted">
                    快捷键 <kbd className="bg-surface border border-border rounded px-1.5 py-0.5 text-xs">
                      {hotkeyToSymbols(hotkey)}
                    </kbd> 快速收藏
                  </p>
                )}
      </div>
    </div>
  )
}
