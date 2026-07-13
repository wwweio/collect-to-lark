/**
 * 打包 dist 目录为 zip 文件
 * 使用: npm run pack
 */
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = pkg.version
const zipName = `collect-to-lark-v${version}.zip`

if (!existsSync('./dist')) {
  console.error('❌ dist 目录不存在，请先运行 npm run build')
  process.exit(1)
}

// 删除旧的 zip 文件
if (existsSync(zipName)) {
  execSync(`rm ${zipName}`)
}

// 打包
execSync(`cd dist && zip -r ../${zipName} . -x "*.DS_Store"`, { stdio: 'inherit' })

console.log(`\n✓ 已打包: ${zipName}`)
console.log('  将此文件分发给用户，解压后在 chrome://extensions/ 加载即可')
