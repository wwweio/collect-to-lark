import { useState, useEffect } from 'react'
import {
  getConfig,
  saveConfig,
  getHotkeyConfig,
  saveHotkeyConfig,
  parseFeishuUrl,
  exportConfig,
  importConfig,
} from '../shared/storage'
import { FeishuConfig, TableInfo } from '../shared/types'
import { HotkeyConfig, DEFAULT_HOTKEY, hotkeyToDisplay, isReservedHotkey, extractKeyFromEvent } from '../shared/hotkey'

export default function OptionsApp() {
  const [form, setForm] = useState<Partial<FeishuConfig>>({
    appId: '',
    appSecret: '',
    feishuUrl: '',
    appToken: '',
    tableId: '',
    tableName: '',
    creatorName: '',
  })

  const [hotkey, setHotkey] = useState<HotkeyConfig>({ ...DEFAULT_HOTKEY })
  const [isRecording, setIsRecording] = useState(false)
  const [hotkeyStatus, setHotkeyStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' })
  const [showSecret, setShowSecret] = useState(false)
  const [tables, setTables] = useState<TableInfo[]>([])
  const [urlValid, setUrlValid] = useState<boolean | null>(null)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle')

  useEffect(() => {
    getConfig().then(cfg => { if (cfg) setForm(cfg) })
    getHotkeyConfig().then(setHotkey)
  }, [])

  // 快捷键录制
  useEffect(() => {
    if (!isRecording) return

    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') { setIsRecording(false); return }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

      const key = extractKeyFromEvent(e)
      if (!key) return

      setHotkey(prev => ({
        ...prev,
        key,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
      }))
      setIsRecording(false)
    }

    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [isRecording])

  async function handleSaveHotkey() {
    try {
      await saveHotkeyConfig(hotkey)
      setHotkeyStatus({ type: 'success', message: '快捷键配置已保存' })
      setTimeout(() => setHotkeyStatus({ type: null, message: '' }), 3000)
    } catch (err) {
      setHotkeyStatus({ type: 'error', message: '保存失败: ' + (err as Error).message })
    }
  }

  function handleResetHotkey() {
    setHotkey({ ...DEFAULT_HOTKEY })
  }

  // URL 变化时自动解析 app_token
  function handleUrlChange(url: string) {
    setForm(prev => ({ ...prev, feishuUrl: url }))
    const parsed = parseFeishuUrl(url)
    if (parsed) {
      setForm(prev => ({ ...prev, appToken: parsed.appToken }))
      setUrlValid(true)
      if (form.appId && form.appSecret) {
        loadTables(parsed.appToken)
      }
    } else {
      setForm(prev => ({ ...prev, appToken: '' }))
      setUrlValid(url ? false : null)
      setTables([])
    }
  }

  async function loadTables(appToken: string): Promise<TableInfo[] | null> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FEISHU_API_CALL',
        payload: { method: 'listTables', params: [appToken] },
      })
      if (response?.success && response.data) {
        const list = response.data as TableInfo[]
        setTables(list)
        if (list.length === 1 && !form.tableId) {
          setForm(prev => ({ ...prev, tableId: list[0].table_id, tableName: list[0].name }))
        }
        return list
      }
      return null
    } catch {
      return null
    }
  }

  async function handleTestConnection() {
    setTestStatus('testing')
    setTestMsg('')
    if (!form.appId || !form.appSecret) {
      setTestStatus('error'); setTestMsg('请填写 App ID 和 App Secret'); return
    }
    if (!form.appToken) {
      setTestStatus('error'); setTestMsg('请填写有效的飞书多维表格链接'); return
    }
    if (!form.tableId) {
      const loaded = await loadTables(form.appToken)
      if (!loaded || loaded.length === 0) {
        setTestStatus('error'); setTestMsg('无法获取数据表列表，请检查链接和权限'); return
      }
      if (loaded.length === 1) {
        setForm(prev => ({ ...prev, tableId: loaded[0].table_id, tableName: loaded[0].name }))
      } else {
        setTestStatus('error'); setTestMsg('请在下方选择一个数据表后再测试'); return
      }
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FEISHU_API_CALL',
        payload: { method: 'testConnection', params: [form.appId, form.appSecret, form.appToken, form.tableId] },
      })
      if (response?.success) {
        const result = response.data as { ok: boolean; message: string }
        setTestStatus(result.ok ? 'success' : 'error')
        setTestMsg(result.message)
      } else {
        setTestStatus('error')
        setTestMsg(response?.error || '连接失败')
      }
    } catch (err) {
      setTestStatus('error')
      setTestMsg(`连接失败: ${(err as Error).message}`)
    }
  }

  async function handleSave() {
    await saveConfig(form)
    setSaveStatus('saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }

  async function handleExport() {
    const json = await exportConfig()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `collect-to-lark-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await importConfig(reader.result as string)
        const cfg = await getConfig()
        if (cfg) setForm(cfg)
        alert('配置导入成功！')
      } catch {
        alert('导入失败，请检查文件格式')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* 头部 */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-white font-bold text-xl">
            C
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-text">Collect to Lark</h1>
            <p className="text-sm text-muted mt-1">配置飞书应用和多维表格，将网页收藏到飞书</p>
          </div>
        </div>

        {/* 飞书应用配置 */}
        <section className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-text mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">1</span>
            飞书应用凭证
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-stone-600 mb-1.5 font-medium">App ID</label>
              <input
                type="text"
                value={form.appId}
                onChange={e => setForm(prev => ({ ...prev, appId: e.target.value }))}
                placeholder="输入飞书应用的 App ID"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-stone-600 mb-1.5 font-medium">App Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={form.appSecret}
                  onChange={e => setForm(prev => ({ ...prev, appSecret: e.target.value }))}
                  placeholder="输入飞书应用的 App Secret"
                  className="w-full pr-16"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-text px-2 py-1 rounded bg-[#F5F3F0] border border-border"
                >
                  {showSecret ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 多维表格配置 */}
        <section className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-text mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">2</span>
            多维表格
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-stone-600 mb-1.5 font-medium">飞书多维表格链接</label>
              <div className="relative">
                <input
                  type="url"
                  value={form.feishuUrl}
                  onChange={e => handleUrlChange(e.target.value)}
                  placeholder="粘贴飞书多维表格链接，如 https://xxx.feishu.cn/wiki/..."
                  className={`w-full pr-10 ${urlValid === false ? 'border-danger' : urlValid === true ? 'border-success' : ''}`}
                />
                {urlValid !== null && (
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-lg ${urlValid ? 'text-success' : 'text-danger'}`}>
                    {urlValid ? '✓' : '✗'}
                  </span>
                )}
              </div>
              {urlValid === false && (
                <p className="text-xs text-danger mt-1">无法识别链接格式，请粘贴飞书多维表格的完整 URL</p>
              )}
              {urlValid === true && form.appToken && (
                <p className="text-xs text-success mt-1">已解析 app_token: <code className="bg-[#F0EDE9] px-1 rounded">{form.appToken}</code></p>
              )}
            </div>

            {/* 加载表格列表按钮 */}
            {urlValid && form.appId && form.appSecret && (
              <button
                onClick={() => loadTables(form.appToken!)}
                className="text-sm text-accent hover:text-accent-hover underline"
              >
                {tables.length > 0 ? '刷新表格列表' : '加载表格列表'}
              </button>
            )}

            {/* 表格选择 */}
            {tables.length > 0 && (
              <div>
                <label className="block text-sm text-stone-600 mb-1.5 font-medium">选择数据表</label>
                <select
                  value={form.tableId}
                  onChange={e => {
                    const table = tables.find(t => t.table_id === e.target.value)
                    setForm(prev => ({ ...prev, tableId: e.target.value, tableName: table?.name || '' }))
                  }}
                >
                  <option value="">请选择数据表</option>
                  {tables.map(t => (
                    <option key={t.table_id} value={t.table_id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {urlValid && tables.length === 0 && (!form.appId || !form.appSecret) && (
              <p className="text-xs text-muted">填写 App ID 和 App Secret 后可加载表格列表</p>
            )}
          </div>
        </section>

        {/* 个人信息 */}
        <section className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-text mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">3</span>
            个人信息
          </h2>
          <div>
            <label className="block text-sm text-stone-600 mb-1.5 font-medium">创建人昵称</label>
            <input
              type="text"
              value={form.creatorName}
              onChange={e => setForm(prev => ({ ...prev, creatorName: e.target.value }))}
              placeholder="填写你的昵称，用于标识收藏者"
              className="w-full"
            />
            <p className="text-xs text-muted mt-1">收藏网页时会自动填充此昵称</p>
          </div>
        </section>

        {/* 快捷键设置 */}
        <section className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-text mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">4</span>
            快捷键设置
          </h2>
                  
          {/* 快捷键录制器 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-text mb-2">收藏快捷键</label>
            <div className="flex items-center gap-3">
              <div
                className={`flex-1 h-12 rounded-xl border-2 border-dashed flex items-center justify-center text-[15px] font-bold transition-all ${
                  isRecording
                    ? 'border-accent bg-accent/5 text-accent animate-pulse'
                    : 'border-border bg-stone-50/50 text-text'
                }`}
              >
                {isRecording ? '请按下快捷键组合...' : hotkeyToDisplay(hotkey)}
              </div>
              <button
                type="button"
                onClick={() => setIsRecording(!isRecording)}
                className={`h-12 px-5 rounded-xl font-bold text-[13px] transition-all ${
                  isRecording
                    ? 'bg-stone-100 text-muted hover:bg-stone-200'
                    : 'bg-accent text-white hover:bg-accent-hover'
                }`}
              >
                {isRecording ? '取消' : '修改'}
              </button>
            </div>
        
            {/* 冲突警告 */}
            {isReservedHotkey(hotkey) && (
              <div className="flex items-start gap-2 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" className="shrink-0 mt-0.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <p className="text-xs text-amber-800 leading-relaxed">
                  此快捷键可能与浏览器默认快捷键冲突，建议使用 Alt + 字母 的组合
                </p>
              </div>
            )}
          </div>
        
          {/* 启用/禁用 */}
          <div className="flex items-center justify-between mb-5 pb-5 border-b border-border">
            <div>
              <label className="block text-sm font-medium text-text">启用快捷键</label>
              <p className="text-xs text-muted mt-0.5">关闭后快捷键将不再触发收藏</p>
            </div>
            <button
              type="button"
              onClick={() => setHotkey(prev => ({ ...prev, enabled: !prev.enabled }))}
              className={`w-12 h-7 rounded-full transition-all relative ${
                hotkey.enabled ? 'bg-accent' : 'bg-stone-300'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-1 transition-all ${
                hotkey.enabled ? 'left-6' : 'left-1'
              }`} />
            </button>
          </div>
        
          {/* 操作按钮 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveHotkey}
              className="btn-primary px-6 py-2.5"
            >
              保存快捷键
            </button>
            <button
              type="button"
              onClick={handleResetHotkey}
              className="btn-secondary px-5 py-2.5"
            >
              恢复默认
            </button>
            {hotkeyStatus.type && (
              <span className={`text-sm font-medium ${
                hotkeyStatus.type === 'success' ? 'text-success' : 'text-danger'
              }`}>
                {hotkeyStatus.message}
              </span>
            )}
          </div>
        
        </section>

        {/* 操作区 */}
        <section className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-text mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">5</span>
            测试与保存
          </h2>

          {/* 测试连接 */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleTestConnection}
              disabled={testStatus === 'testing'}
              className="btn-secondary flex items-center gap-2"
            >
              {testStatus === 'testing' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-muted border-t-transparent rounded-full animate-spin" />
                  测试中...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  测试连接
                </>
              )}
            </button>
            {testStatus !== 'idle' && testStatus !== 'testing' && (
              <span className={`text-sm ${testStatus === 'success' ? 'text-success' : 'text-danger'}`}>
                {testMsg}
              </span>
            )}
          </div>

          {/* 保存按钮 */}
          <div className="flex items-center gap-3">
            <button onClick={handleSave} className="btn-primary flex items-center gap-2 px-8">
              {saveStatus === 'saved' ? '✓ 已保存' : '保存配置'}
            </button>

            {/* 打开收藏页面 */}
            {form.feishuUrl && (
              <a
                href={form.feishuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary flex items-center gap-2 no-underline text-text"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                打开收藏页面
              </a>
            )}
          </div>
        </section>

        {/* 配置导入/导出 */}
        <section className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-base font-semibold text-text mb-4">配置备份</h2>
          <div className="flex items-center gap-3">
            <button onClick={handleExport} className="btn-secondary flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              导出配置
            </button>
            <label className="btn-secondary flex items-center gap-2 cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              导入配置
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
            </label>
          </div>
        </section>

        {/* 使用说明 */}
        <section className="bg-[#F5F3F0] border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold text-text mb-3">使用说明</h2>
          <ol className="text-sm text-stone-600 space-y-2 list-decimal list-inside">
            <li>在飞书开放平台创建应用，获取 App ID 和 App Secret</li>
            <li>在应用权限中添加：<code className="bg-white border border-border px-1 rounded text-xs">bitable:app</code></li>
            <li>发布应用版本（权限需要审批通过后生效）</li>
            <li>在多维表格中，将应用添加为协作者：右上角「分享」→ 添加应用 → 选择「可编辑」权限</li>
            <li>在此页面粘贴多维表格链接，选择数据表并保存</li>
            <li>在任意网页右键点击「收藏到飞书」或按快捷键即可开始使用</li>
          </ol>
        </section>
      </div>
    </div>
  )
}
