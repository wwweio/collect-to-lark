// 飞书多维表格相关类型

export interface FeishuConfig {
  appId: string
  appSecret: string
  feishuUrl: string     // 用户粘贴的完整飞书链接
  appToken: string      // 从 URL 解析出的 app_token
  tableId: string       // 选中的表格 ID
  tableName: string     // 选中的表格名
  creatorName: string   // 创建人昵称
}

export interface CollectFormData {
  title: string         // 内容标题
  description: string   // 网页说明
  url: string           // 网页地址
  category: string      // 分类
  tags: string[]        // 标签
  note: string          // 备注
  creator: string       // 创建人
  collectedAt: number   // 收集时间（弹窗打开时固化，避免与后台异步写入的时刻不一致）
}

export interface TableInfo {
  table_id: string
  name: string
}

export interface FieldOption {
  name: string
  id?: string
}

export interface FieldMeta {
  field_id: string
  field_name: string
  type: number
  property?: {
    options?: FieldOption[]
  }
}

// 飞书 API 响应类型
export interface FeishuTokenResponse {
  code: number
  msg: string
  tenant_access_token: string
  expire: number
}

export interface FeishuTableListResponse {
  code: number
  msg: string
  data: {
    items: TableInfo[]
  }
}

export interface FeishuFieldListResponse {
  code: number
  msg: string
  data: {
    items: FieldMeta[]
  }
}

export interface FeishuCreateRecordResponse {
  code: number
  msg: string
  data: {
    record: {
      record_id: string
    }
  }
}

export interface FeishuUpdateFieldResponse {
  code: number
  msg: string
  data?: {
    field?: FieldMeta
  }
}
