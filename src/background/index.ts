import { getConfig, getFieldsCache, setFieldsCache } from '../shared/storage'
import { getTenantToken, listTables, getFieldMeta, createRecord, testConnection, appendFieldOptions } from '../shared/feishu'
import { CollectFormData, FieldMeta, FieldOption } from '../shared/types'

// 右键菜单 ID
const MENU_ID = 'collect-to-lark'

// 性能日志开关：排查保存耗时时置为 true，只输出耗时与缓存命中情况，不包含配置或凭证
const PERF_LOG = false

// 字段快照超过该时长，才在追加选项前重新校对（打开弹窗时刚刷新过的快照可直接用）
const FIELDS_RECHECK_MS = 60 * 1000

/** 分段耗时打点 */
function createPerfTracker(label: string) {
  const start = Date.now()
  let mark = start
  if (PERF_LOG) console.log(`[PERF] ===== ${label} | SW 启动至今 ${Math.round(performance.now())}ms =====`)
  return {
    lap(step: string, extra = '') {
      if (!PERF_LOG) return
      const now = Date.now()
      console.log(`[PERF] ${step}: ${now - mark}ms${extra ? ' | ' + extra : ''}`)
      mark = now
    },
    end() {
      if (!PERF_LOG) return
      console.log(`[PERF] ===== ${label}总耗时 ${Date.now() - start}ms =====`)
    },
  }
}

// 注册右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '收藏到飞书',
    contexts: ['all'],
  })
})

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_ID) return

  // 向 content script 发送消息
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  chrome.tabs.sendMessage(tab.id, {
    type: 'OPEN_COLLECT_DIALOG',
    url: info.pageUrl,
    title: tab.title,
  })
})

// 处理来自 content script 的消息
chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }, sender, sendResponse) => {
  if (message.type === 'FEISHU_API_CALL') {
    const { method, params } = message.payload as { method: string; params: unknown[] }

    // 异步处理并返回结果
    handleApiCall(method, params)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: (error as Error).message }))

    return true // 表示会异步响应
  }

  // 后台保存：飞书写接口单次耗时数秒，立即确认收单，完成后回报所在标签页
  if (message.type === 'CREATE_RECORD_ASYNC') {
    const { formData } = message.payload as { formData: CollectFormData }
    const tabId = sender.tab?.id
    chrome.action.setBadgeText({ text: '' })

    handleApiCall('createRecord', [formData])
      .then(() => notifyResult(tabId, true))
      .catch((error) => notifyResult(tabId, false, (error as Error).message))

    sendResponse({ accepted: true })
  }

  // 用户在下拉里现场创建选项：趁着用户继续填表的时间后台预建，保存时就不用再等写请求
  if (message.type === 'PRECREATE_OPTION') {
    const { fieldName, name } = message.payload as { fieldName: string; name: string }
    void precreateOption(fieldName, name)
    sendResponse({ accepted: true })
  }
})

/** 预建单个字段选项，失败不打扰用户（保存时会兜底再追加一次） */
async function precreateOption(fieldName: string, name: string): Promise<void> {
  try {
    const config = await getConfig()
    if (!config?.appToken || !config?.tableId) return
    const token = await getTenantToken(config.appId, config.appSecret)
    const values: OptionValues = {
      category: fieldName === '分类' ? name : '',
      tags: fieldName === '标签' ? [name] : [],
    }
    await enqueueOptionTask(() => ensureFieldOptions(token, config.appToken, config.tableId, values))
  } catch (e) {
    console.error('[Collect to Lark] 预建选项失败:', (e as Error).message)
  }
}

/** 把保存结果回报给发起的标签页，并用角标兜底（标签页可能已关闭或跳转） */
function notifyResult(tabId: number | undefined, ok: boolean, error?: string): void {
  chrome.action.setBadgeText({ text: ok ? '✓' : '!' })
  chrome.action.setBadgeBackgroundColor({ color: ok ? '#16A34A' : '#DC2626' })
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), ok ? 3000 : 10000)

  if (!ok) console.error('[Collect to Lark] 保存失败:', error)
  if (tabId === undefined) return
  chrome.tabs.sendMessage(tabId, { type: 'COLLECT_RESULT', ok, error }).catch(() => {
    // 标签页已关闭或无 content script，仅靠角标提示
  })
}

async function handleApiCall(method: string, params: unknown[]): Promise<unknown> {
  switch (method) {
    case 'testConnection': {
      const p = params as [string, string, string, string]
      return testConnection(p[0], p[1], p[2], p[3])
    }
    case 'listTables': {
      const config = await getConfig()
      if (!config) throw new Error('请先配置飞书应用信息')
      const token = await getTenantToken(config.appId, config.appSecret)
      return listTables(token, params[0] as string)
    }
    case 'getFieldMeta': {
      const config = await getConfig()
      if (!config) throw new Error('请先配置飞书应用信息')
      const appToken = params[0] as string
      const tableId = params[1] as string

      // 命中缓存时立即返回（弹窗秒开），同时后台静默刷新保证新鲜度
      const cached = await getFieldsCache(appToken, tableId)
      if (cached) {
        void refreshFieldsCache(config.appId, config.appSecret, appToken, tableId)
        return cached.fields
      }

      const token = await getTenantToken(config.appId, config.appSecret)
      const fields = await getFieldMeta(token, appToken, tableId)
      await setFieldsCache(appToken, tableId, fields)
      return fields
    }
    case 'createRecord': {
      const perf = createPerfTracker('保存收藏')
      const config = await getConfig()
      if (!config) throw new Error('请先配置飞书应用信息')
      const token = await getTenantToken(config.appId, config.appSecret)
      const formData = params[0] as CollectFormData
      perf.lap('1.配置+token')

      // 与预建任务共用串行队列：若用户刚点过「创建选项」，这里会等它完成后再校验，避免选项未建好就提交
      await enqueueOptionTask(() => ensureFieldOptions(token, config.appToken, config.tableId, formData))
      perf.lap('2.确保分类/标签选项已存在')

      const fields = buildRecordFields(formData)
      const recordId = await createRecord(token, config.appToken, config.tableId, fields)
      perf.lap('3.创建记录(POST)')
      perf.end()
      return recordId
    }
    default:
      throw new Error(`未知方法: ${method}`)
  }
}

/** 需要校验选项的表单值 */
interface OptionValues {
  category: string
  tags: string[]
}

// 选项追加串行执行：避免并发任务对字段缓存“读-改-写”互相覆盖，也让保存能等到预建完成
let optionChain: Promise<unknown> = Promise.resolve()

function enqueueOptionTask<T>(task: () => Promise<T>): Promise<T> {
  // 前一个任务失败也要接着执行，因此 onFulfilled / onRejected 传同一个 task
  const next = optionChain.then(task, task)
  optionChain = next.catch(() => {})
  return next
}

/** 确保「分类」「标签」的值都已是飞书字段的合法选项，缺失则追加 */
async function ensureFieldOptions(token: string, appToken: string, tableId: string, values: OptionValues): Promise<void> {
  // 字段元数据优先取缓存，避免多一次请求
  const cached = await getFieldsCache(appToken, tableId)
  let allFields = cached?.fields
  let fieldsFetchedAt = cached?.fetchedAt ?? 0
  if (!allFields) {
    allFields = await getFieldMeta(token, appToken, tableId)
    await setFieldsCache(appToken, tableId, allFields)
    fieldsFetchedAt = Date.now()
  }

  let pending = collectPendingOptions(allFields, values)
  if (pending.length === 0) return

  // 快照不够新时先拉一次最新字段，避免用旧快照覆盖掉别人新增的选项
  if (Date.now() - fieldsFetchedAt > FIELDS_RECHECK_MS) {
    allFields = await getFieldMeta(token, appToken, tableId)
    await setFieldsCache(appToken, tableId, allFields)
    pending = collectPendingOptions(allFields, values)
    if (pending.length === 0) return
  }

  // 「分类」「标签」并行追加，不再串行等两次写请求
  const updated = await Promise.all(
    pending.map(async ({ field, newNames }) => ({
      fieldId: field.field_id,
      options: await appendFieldOptions(
        token, appToken, tableId,
        field.field_id, field.field_name, field.type,
        field.property?.options || [], newNames
      ),
    }))
  )

  // 回写缓存，避免同一新选项重复触发写请求
  const merged = allFields.map(f => {
    const hit = updated.find(u => u.fieldId === f.field_id)
    return hit ? { ...f, property: { ...f.property, options: hit.options } } : f
  })
  await setFieldsCache(appToken, tableId, merged)
}

/** 待追加的字段选项 */
interface PendingOptions {
  field: FieldMeta
  newNames: string[]
}

/** 找出「分类」「标签」中飞书尚不存在的选项 */
function collectPendingOptions(fields: FieldMeta[], values: OptionValues): PendingOptions[] {
  const pending: PendingOptions[] = []

  const pick = (fieldName: string, names: string[]) => {
    if (names.length === 0) return
    const field = fields.find(f => f.field_name === fieldName)
    if (!field?.property?.options) return
    const existing = field.property.options.map((o: FieldOption) => o.name)
    const newNames = names.filter(v => !existing.includes(v))
    if (newNames.length > 0) pending.push({ field, newNames })
  }

  pick('分类', values.category ? [values.category] : [])
  pick('标签', values.tags)
  return pending
}

/** 后台静默刷新字段缓存，不阻塞调用方 */
async function refreshFieldsCache(appId: string, appSecret: string, appToken: string, tableId: string): Promise<void> {
  try {
    const token = await getTenantToken(appId, appSecret)
    const fields = await getFieldMeta(token, appToken, tableId)
    await setFieldsCache(appToken, tableId, fields)
  } catch (e) {
    console.error('[Collect to Lark] 刷新字段缓存失败:', (e as Error).message)
  }
}

/** 构建飞书 API 的 fields 参数 */
function buildRecordFields(formData: CollectFormData): Record<string, unknown> {
  const now = Date.now() // 毫秒时间戳

  const fields: Record<string, unknown> = {
    '内容标题': formData.title,
    '网页说明': formData.description,
    '网页地址': { link: formData.url, text: formData.title },
    '收集时间': now,
  }

  // 创建人 (文本字段)
  if (formData.creator) {
    fields['创建人'] = formData.creator
  }

  // 分类 (多选) - 字符串数组格式
  if (formData.category) {
    fields['分类'] = [formData.category]
  }

  // 标签 (多选) - 字符串数组格式
  if (formData.tags.length > 0) {
    fields['标签'] = formData.tags
  }

  // 备注
  if (formData.note) {
    fields['备注'] = formData.note
  }

  return fields
}
