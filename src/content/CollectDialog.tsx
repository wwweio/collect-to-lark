import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CollectFormData, FieldMeta, FieldOption } from '../shared/types'
import { getConfig } from '../shared/storage'
import { friendlyError } from '../shared/errors'
import OptionSelect from './OptionSelect'

interface Props {
  url: string
  initialTitle: string
  initialCreator?: string
  onClose: () => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

const CATEGORY_FIELD = '分类'
const TAG_FIELD = '标签'
/** 与 dialogStyles 里的 --ctl-dur 保持一致，等退场动画播完再卸载 */
const EXIT_MS = 180
/** 提交受理后让用户看一眼成功态再收起 */
const SUCCESS_HOLD_MS = 600

const FOCUSABLE = 'input:not([readonly]), textarea, button:not([disabled])'
/** 打开时先落在标题输入框上，而不是 DOM 里排在更前面的关闭按钮 */
const FIRST_FIELD = '.ctl-form input:not([readonly]), .ctl-form textarea'

export default function CollectDialog({ url, initialTitle, initialCreator = '', onClose }: Props) {
  const [formData, setFormData] = useState<CollectFormData>(() => ({
    title: initialTitle || document.title,
    description: getMetaDescription(),
    url,
    category: '',
    tags: [],
    note: '',
    creator: initialCreator,
    // 打开弹窗的时刻就固化，保证用户看到的时间与写进飞书的一致
    collectedAt: Date.now(),
  }))
  const [categoryOptions, setCategoryOptions] = useState<FieldOption[]>([])
  const [tagOptions, setTagOptions] = useState<FieldOption[]>([])
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [closing, setClosing] = useState(false)

  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = 'ctl-dialog-title'

  const patch = (changes: Partial<CollectFormData>) =>
    setFormData(prev => ({ ...prev, ...changes }))

  /** 先播退场动画再真正卸载 */
  const requestClose = useCallback(() => {
    setClosing(true)
    window.setTimeout(onClose, EXIT_MS)
  }, [onClose])

  useEffect(() => { void loadOptions() }, [])

  // 打开时把焦点收进弹窗，Tab 才不会跑到宿主页面
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>(FIRST_FIELD)?.focus()
  }, [])

  // 弹窗期间锁住宿主页面滚动
  useEffect(() => {
    const html = document.documentElement
    const previous = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { html.style.overflow = previous }
  }, [])

  // 焦点不在弹窗内（例如点过页面空白处）时的 Esc 兜底：
  // 弹窗内部的按键会被 shadow host 拦在冒泡阶段，不会走到这里，因此不会重复触发
  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [requestClose])

  async function loadOptions() {
    try {
      const config = await getConfig()
      if (!config?.appToken || !config?.tableId) return
      const res = await chrome.runtime.sendMessage({
        type: 'FEISHU_API_CALL',
        payload: { method: 'getFieldMeta', params: [config.appToken, config.tableId] },
      })
      if (!res?.success) return
      const fields = res.data as FieldMeta[]
      setCategoryOptions(fields.find(f => f.field_name === CATEGORY_FIELD)?.property?.options ?? [])
      setTagOptions(fields.find(f => f.field_name === TAG_FIELD)?.property?.options ?? [])
    } catch (e) {
      console.error('[Collect to Lark] 加载字段选项失败:', (e as Error).message)
    }
  }

  /** 现场创建的新选项立即通知后台预建，趁用户继续填表的时间完成写请求
   * 注意：预建后即使取消弹窗，选项也会留在飞书字段里 */
  function precreateOption(fieldName: string, name: string) {
    chrome.runtime.sendMessage({ type: 'PRECREATE_OPTION', payload: { fieldName, name } })
      .catch(() => {
        // 预建失败不影响保存，保存时会兜底追加
      })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (status.kind === 'submitting' || status.kind === 'success') return
    setStatus({ kind: 'submitting' })
    try {
      // 飞书写接口单次要数秒，不在这里等结果：background 收单后后台完成，结果用页面轻提示回报
      const res = await chrome.runtime.sendMessage({
        type: 'CREATE_RECORD_ASYNC',
        payload: { formData },
      })
      if (!res?.accepted) throw new Error('后台未受理这次提交，请重试')
      setStatus({ kind: 'success' })
      window.setTimeout(requestClose, SUCCESS_HOLD_MS)
    } catch (err) {
      setStatus({ kind: 'error', message: friendlyError((err as Error).message) })
    }
  }

  /** 焦点在弹窗内循环 */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      // 下拉展开时 OptionSelect 已经拦下了 Esc，走到这里说明该关弹窗
      e.preventDefault()
      requestClose()
      return
    }
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => el.offsetParent !== null)
    if (focusables.length === 0) return

    // Shadow DOM 内的真实焦点要从 shadowRoot 上取，document.activeElement 只会是 host
    const root = dialogRef.current.getRootNode() as ShadowRoot
    const current = root.activeElement
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    if (!e.shiftKey && current === last) { e.preventDefault(); first.focus() }
    else if (e.shiftKey && current === first) { e.preventDefault(); last.focus() }
  }

  const submitting = status.kind === 'submitting'
  const submitted = status.kind === 'success'

  return (
    <div
      className="ctl-root ctl-overlay"
      data-closing={closing}
      onMouseDown={e => { if (e.target === e.currentTarget) requestClose() }}
    >
      <div
        className="ctl-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="ctl-header">
          <h2 className="ctl-title" id={titleId}>收藏到飞书</h2>
          <button type="button" className="ctl-close" aria-label="关闭" onClick={requestClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form className="ctl-form" onSubmit={handleSubmit}>
          <div className="ctl-form-body">
            <Field label="内容标题" required>
              <input
                type="text"
                className="ctl-input"
                value={formData.title}
                onChange={e => patch({ title: e.target.value })}
                placeholder="输入标题"
                required
              />
            </Field>

            <Field label="网页说明">
              <textarea
                className="ctl-textarea"
                rows={2}
                value={formData.description}
                onChange={e => patch({ description: e.target.value })}
                placeholder="简要描述"
              />
            </Field>

            <Field label="网页地址">
              <input type="url" className="ctl-input" value={formData.url} readOnly />
            </Field>

            <OptionSelect
              label={CATEGORY_FIELD}
              options={categoryOptions}
              values={formData.category ? [formData.category] : []}
              onChange={values => patch({ category: values[0] || '' })}
              onCreateOption={name => precreateOption(CATEGORY_FIELD, name)}
            />

            <OptionSelect
              label={TAG_FIELD}
              multiple
              options={tagOptions}
              values={formData.tags}
              onChange={tags => patch({ tags })}
              onCreateOption={name => precreateOption(TAG_FIELD, name)}
            />

            <Field label="备注">
              <textarea
                className="ctl-textarea"
                rows={2}
                value={formData.note}
                onChange={e => patch({ note: e.target.value })}
                placeholder="可选备注"
              />
            </Field>

            <div className="ctl-row">
              <Field label="创建人">
                <input
                  type="text"
                  className="ctl-input"
                  value={formData.creator}
                  onChange={e => patch({ creator: e.target.value })}
                  placeholder="姓名"
                />
              </Field>
              <Field label="收集时间">
                <input
                  type="text"
                  className="ctl-input"
                  value={new Date(formData.collectedAt).toLocaleString('zh-CN')}
                  readOnly
                />
              </Field>
            </div>
          </div>

          <div className="ctl-actions">
            {status.kind === 'error' && (
              <div className="ctl-error" role="alert">{status.message}</div>
            )}

            <div className="ctl-footer">
              <button type="button" className="ctl-btn ctl-btn--ghost" onClick={requestClose}>取消</button>
              <button
                type="submit"
                className="ctl-btn ctl-btn--primary"
                disabled={submitting || submitted || !formData.title.trim()}
              >
                {submitting && <><span className="ctl-spinner" />提交中</>}
                {submitted && <>✓ 已提交</>}
                {!submitting && !submitted && '保存收藏'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <label className="ctl-field">
      <span className="ctl-label">
        {label} {required && <span className="ctl-required">*</span>}
      </span>
      {children}
    </label>
  )
}

function getMetaDescription(): string {
  return document.querySelector('meta[name="description"]')?.getAttribute('content')
    || document.querySelector('meta[property="og:description"]')?.getAttribute('content')
    || ''
}
