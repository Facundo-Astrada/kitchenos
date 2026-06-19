import fs from 'fs'
import path from 'path'

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f)
    if (['node_modules', '.next', '.git', 'scripts'].includes(f)) continue
    if (fs.statSync(full).isDirectory()) walk(full, acc)
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) acc.push(full)
  }
  return acc
}

const files = walk('.')

const replacements = [
  // Header top padding
  ["padding: '46px 16px 14px'", "padding: 'var(--header-top) 16px 14px'"],
  ["padding: '46px 16px 12px'", "padding: 'var(--header-top) 16px 12px'"],
  ["padding: '46px 16px 0'",    "padding: 'var(--header-top) 16px 0'"],
  ["padding: '46px 16px'",      "padding: 'var(--header-top) 16px'"],
  // perfil.tsx env fallback
  ["paddingTop: 'env(safe-area-inset-top, 46px)'", "paddingTop: 'max(env(safe-area-inset-top, 0px), var(--header-top))'"],

  // FABs bottom 110
  [', bottom: 110 }',  ", bottom: 'var(--fab-bottom)' }"],
  [', bottom: 110,',   ", bottom: 'var(--fab-bottom)',"],
  ['bottom: 110 }',    "bottom: 'var(--fab-bottom)' }"],
  ['bottom: 110,',     "bottom: 'var(--fab-bottom)',"],

  // Toasts and snackbars
  ['bottom: 100,',  "bottom: 'var(--toast-bottom)',"],
  ['bottom: 100 }', "bottom: 'var(--toast-bottom)' }"],
  ['bottom: 90,',   "bottom: 'var(--toast-bottom)',"],
  ['bottom: 90 }',  "bottom: 'var(--toast-bottom)' }"],
  ['bottom: 82,',   "bottom: 'var(--toast-bottom)',"],
  ['bottom: 82 }',  "bottom: 'var(--toast-bottom)' }"],
  ['bottom: 80,',   "bottom: 'var(--toast-bottom)',"],
  ['bottom: 80 }',  "bottom: 'var(--toast-bottom)' }"],
]

let totalFiles = 0
let totalChanges = 0

for (const file of files) {
  if (file.includes('verify-desktop')) continue

  let content = fs.readFileSync(file, 'utf8')
  let fileChanges = 0

  for (const [from, to] of replacements) {
    while (content.includes(from)) {
      content = content.replace(from, to)
      fileChanges++
    }
  }

  if (fileChanges > 0) {
    fs.writeFileSync(file, content, 'utf8')
    const rel = file.replace(process.cwd() + path.sep, '')
    console.log(`  [${fileChanges}] ${rel}`)
    totalFiles++
    totalChanges += fileChanges
  }
}

console.log(`\nDone: ${totalChanges} replacements in ${totalFiles} files`)
