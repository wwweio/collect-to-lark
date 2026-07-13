#!/usr/bin/env node
/**
 * Post-build: Inline chunk imports into content.js and background.js.
 * Parses BOTH chunk exports and consumer imports for correct mapping.
 *
 * Chunk export:   export { internalName as exportAlias }
 * Consumer import: import { exportAlias as localName } from "..."
 * Result: localName → internalName (usually identical, no rename needed)
 *
 * Run: node postbuild.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = resolve(__dirname, 'dist')
const targets = ['content.js', 'background.js']

for (const target of targets) {
  const filePath = resolve(distDir, target)
  if (!existsSync(filePath)) {
    console.warn(`  ⚠ ${target}: not found, skipping`)
    continue
  }

  let code = readFileSync(filePath, 'utf-8')
  const allChunks = []
  let iterations = 0

  while (iterations < 20) {
    const importMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*"(\.\/assets\/[^"]+\.js)"/)
    if (!importMatch) break
    iterations++

    const [fullMatch, importSpecs, chunkPath] = importMatch
    const absPath = resolve(distDir, chunkPath)

    if (!existsSync(absPath)) {
      console.warn(`  ⚠ Chunk not found: ${chunkPath}`)
      break
    }

    // Read chunk and parse its export statement
    let chunkCode = readFileSync(absPath, 'utf-8')
    const exportMatch = chunkCode.match(/export\s*\{([^}]+)\}\s*;?\s*$/m)
    const chunkExportMap = new Map() // exportAlias → internalName

    if (exportMatch) {
      exportMatch[1].split(',').forEach(exp => {
        const parts = exp.trim().split(/\s+as\s+/)
        if (parts.length === 2) {
          chunkExportMap.set(parts[1].trim(), parts[0].trim())
        }
      })
    }

    // Parse consumer import: { exportAlias as localName }
    const importMap = new Map() // localName → chunkInternalName
    importSpecs.split(',').forEach(imp => {
      const parts = imp.trim().split(/\s+as\s+/)
      if (parts.length === 2) {
        const exportAlias = parts[0].trim()
        const localName = parts[1].trim()
        const chunkInternal = chunkExportMap.get(exportAlias) || exportAlias
        if (localName !== chunkInternal) {
          importMap.set(localName, chunkInternal)
        }
      }
    })

    // Apply renames to consumer code BEFORE inlining chunk
    importMap.forEach((chunkInternal, localName) => {
      code = code.replace(new RegExp(`\\b${localName}\\b`, 'g'), chunkInternal)
    })

    // Remove import statement from consumer
    code = code.replace(fullMatch + ';', '')
    code = code.replace(fullMatch, '')

    // Track chunk for prepending (remove its export statement)
    if (!allChunks.find(c => c.path === chunkPath)) {
      chunkCode = chunkCode.replace(/\n?export\s*\{[^}]+\}\s*;?\s*$/m, '')
      allChunks.push({ path: chunkPath, code: chunkCode })
    }
  }

  // Prepend all chunk code
  if (allChunks.length > 0) {
    const chunksHeader = allChunks.map(c => `// [inlined] ${c.path}\n${c.code}`).join('\n')
    code = chunksHeader + '\n' + code
  }

  // Remove CSS side-effect imports
  code = code.replace(/import\s*"\.\/assets\/[^"]+\.css"\s*;?\s*\n?/g, '')

  writeFileSync(filePath, code)
  console.log(`  ✓ ${target}: inlined ${allChunks.length} chunks → self-contained`)
}

console.log('\nDone! Extension ready in dist/')
