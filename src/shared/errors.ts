/** 把飞书返回的原始报错转成用户能照着做的提示 */
export function friendlyError(message?: string): string {
  const raw = message?.trim()
  if (!raw) return '未知错误'
  if (/Forbidden|permission|403/i.test(raw)) {
    return '权限不足：打开飞书多维表格 → 右上角「分享」→ 添加应用为协作者 → 「可编辑」'
  }
  if (/Failed to fetch|NetworkError|network/i.test(raw)) {
    return '网络请求失败，请检查网络后重试'
  }
  return raw
}
