#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const ghPageDir = path.join(root, 'gh_page')
const plugin = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'))
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'build/themes.json'), 'utf8'))

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

fs.rmSync(ghPageDir, {recursive: true, force: true})
fs.mkdirSync(ghPageDir, {recursive: true})

if (fs.existsSync(path.join(root, 'build'))) {
  fs.cpSync(path.join(root, 'build'), path.join(ghPageDir, 'files', 'build'), {recursive: true})
}

if (fs.existsSync(path.join(root, 'dist'))) {
  fs.cpSync(path.join(root, 'dist'), path.join(ghPageDir, 'files', 'release'), {recursive: true})
}

if (fs.existsSync(path.join(root, 'theme', 'preview.png'))) {
  fs.copyFileSync(path.join(root, 'theme', 'preview.png'), path.join(ghPageDir, 'preview.png'))
}

const installUrl = `files/release/${plugin.id}.user.js`
const themeRows = catalog.themes.map(theme => `
  <tr>
    <td>${escapeHtml(theme.name)}</td>
    <td>${escapeHtml(theme.id)}</td>
    <td>${escapeHtml((theme.options || []).map(option => option.name).join(', ') || '—')}</td>
  </tr>
`).join('\n')

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(plugin.displayName)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 900px; line-height: 1.5; }
    code { background: color-mix(in srgb, CanvasText 10%, Canvas); padding: 0.15rem 0.3rem; border-radius: 0.25rem; }
    .button { display: inline-block; padding: 0.75rem 1rem; border: 1px solid currentColor; border-radius: 0.5rem; text-decoration: none; font-weight: 600; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid color-mix(in srgb, CanvasText 25%, Canvas); padding: 0.5rem; text-align: left; }
  </style>
</head>
<body>
  <h1>${escapeHtml(plugin.displayName)}</h1>
  <p>${escapeHtml(plugin.description)}</p>

  <p><a class="button" href="${installUrl}">Install userscript</a></p>

  <h2>Compiled themes</h2>
  <table>
    <thead>
      <tr>
        <th>Theme</th>
        <th>Folder</th>
        <th>Options</th>
      </tr>
    </thead>
    <tbody>
      ${themeRows}
    </tbody>
  </table>

  <h2>Standalone</h2>
  <p>This userscript has no runtime dependency on <code>iitcpluginkit</code>, <code>iitc-kuku-helper-handlebars</code>, or <code>iitc-theme-chooser</code>.</p>
</body>
</html>
`

fs.writeFileSync(path.join(ghPageDir, 'index.html'), html, 'utf8')
console.log('Wrote gh_page/index.html')
