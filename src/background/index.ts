import { getConfig, getFieldsCache, setFieldsCache } from '../shared/storage'
import { getTenantToken, listTables, getFieldMeta, createRecord, testConnection, appendFieldOptions } from '../shared/feishu'
import { CollectFormData } from '../shared/types'

// 右键菜单 ID
const MENU_ID = 'collect-to-lark'

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
chrome.runtime.onMessage.addListener((message: { type: string; payload?: unknown }, _sender, sendResponse) => {
  if (message.type === 'FEISHU_API_CALL') {
    const { method, params } = message.payload as { method: string; params: unknown[] }

    // 异步处理并返回结果
    handleApiCall(method, params)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) => sendResponse({ success: false, error: (error as Error).message }))

    return true // 表示会异步响应
  }
})

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
      const token = await getTenantToken(config.appId, config.appSecret)
      const fields = await getFieldMeta(token, params[0] as string, params[1] as string)
      return fields
    }
    case 'createRecord': {
      const config = await getConfig()
      if (!config) throw new Error('请先配置飞书应用信息')
      const token = await getTenantToken(config.appId, config.appSecret)
      const formData = params[0] as CollectFormData

      // 使用缓存的字段元数据，避免每次保存都请求
      let allFields = await getFieldsCache()
      if (!allFields) {
        allFields = await getFieldMeta(token, config.appToken, config.tableId)
        await setFieldsCache(allFields)
      }

      if (formData.category) {
        const catField = allFields.find(f => f.field_name === '分类')
        if (catField?.property?.options) {
          const existing = catField.property.options.map(o => o.name)
          if (!existing.includes(formData.category)) {
            await appendFieldOptions(token, config.appToken, config.tableId, catField.field_id, catField.field_name, catField.type, catField.property.options, [formData.category])
          }
        }
      }

      if (formData.tags.length > 0) {
        const tagField = allFields.find(f => f.field_name === '标签')
        if (tagField?.property?.options) {
          const existing = tagField.property.options.map(o => o.name)
          const newTags = formData.tags.filter(t => !existing.includes(t))
          if (newTags.length > 0) {
            await appendFieldOptions(token, config.appToken, config.tableId, tagField.field_id, tagField.field_name, tagField.type, tagField.property.options, newTags)
          }
        }
      }

      const fields = buildRecordFields(formData)
      const recordId = await createRecord(token, config.appToken, config.tableId, fields)
      return recordId
    }
    default:
      throw new Error(`未知方法: ${method}`)
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
    '创建时间': now,
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
