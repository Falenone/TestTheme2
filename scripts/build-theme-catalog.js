#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const themesDir = path.join(root, 'themes')
const buildDir = path.join(root, 'build')
const catalogPath = path.join(buildDir, 'themes.json')

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function readCss(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') + '\n' : ''
}

function humanize(slug) {
  return slug
    .split(/[-_]+/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function readOptions(optionsDir) {
  if (!fs.existsSync(optionsDir)) return []

  return fs.readdirSync(optionsDir, {withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => name.endsWith('.css'))
    .sort()
    .map(fileName => {
      const id = fileName.replace(/\.css$/i, '')
      return {
        id,
        name: humanize(id),
        file: `options/${fileName}`,
        css: readCss(path.join(optionsDir, fileName))
      }
    })
}

if (!fs.existsSync(themesDir)) {
  throw new Error('Missing themes/ directory')
}

const themes = fs.readdirSync(themesDir, {withFileTypes: true})
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort()
  .map(id => {
    const themeDir = path.join(themesDir, id)
    const metadata = readJson(path.join(themeDir, 'theme.json'), {})
    const basePath = path.join(themeDir, 'base.css')

    if (!fs.existsSync(basePath)) {
      throw new Error(`Theme "${id}" is missing base.css`)
    }

    return {
      id,
      name: metadata.name || humanize(id),
      description: metadata.description || '',
      css: readCss(basePath),
      options: readOptions(path.join(themeDir, 'options'))
    }
  })

if (themes.length === 0) {
  throw new Error('No themes found in themes/')
}

const plugin = readJson(path.join(root, 'plugin.json'), {})

const catalog = {
  generatedAt: new Date().toISOString(),
  plugin: {
    id: plugin.id,
    name: plugin.name,
    displayName: plugin.displayName,
    description: plugin.description,
    author: plugin.author
  },
  themes
}

fs.mkdirSync(buildDir, {recursive: true})
fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8')

console.log(`Wrote ${path.relative(root, catalogPath)} with ${themes.length} theme(s)`)
