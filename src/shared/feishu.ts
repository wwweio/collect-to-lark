import {
  FeishuTokenResponse,
  FeishuTableListResponse,
  FeishuFieldListResponse,
  FeishuCreateRecordResponse,
  FeishuUpdateFieldResponse,
  TableInfo,
  FieldMeta,
  FieldOption,
} from './types'
import { getTokenCache, setTokenCache } from './storage'

const BASE_URL = 'https://open.feishu.cn/open-apis'

/** 获取 tenant_access_token */
export async function getTenantToken(appId: string, appSecret: string): Promise<string> {
  // 先检查缓存
  const cached = await getTokenCache()
  if (cached) return cached.token

  const res = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  })

  const data: FeishuTokenResponse = await res.json()
  if (data.code !== 0) throw new Error(`获取 token 失败: ${data.msg}`)

  await setTokenCache(data.tenant_access_token, data.expire)
  return data.tenant_access_token
}

/** 查询多维表格下的所有数据表 */
export async function listTables(token: string, appToken: string): Promise<TableInfo[]> {
  const res = await fetch(`${BASE_URL}/bitable/v1/apps/${appToken}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const data: FeishuTableListResponse = await res.json()
  if (data.code !== 0) throw new Error(`查询表格列表失败: ${data.msg}`)

  return data.data.items
}

/** 获取数据表的字段元数据 */
export async function getFieldMeta(token: string, appToken: string, tableId: string): Promise<FieldMeta[]> {
  const res = await fetch(`${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const data: FeishuFieldListResponse = await res.json()
  if (data.code !== 0) throw new Error(`查询字段元数据失败: ${data.msg}`)

  return data.data.items
}

/** 从字段元数据中提取选项列表 */
export function extractOptions(fields: FieldMeta[], fieldName: string): FieldOption[] {
  const field = fields.find(f => f.field_name === fieldName)
  return field?.property?.options || []
}

/** 更新字段选项（追加新选项），返回更新后的完整选项列表 */
export async function appendFieldOptions(
  token: string,
  appToken: string,
  tableId: string,
  fieldId: string,
  fieldName: string,
  fieldType: number,
  existingOptions: FieldOption[],
  newNames: string[]
): Promise<FieldOption[]> {
  if (newNames.length === 0) return existingOptions
  const allOptions = [
    ...existingOptions.map(o => ({ name: o.name, id: o.id })),
    ...newNames.map(name => ({ name })),
  ]
  const res = await fetch(`${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/fields/${fieldId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      field_name: fieldName,
      type: fieldType,
      property: { options: allOptions },
    }),
  })
  const data: FeishuUpdateFieldResponse = await res.json()
  if (data.code !== 0) throw new Error(`更新字段选项失败: ${data.msg}`)

  // 优先采用响应里带 id 的最新选项，便于回写缓存后下次直接命中
  return data.data?.field?.property?.options || allOptions
}

/** 创建一条多维表格记录 */
export async function createRecord(
  token: string,
  appToken: string,
  tableId: string,
  fields: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${BASE_URL}/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })

  const data: FeishuCreateRecordResponse = await res.json()
  if (data.code !== 0) throw new Error(`创建记录失败: ${data.msg}`)

  return data.data.record.record_id
}

/** 验证凭证和表格连接是否正常 */
export async function testConnection(
  appId: string,
  appSecret: string,
  appToken: string,
  tableId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await getTenantToken(appId, appSecret)
    const fields = await getFieldMeta(token, appToken, tableId)
    if (fields.length === 0) {
      return { ok: false, message: '表格中没有字段，请先在飞书中创建字段' }
    }
    return { ok: true, message: `连接成功，共 ${fields.length} 个字段` }
  } catch (e) {
    return { ok: false, message: `连接失败: ${(e as Error).message}` }
  }
}
