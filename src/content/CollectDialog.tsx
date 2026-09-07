import React, { useState, useEffect, useRef } from 'react'
import { CollectFormData, FieldOption } from '../shared/types'
import { getConfig } from '../shared/storage'

interface Props {
  url: string
  initialTitle: string
  initialCreator?: string
  onClose: () => void
}

// 飞书风格配色（柔和背景 + 深文字）
const TAG_COLORS = [
  { bg: '#E8F5E9', text: '#2E7D32' },
  { bg: '#E3F2FD', text: '#1565C0' },
  { bg: '#FFF3E0', text: '#E65100' },
  { bg: '#F3E5F5', text: '#7B1FA2' },
  { bg: '#E0F2F1', text: '#00695C' },
  { bg: '#FCE4EC', text: '#C62828' },
  { bg: '#FFF8E1', text: '#F57F17' },
  { bg: '#E8EAF6', text: '#283593' },
  { bg: '#EFEBE9', text: '#4E342E' },
  { bg: '#F1F8E9', text: '#558B2F' },
]

function getColor(idx: number) {
  return TAG_COLORS[idx % TAG_COLORS.length]
}

export default function CollectDialog({ url, initialTitle, initialCreator = '', onClose }: Props) {
  const [formData, setFormData] = useState<CollectFormData>({
    title: initialTitle || document.title,
    description: getMetaDescription(),
    url,
    category: '',
    tags: [],
    note: '',
    creator: initialCreator,
  })

  const [categoryOptions, setCategoryOptions] = useState<FieldOption[]>([])
  const [tagOptions, setTagOptions] = useState<FieldOption[]>([])
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => { loadOptions(); loadCreator() }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function loadOptions() {
    try {
      const config = await getConfig()
      if (!config?.appToken || !config?.tableId) return
      const res = await chrome.runtime.sendMessage({
        type: 'FEISHU_API_CALL',
        payload: { method: 'getFieldMeta', params: [config.appToken, config.tableId] },
      })
      if (res?.success) {
        const fields = res.data as Array<{ field_name: string; property?: { options?: FieldOption[] } }>
        const cat = fields.find(f => f.field_name === '分类')
        const tag = fields.find(f => f.field_name === '标签')
        if (cat?.property?.options) setCategoryOptions(cat.property.options)
        if (tag?.property?.options) setTagOptions(tag.property.options)
      }
    } catch (e) { console.error('[Collect to Lark] loadOptions:', e) }
  }

  async function loadCreator() {
    try {
      // 如果已通过 prop 传入初始值，则跳过异步加载
      if (initialCreator) return
      const config = await getConfig()
      if (config?.creatorName) {
        setFormData(p => ({ ...p, creator: p.creator || config.creatorName }))
      }
    } catch (e) {
      console.error('[Collect to Lark] loadCreator error:', e)
    }
  }

  /** 现场创建的新选项立即通知后台预建，趁用户继续填表的时间完成写请求
   * 注意：预建后即使取消弹窗，选项也会留在飞书字段里 */
  function precreateOption(fieldName: string, name: string) {
    chrome.runtime.sendMessage({
      type: 'PRECREATE_OPTION',
      payload: { fieldName, name },
    }).catch(() => {
      // 预建失败不影响保存，保存时会兜底追加
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg('')
    try {
      // 飞书写接口单次要数秒，不在这里等结果：background 收单后后台完成，结果用页面轻提示回报
      const res = await chrome.runtime.sendMessage({
        type: 'CREATE_RECORD_ASYNC',
        payload: { formData },
      })
      if (res?.accepted) {
        setStatus('success')
        setTimeout(onClose, 700)
      } else {
        setStatus('error')
        setErrorMsg('提交失败，请重试')
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg((e as Error).message)
    }
  }

  if (status === 'success') {
    return (
      <div style={S.overlay} onClick={onClose}>
        <div style={S.successCard}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
          </svg>
          <p style={{ marginTop: 12, color: '#1A1A1A', fontSize: 15 }}>已提交</p>
          <p style={{ marginTop: 6, color: '#78716C', fontSize: 12 }}>正在后台写入飞书，结果会在右上角提示</p>
        </div>
      </div>
    )
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.dialog}>
        <div style={S.header}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1A1A1A' }}>收藏到飞书</h2>
          <button onClick={onClose} style={S.closeBtn}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#78716C" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={S.form}>
          <Field label="内容标题" required>
            <input type="text" value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="输入标题" required style={S.input} />
          </Field>
          <Field label="网页说明">
            <textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="简要描述" rows={2} style={S.textarea} />
          </Field>
          <Field label="网页地址">
            <input type="url" value={formData.url} readOnly style={{ ...S.input, background: '#F5F3F0', cursor: 'default' }} />
          </Field>

          {/* 分类 - 单选 */}
          <SingleSelect
            label="分类"
            options={categoryOptions}
            value={formData.category}
            onChange={v => setFormData(p => ({ ...p, category: v }))}
            onCreateOption={name => precreateOption('分类', name)}
          />

          {/* 标签 - 多选 */}
          <MultiSelect
            label="标签"
            options={tagOptions}
            values={formData.tags}
            onChange={tags => setFormData(p => ({ ...p, tags }))}
            onCreateOption={name => precreateOption('标签', name)}
          />

          <Field label="备注">
            <textarea value={formData.note} onChange={e => setFormData(p => ({ ...p, note: e.target.value }))} placeholder="可选备注" rows={2} style={S.textarea} />
          </Field>

          <div style={S.row}>
            <div style={{ flex: 1 }}>
              <Field label="创建人">
                <input type="text" value={formData.creator} onChange={e => setFormData(p => ({ ...p, creator: e.target.value }))} placeholder="姓名" style={S.input} />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="收集时间">
                <input type="text" value={new Date().toLocaleString('zh-CN')} readOnly style={{ ...S.input, background: '#F5F3F0', cursor: 'default' }} />
              </Field>
            </div>
          </div>

          {status === 'error' && (
            <div style={S.errorBox}>{errorMsg}</div>
          )}

          <div style={S.submitRow}>
            <button type="button" onClick={onClose} className="cancel-btn" style={S.cancelBtn}>取消</button>
            <button type="submit" className="submit-btn" disabled={status === 'submitting' || !formData.title} style={S.submitBtn}>
              {status === 'submitting' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={S.spinner} /> 提交中...
                </span>
              ) : '保存收藏'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ============ 单选下拉组件 ============ */
function SingleSelect({ label, options, value, onChange, onCreateOption }: {
  label: string; options: FieldOption[]; value: string; onChange: (v: string) => void
  onCreateOption?: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = options.filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase()))
  const showCreate = search.trim() && !options.find(o => o.name === search.trim())
  const selectedIdx = options.findIndex(o => o.name === value)

  function select(name: string) {
    // 飞书里不存在的选项，选中时就交给后台预建
    if (!options.some(o => o.name === name)) onCreateOption?.(name)
    onChange(name)
    setSearch('')
    setOpen(false)
  }

  return (
    <Field label={label}>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <div style={S.selectBox} onClick={() => setOpen(!open)}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '6px 10px', minHeight: 34 }}>
            {value && !open && (
              <span style={{
                ...S.tag,
                background: getColor(selectedIdx >= 0 ? selectedIdx : 0).bg,
                color: getColor(selectedIdx >= 0 ? selectedIdx : 0).text,
              }}>
                {value}
                <button type="button" onClick={e => { e.stopPropagation(); onChange('') }} style={S.tagX}>×</button>
              </span>
            )}
            {open && (
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={value || '查找或创建选项'}
                autoFocus
                style={S.innerInput}
                onKeyDown={e => {
                  if (e.key === 'Enter' && search.trim()) { e.preventDefault(); select(search.trim()) }
                  if (e.key === 'Escape') setOpen(false)
                  if (e.key === 'Backspace' && !search && value) onChange('')
                }}
              />
            )}
            {!value && !open && (
              <span style={{ color: '#A8A29E', fontSize: 14 }}>选择或输入{label}</span>
            )}
          </div>
          <span style={S.arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#78716C" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
        {open && (filtered.length > 0 || showCreate) && (
          <div style={S.dropdown}>
            <div style={S.dropdownTitle}>查找或创建选项</div>
            {filtered.map((opt) => {
              const c = getColor(options.indexOf(opt))
              const isSelected = opt.name === value
              return (
                <div key={opt.name} data-dropdown-item
                  style={{ ...S.dropdownItem, ...(isSelected ? S.dropdownItemActive : {}) }}
                  onMouseDown={e => { e.preventDefault(); select(opt.name) }}>
                  <span style={{ ...S.optionDot, background: c.bg, border: `1.5px solid ${c.text}` }} />
                  <span style={{ flex: 1 }}>{opt.name}</span>
                  {isSelected && <span style={{ color: '#0D7377', fontSize: 13, fontWeight: 600 }}>✓</span>}
                </div>
              )
            })}
            {showCreate && (
              <div data-dropdown-item style={{ ...S.dropdownItem, color: '#0D7377', fontWeight: 500 }}
                onMouseDown={e => { e.preventDefault(); select(search.trim()) }}>
                <span style={{ marginRight: 6, fontSize: 16 }}>+</span>
                创建「{search.trim()}」
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  )
}

/* ============ 多选下拉组件 ============ */
function MultiSelect({ label, options, values, onChange, onCreateOption }: {
  label: string; options: FieldOption[]; values: string[]; onChange: (v: string[]) => void
  onCreateOption?: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const available = options.filter(o => !values.includes(o.name))
  const filtered = available.filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase()))
  const showCreate = search.trim() && !options.find(o => o.name === search.trim()) && !values.includes(search.trim())

  function add(name: string) {
    const t = name.trim()
    if (t && !values.includes(t)) {
      // 飞书里不存在的选项，选中时就交给后台预建
      if (!options.some(o => o.name === t)) onCreateOption?.(t)
      onChange([...values, t])
    }
    setSearch('')
  }
  function remove(name: string) {
    onChange(values.filter(v => v !== name))
  }

  return (
    <Field label={label}>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        {/* 已选标签区 + 输入框 */}
        <div style={S.selectBox} onClick={() => setOpen(true)}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '6px 10px', minHeight: 34 }}>
            {values.map((v, i) => {
              const idx = options.findIndex(o => o.name === v)
              const c = getColor(idx >= 0 ? idx : i + options.length)
              return (
                <span key={v} style={{ ...S.tag, background: c.bg, color: c.text }}>
                  {v}
                  <button type="button" onClick={e => { e.stopPropagation(); remove(v) }} style={S.tagX}>×</button>
                </span>
              )
            })}
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              placeholder={values.length ? '' : '查找或创建选项'}
              style={{ ...S.innerInput, minWidth: values.length ? 40 : 120 }}
              onKeyDown={e => {
                if (e.key === 'Enter' && search.trim()) { e.preventDefault(); add(search.trim()) }
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'Backspace' && !search && values.length) remove(values[values.length - 1])
              }}
            />
          </div>
          <span style={S.arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#78716C" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </span>
        </div>
        {/* 下拉面板 */}
        {open && (filtered.length > 0 || showCreate) && (
          <div style={S.dropdown}>
            <div style={S.dropdownTitle}>查找或创建选项</div>
            {filtered.map(opt => {
              const idx = options.indexOf(opt)
              const c = getColor(idx)
              const isSelected = values.includes(opt.name)
              return (
                <div key={opt.name} data-dropdown-item
                  style={{ ...S.dropdownItem, ...(isSelected ? S.dropdownItemActive : {}) }}
                  onMouseDown={e => { e.preventDefault(); if (!isSelected) add(opt.name) }}>
                  <span style={{ ...S.optionDot, background: c.bg, border: `1.5px solid ${c.text}` }} />
                  <span style={{ flex: 1 }}>{opt.name}</span>
                  {isSelected && <span style={{ color: '#0D7377', fontSize: 13, fontWeight: 600 }}>✓</span>}
                </div>
              )
            })}
            {showCreate && (
              <div data-dropdown-item style={{ ...S.dropdownItem, color: '#0D7377', fontWeight: 500 }}
                onMouseDown={e => { e.preventDefault(); add(search.trim()) }}>
                <span style={{ marginRight: 6, fontSize: 16 }}>+</span>
                创建「{search.trim()}」
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  )
}

/* ============ 辅助 ============ */
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={S.fieldGroup}>
      <label style={S.label}>{label} {required && <span style={{ color: '#DC2626' }}>*</span>}</label>
      {children}
    </div>
  )
}

function getMetaDescription(): string {
  return document.querySelector('meta[name="description"]')?.getAttribute('content')
    || document.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''
}

/* ============ Styles ============ */
const bd = '1px solid #E8E6E3'
const inputBase: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: bd, borderRadius: 8,
  fontSize: 14, color: '#1A1A1A', outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
}

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(26,26,26,0.3)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2147483647, animation: 'fadeIn 0.15s ease',
  },
  dialog: {
    background: '#FFF', borderRadius: 12, width: 480, maxHeight: '85vh',
    overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)',
    animation: 'scaleIn 0.2s ease',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  successCard: {
    background: '#FFF', borderRadius: 12, padding: '40px 48px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)', animation: 'scaleIn 0.2s ease',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px 16px', borderBottom: '1px solid #F0EDE9',
  },
  closeBtn: {
    background: 'none', border: 'none', padding: 4, borderRadius: 6,
    cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#78716C',
  },
  form: { padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontSize: 13, fontWeight: 500, color: '#44403C', marginBottom: 2 },
  row: { display: 'flex', gap: 12 },
  input: inputBase,
  textarea: { ...inputBase, resize: 'vertical' as const },

  // Select box
  selectBox: {
    display: 'flex', alignItems: 'center', border: bd, borderRadius: 8,
    background: '#FFF', cursor: 'text', transition: 'border-color 0.15s',
    minHeight: 38,
  },
  innerInput: {
    border: 'none', outline: 'none', fontSize: 14, color: '#1A1A1A',
    fontFamily: 'inherit', background: 'transparent', flex: 1,
    minWidth: 60, padding: 0, lineHeight: '22px',
  },
  arrow: {
    display: 'flex', alignItems: 'center', padding: '0 10px',
    pointerEvents: 'none', color: '#78716C', flexShrink: 0,
  },

  // Tags
  tag: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    fontSize: 12, fontWeight: 500, padding: '2px 8px',
    borderRadius: 14, lineHeight: '18px', whiteSpace: 'nowrap' as const,
  },
  tagX: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 14, lineHeight: 1, padding: '0 1px', opacity: 0.7,
    color: 'inherit',
  },

  // Dropdown
  dropdown: {
    position: 'absolute' as const, top: '100%', left: 0, right: 0,
    marginTop: 4, background: '#FFF', border: bd, borderRadius: 8,
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)', maxHeight: 220,
    overflowY: 'auto' as const, zIndex: 10,
  },
  dropdownTitle: {
    padding: '8px 12px 4px', fontSize: 11, color: '#A8A29E',
    fontWeight: 500, letterSpacing: 0.3,
  },
  dropdownItem: {
    padding: '8px 12px', fontSize: 13, color: '#1A1A1A',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
  },
  dropdownItemActive: { background: '#F5F3F0' },
  optionDot: {
    width: 10, height: 10, borderRadius: '50%',
    flexShrink: 0, display: 'inline-block',
  },

  // Error & buttons
  errorBox: {
    background: '#FEF2F2', border: '1px solid #FECACA',
    borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#DC2626',
  },
  submitRow: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  cancelBtn: {
    background: '#F5F3F0', color: '#1A1A1A', border: bd,
    borderRadius: 8, padding: '8px 18px', fontSize: 14, cursor: 'pointer', fontWeight: 500,
  },
  submitBtn: {
    background: '#0D7377', color: '#FFF', border: 'none',
    borderRadius: 8, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
  },
  spinner: {
    display: 'inline-block', width: 14, height: 14,
    border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #FFF',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
}
