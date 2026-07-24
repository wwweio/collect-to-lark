/**
 * 打包 dist 目录为 zip 文件（跨平台，仅使用 Node 内置模块）
 * 使用: npm run pack
 */
import { readFileSync, readdirSync, statSync, existsSync, unlinkSync, writeFileSync } from 'fs'
import { join, relative, sep } from 'path'
import { deflateRawSync } from 'zlib'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = pkg.version
const zipName = `collect-to-lark-v${version}.zip`
const distDir = 'dist'

if (!existsSync(distDir)) {
  console.error('❌ dist 目录不存在，请先运行 npm run build')
  process.exit(1)
}

// 删除旧的 zip 文件
if (existsSync(zipName)) {
  unlinkSync(zipName)
}

// 递归收集 dist 下的所有文件（返回 zip 内使用的相对路径，统一为 / 分隔符）
function collectFiles(dir, base = dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, base))
    } else {
      files.push(relative(base, full).split(sep).join('/'))
    }
  }
  return files
}

// CRC32 校验表
const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// DOS 时间格式
function dosDateTime(d) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f)
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f)
  return { time, date }
}

const files = collectFiles(distDir)
const chunks = []
const centralEntries = []
let offset = 0

for (const rel of files) {
  const nameBuf = Buffer.from(rel, 'utf-8')
  const data = readFileSync(join(distDir, rel))
  const compressed = deflateRawSync(data, { level: 9 })
  const crc = crc32(data)
  const { time, date } = dosDateTime(statSync(join(distDir, rel)).mtime)

  // 本地文件头
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0) // 签名
  local.writeUInt16LE(20, 4) // 解压所需版本
  local.writeUInt16LE(0x0800, 6) // 标志位：UTF-8 文件名
  local.writeUInt16LE(8, 8) // 压缩方式：deflate
  local.writeUInt16LE(time, 10)
  local.writeUInt16LE(date, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28) // 扩展字段长度
  chunks.push(local, nameBuf, compressed)

  // 中央目录记录
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0) // 签名
  central.writeUInt16LE(20, 4) // 压缩版本
  central.writeUInt16LE(20, 6) // 解压所需版本
  central.writeUInt16LE(0x0800, 8) // UTF-8 文件名
  central.writeUInt16LE(8, 10) // deflate
  central.writeUInt16LE(time, 12)
  central.writeUInt16LE(date, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt32LE(offset, 42) // 本地文件头偏移
  centralEntries.push(central, nameBuf)

  offset += local.length + nameBuf.length + compressed.length
}

const centralDir = Buffer.concat(centralEntries)

// 中央目录结束记录
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0) // 签名
eocd.writeUInt16LE(files.length, 8) // 本磁盘条目数
eocd.writeUInt16LE(files.length, 10) // 总条目数
eocd.writeUInt32LE(centralDir.length, 12)
eocd.writeUInt32LE(offset, 16)

writeFileSync(zipName, Buffer.concat([...chunks, centralDir, eocd]))

console.log(`\n✓ 已打包: ${zipName}（共 ${files.length} 个文件）`)
console.log('  将此文件分发给用户，解压后在 chrome://extensions/ 加载即可')
