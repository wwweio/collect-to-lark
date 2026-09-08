import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FieldOption } from '../shared/types'

/** 飞书风格配色（柔和背景 + 深文字） */
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

/**
 * 按选项名取色，而不是按它在 options 里的下标。
 * 字段缓存后台静默刷新会改变选项顺序，用下标取色会让同一个标签换颜色。
 */
function tagColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

interface Props {
  label: string
  options: FieldOption[]
  /** 已选值；单选模式下最多一个 */
  values: string[]
  /** true = 标签（可叠加），false = 分类（互斥，新选覆盖旧选） */
  multiple?: boolean
  onChange: (values: string[]) => void
  /** 选中了飞书里还不存在的选项，交给调用方去后台预建 */
  onCreateOption?: (name: string) => void
}

/**
 * 仿飞书多维表格的选项选择器，单选与多选共用一套逻辑。
 * 支持搜索过滤、现场创建、↑↓ 键选择、Backspace 删除末尾标签。
 */
export default function OptionSelect({
  label, options, values, multiple = false, onChange, onCreateOption,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const fieldRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  /** 收起下拉时一并清掉搜索词，否则输入框会残留一段没有提交的文字 */
  function close() {
    setOpen(false)
    setSearch('')
    setActiveIndex(0)
  }

  // 点击别处收起下拉。弹窗在 Shadow DOM 里，document 上拿到的 target 会被重定向成
  // shadow host，用 contains 判断会把内部点击误判成外部，因此走 composedPath。
  // 范围取整个字段（含文字标签）：只取选择框的话，点标签会先被当成外部点击关掉，
  // 紧接着浏览器把该 click 转发给关联的输入框又重新打开，标签就只能开不能关。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: Event) => {
      if (fieldRef.current && !e.composedPath().includes(fieldRef.current)) close()
    }
    document.addEventListener('mousedown', onPointerDown, true)
    return () => document.removeEventListener('mousedown', onPointerDown, true)
  }, [open])

  const keyword = search.trim()

  const candidates = useMemo(() => {
    // 多选：已选项从下拉里隐藏；单选：保留并标上 ✓
    const pool = multiple ? options.filter(o => !values.includes(o.name)) : options
    if (!keyword) return pool
    const lower = keyword.toLowerCase()
    return pool.filter(o => o.name.toLowerCase().includes(lower))
  }, [options, values, multiple, keyword])

  const canCreate = keyword !== ''
    && !options.some(o => o.name === keyword)
    && !values.includes(keyword)
  const itemCount = candidates.length + (canCreate ? 1 : 0)
  // 候选项变化后下标可能越界，渲染时兜底收敛
  const active = itemCount === 0 ? 0 : Math.min(activeIndex, itemCount - 1)

  // 键盘移动高亮时把选项滚进可视区
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function commit(name: string) {
    const value = name.trim()
    if (!value) return
    if (!options.some(o => o.name === value)) onCreateOption?.(value)

    if (multiple) {
      if (!values.includes(value)) onChange([...values, value])
    } else {
      onChange([value])
      setOpen(false)
    }
    setSearch('')
    setActiveIndex(0)
  }

  function remove(name: string) {
    onChange(values.filter(v => v !== name))
  }

  function commitActive() {
    if (active < candidates.length) commit(candidates[active].name)
    else if (canCreate) commit(keyword)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (itemCount === 0) return
      setActiveIndex((active + (e.key === 'ArrowDown' ? 1 : -1) + itemCount) % itemCount)
      return
    }
    if (e.key === 'Enter') {
      // 输入框里有内容时一律拦下，避免误触发整个表单提交
      if (!open && !keyword) return
      e.preventDefault()
      commitActive()
      return
    }
    if (e.key === 'Escape' && open) {
      // Esc 分层：下拉展开时只收下拉，不冒泡给弹窗的关闭逻辑
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'Backspace' && !search && values.length > 0) {
      e.preventDefault()
      remove(values[values.length - 1])
    }
  }

  /**
   * 点击选择框是「切换」而不是「打开」。
   * 只负责打开的话，下拉展开后再点框内任何位置（输入框空白处、字段文字标签转发过来的点击）
   * 都只会重复置为展开，用户永远点不掉下拉。
   */
  function toggle() {
    if (open) { close(); return }
    setOpen(true)
    inputRef.current?.focus()
  }

  return (
    <div className="ctl-field" ref={fieldRef}>
      <label className="ctl-label" htmlFor={`${listId}-input`}>{label}</label>
      <div className="ctl-select-wrap">
        <div className="ctl-select" onClick={toggle}>
          <div className="ctl-select-chips">
            {values.map(value => {
              const color = tagColor(value)
              return (
                <span key={value} className="ctl-tag" style={{ background: color.bg, color: color.text }}>
                  <span className="ctl-tag-text">{value}</span>
                  <button
                    type="button"
                    className="ctl-tag-remove"
                    aria-label={`移除${value}`}
                    onClick={e => { e.stopPropagation(); remove(value) }}
                  >×</button>
                </span>
              )
            })}
            <input
              id={`${listId}-input`}
              ref={inputRef}
              type="text"
              className="ctl-select-input"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={open && itemCount > 0 ? `${listId}-${active}` : undefined}
              value={search}
              placeholder={values.length > 0 ? '' : `选择或输入${label}`}
              style={{ minWidth: values.length > 0 ? 40 : 120 }}
              onChange={e => { setSearch(e.target.value); setActiveIndex(0); setOpen(true) }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            type="button"
            className="ctl-select-arrow"
            data-open={open}
            tabIndex={-1}
            aria-hidden="true"
            // 不抢焦点，点击继续冒泡给外层选择框统一做切换，避免两处各自 setOpen 打架
            onMouseDown={e => e.preventDefault()}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {open && itemCount > 0 && (
          <div
            className="ctl-dropdown"
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            // 点在面板留白处不该把焦点从搜索框上挪走
            onMouseDown={e => e.preventDefault()}
          >
            <div className="ctl-dropdown-title">查找或创建选项</div>
            {candidates.map((option, index) => {
              const color = tagColor(option.name)
              const selected = values.includes(option.name)
              return (
                <div
                  key={option.name}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={selected}
                  className="ctl-option"
                  data-active={index === active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={e => { e.preventDefault(); commit(option.name) }}
                >
                  <span
                    className="ctl-option-dot"
                    style={{ background: color.bg, border: `1.5px solid ${color.text}` }}
                  />
                  <span className="ctl-option-name">{option.name}</span>
                  {selected && <span className="ctl-option-check">✓</span>}
                </div>
              )
            })}
            {canCreate && (
              <div
                id={`${listId}-${candidates.length}`}
                role="option"
                aria-selected={false}
                className="ctl-option ctl-option--create"
                data-active={candidates.length === active}
                onMouseEnter={() => setActiveIndex(candidates.length)}
                onMouseDown={e => { e.preventDefault(); commit(keyword) }}
              >
                <span className="ctl-option-plus">+</span>
                创建「{keyword}」
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
