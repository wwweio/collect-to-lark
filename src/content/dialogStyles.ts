/**
 * 收藏弹窗的全部样式。
 *
 * 弹窗渲染在 Shadow DOM 里，页面的 global.css / Tailwind 都不会生效，
 * 因此样式必须随内容一起注入。这里用 CSS 自定义属性收口设计 token，
 * 组件侧只写类名，避免颜色、圆角在多处各写一遍。
 */
export const DIALOG_CSS = `
:host, .ctl-root {
  /* 中性色 */
  --ctl-surface: #FFFFFF;
  --ctl-text: #1A1A1A;
  --ctl-text-sub: #44403C;
  --ctl-text-muted: #78716C;
  --ctl-text-faint: #A8A29E;
  --ctl-border: #E8E6E3;
  --ctl-border-soft: #F0EDE9;
  --ctl-fill: #F5F3F0;
  --ctl-fill-hover: #EDEAE6;

  /* 强调色与语义色 */
  --ctl-accent: #0D7377;
  --ctl-accent-hover: #0A6265;
  --ctl-accent-ring: rgba(13, 115, 119, 0.1);
  --ctl-danger: #DC2626;
  --ctl-danger-bg: #FEF2F2;
  --ctl-danger-border: #FECACA;
  --ctl-success: #16A34A;

  /* 形状与节奏（动画一律 ≤ 200ms） */
  --ctl-radius: 8px;
  --ctl-radius-lg: 12px;
  --ctl-radius-pill: 14px;
  --ctl-dur: 180ms;
  --ctl-ease: ease;
  --ctl-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  --ctl-z: 2147483647;
}

.ctl-root, .ctl-root *, .ctl-root *::before, .ctl-root *::after,
.ctl-toast-stack, .ctl-toast-stack * {
  margin: 0; padding: 0; box-sizing: border-box;
}

/* ============ 遮罩与弹窗 ============ */
.ctl-overlay {
  position: fixed; inset: 0;
  background: rgba(26, 26, 26, 0.3);
  display: flex; align-items: center; justify-content: center;
  z-index: var(--ctl-z);
  font-family: var(--ctl-font);
  animation: ctl-fade-in var(--ctl-dur) var(--ctl-ease);
}
.ctl-overlay[data-closing='true'] { animation: ctl-fade-out var(--ctl-dur) var(--ctl-ease) forwards; }

.ctl-dialog {
  background: var(--ctl-surface);
  border-radius: var(--ctl-radius-lg);
  width: 480px; max-width: calc(100vw - 32px); max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.08);
  animation: ctl-scale-in var(--ctl-dur) var(--ctl-ease);
}
.ctl-overlay[data-closing='true'] .ctl-dialog {
  animation: ctl-scale-out var(--ctl-dur) var(--ctl-ease) forwards;
}

.ctl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--ctl-border-soft);
  flex-shrink: 0;
}
.ctl-title { font-size: 16px; font-weight: 600; color: var(--ctl-text); }

.ctl-close {
  background: none; border: none; padding: 4px;
  border-radius: 6px; cursor: pointer;
  display: flex; align-items: center; color: var(--ctl-text-muted);
  transition: background var(--ctl-dur) var(--ctl-ease);
}
.ctl-close:hover { background: var(--ctl-fill); }

.ctl-form {
  display: flex; flex-direction: column;
  flex: 1; min-height: 0;
}
/* 只有字段区滚动，操作栏始终留在弹窗底部，矮屏也不用滚到底才能点保存 */
.ctl-form-body {
  padding: 16px 24px 4px;
  display: flex; flex-direction: column; gap: 12px;
  flex: 1; min-height: 0; overflow-y: auto;
}
.ctl-form-body::-webkit-scrollbar { width: 8px; }
.ctl-form-body::-webkit-scrollbar-thumb {
  background: var(--ctl-border); border-radius: 4px;
}
.ctl-form-body::-webkit-scrollbar-track { background: transparent; }

/* ============ 表单字段 ============ */
.ctl-field { display: flex; flex-direction: column; gap: 4px; }
.ctl-label {
  font-size: 13px; font-weight: 500;
  color: var(--ctl-text-sub); margin-bottom: 2px;
}
.ctl-required { color: var(--ctl-danger); }
.ctl-row { display: flex; gap: 12px; }
.ctl-row > * { flex: 1; min-width: 0; }

.ctl-input, .ctl-textarea {
  width: 100%; padding: 8px 12px;
  border: 1px solid var(--ctl-border); border-radius: var(--ctl-radius);
  background: var(--ctl-surface); color: var(--ctl-text);
  font-size: 14px; font-family: inherit; outline: none;
  transition: border-color var(--ctl-dur) var(--ctl-ease), box-shadow var(--ctl-dur) var(--ctl-ease);
}
.ctl-textarea { resize: vertical; min-height: 60px; }
.ctl-input:focus, .ctl-textarea:focus {
  border-color: var(--ctl-accent);
  box-shadow: 0 0 0 3px var(--ctl-accent-ring);
}
.ctl-input[readonly] { background: var(--ctl-fill); cursor: default; }
.ctl-input[readonly]:focus { border-color: var(--ctl-border); box-shadow: none; }
.ctl-input::placeholder, .ctl-textarea::placeholder { color: var(--ctl-text-faint); }

/* ============ 下拉选择器 ============ */
.ctl-select-wrap { position: relative; }
.ctl-select {
  display: flex; align-items: center; min-height: 38px;
  border: 1px solid var(--ctl-border); border-radius: var(--ctl-radius);
  background: var(--ctl-surface); cursor: text;
  transition: border-color var(--ctl-dur) var(--ctl-ease), box-shadow var(--ctl-dur) var(--ctl-ease);
}
.ctl-select:focus-within {
  border-color: var(--ctl-accent);
  box-shadow: 0 0 0 3px var(--ctl-accent-ring);
}
.ctl-select-chips {
  flex: 1; min-width: 0;
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
  padding: 6px 10px; min-height: 34px;
}
.ctl-select-input {
  flex: 1; min-width: 60px; padding: 0;
  border: none; outline: none; background: transparent;
  font-size: 14px; font-family: inherit; color: var(--ctl-text);
  line-height: 22px;
}
.ctl-select-input::placeholder { color: var(--ctl-text-faint); }
.ctl-select-arrow {
  display: flex; align-items: center; align-self: stretch; padding: 0 10px;
  background: none; border: none; cursor: pointer;
  color: var(--ctl-text-muted); flex-shrink: 0;
  transition: transform var(--ctl-dur) var(--ctl-ease);
}
.ctl-select-arrow[data-open='true'] { transform: rotate(180deg); }

/* ============ 标签 ============ */
.ctl-tag {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 12px; font-weight: 500; line-height: 18px;
  padding: 2px 8px; border-radius: var(--ctl-radius-pill);
  white-space: nowrap; max-width: 100%;
}
.ctl-tag-text { overflow: hidden; text-overflow: ellipsis; }
.ctl-tag-remove {
  background: none; border: none; cursor: pointer; color: inherit;
  font-size: 14px; line-height: 1; padding: 0 1px;
  opacity: 0.7; flex-shrink: 0;
  transition: opacity var(--ctl-dur) var(--ctl-ease);
}
.ctl-tag-remove:hover { opacity: 1; }

/* ============ 下拉面板 ============ */
.ctl-dropdown {
  position: absolute; top: 100%; left: 0; right: 0;
  margin-top: 4px; padding-bottom: 4px;
  background: var(--ctl-surface);
  border: 1px solid var(--ctl-border); border-radius: var(--ctl-radius);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  max-height: 220px; overflow-y: auto; z-index: 10;
  animation: ctl-slide-up var(--ctl-dur) var(--ctl-ease);
}
.ctl-dropdown-title {
  padding: 8px 12px 4px;
  font-size: 11px; font-weight: 500; letter-spacing: 0.3px;
  color: var(--ctl-text-faint);
}
.ctl-option {
  padding: 8px 12px; font-size: 13px; color: var(--ctl-text);
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  transition: background var(--ctl-dur) var(--ctl-ease);
}
.ctl-option[data-active='true'] { background: var(--ctl-fill); }
.ctl-option-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ctl-option-dot {
  width: 10px; height: 10px; border-radius: 50%;
  flex-shrink: 0; display: inline-block;
}
.ctl-option-check { color: var(--ctl-accent); font-size: 13px; font-weight: 600; }
.ctl-option--create { color: var(--ctl-accent); font-weight: 500; }
.ctl-option--create .ctl-option-plus { font-size: 16px; line-height: 1; }

/* ============ 提示与按钮 ============ */
.ctl-error {
  background: var(--ctl-danger-bg);
  border: 1px solid var(--ctl-danger-border);
  border-radius: var(--ctl-radius);
  padding: 8px 12px; font-size: 13px; color: var(--ctl-danger);
}

.ctl-actions {
  flex-shrink: 0;
  padding: 12px 24px 20px;
  display: flex; flex-direction: column; gap: 10px;
  border-top: 1px solid var(--ctl-border-soft);
  border-radius: 0 0 var(--ctl-radius-lg) var(--ctl-radius-lg);
  background: var(--ctl-surface);
}
.ctl-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
}
.ctl-btn {
  border-radius: var(--ctl-radius); padding: 8px 18px;
  font-size: 14px; font-weight: 500; font-family: inherit; cursor: pointer;
  transition: background var(--ctl-dur) var(--ctl-ease), opacity var(--ctl-dur) var(--ctl-ease);
}
.ctl-btn:focus-visible { outline: 2px solid var(--ctl-accent); outline-offset: 2px; }
.ctl-btn--ghost {
  background: var(--ctl-fill); color: var(--ctl-text);
  border: 1px solid var(--ctl-border);
}
.ctl-btn--ghost:hover { background: var(--ctl-fill-hover); }
.ctl-btn--primary {
  background: var(--ctl-accent); color: #FFFFFF; border: none;
  padding: 8px 20px; min-width: 104px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.ctl-btn--primary:hover:not(:disabled) { background: var(--ctl-accent-hover); }
.ctl-btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }

.ctl-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #FFFFFF; border-radius: 50%;
  animation: ctl-spin 700ms linear infinite;
}

/* ============ 结果轻提示 ============ */
.ctl-toast-stack {
  position: fixed; top: 20px; right: 20px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
  z-index: var(--ctl-z); pointer-events: none;
  font-family: var(--ctl-font);
}
.ctl-toast {
  pointer-events: auto; cursor: pointer;
  max-width: 320px; padding: 12px 16px;
  background: var(--ctl-surface); border-radius: 10px;
  border-left: 4px solid var(--ctl-text-muted);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  font-size: 13px; color: var(--ctl-text); line-height: 1.5;
  animation: ctl-slide-in-right var(--ctl-dur) var(--ctl-ease);
  transition: opacity var(--ctl-dur) var(--ctl-ease), transform var(--ctl-dur) var(--ctl-ease);
}
.ctl-toast--ok { border-left-color: var(--ctl-success); }
.ctl-toast--error { border-left-color: var(--ctl-danger); }
.ctl-toast[data-leaving='true'] { opacity: 0; transform: translateX(12px); }
.ctl-toast-title { font-weight: 600; margin-bottom: 2px; }
.ctl-toast-detail { font-size: 12px; color: var(--ctl-text-muted); }

/* ============ 动画 ============ */
@keyframes ctl-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ctl-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes ctl-scale-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes ctl-scale-out { from { transform: scale(1); opacity: 1; } to { transform: scale(0.97); opacity: 0; } }
@keyframes ctl-slide-up { from { transform: translateY(-4px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes ctl-slide-in-right { from { transform: translateX(12px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes ctl-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .ctl-root *, .ctl-toast-stack * {
    animation-duration: 1ms !important;
    transition-duration: 1ms !important;
  }
}
`
