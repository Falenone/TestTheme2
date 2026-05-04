#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {execSync} from 'node:child_process'

const root = process.cwd()
const mode = process.argv.includes('--dev') ? 'dev' : 'prod'
const plugin = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'))
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'build/themes.json'), 'utf8'))

function shell(command, fallback = '') {
  try {
    return execSync(command, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim()
  } catch {
    return fallback
  }
}

function sanitizeVersion(version) {
  return String(version || '0.1.0').replace(/^v/i, '').replace(/[^0-9A-Za-z._-]/g, '.')
}

function getVersion() {
  const tag = shell('git describe --tags --abbrev=0', '0.1.0')
  const base = sanitizeVersion(tag)

  if (mode === 'prod') return base

  const timestamp = shell('git show -s --format=%cd --date=format:%Y%m%d.%H%M%S HEAD', '')
  const sha = shell('git rev-parse --short HEAD', 'local')
  return sanitizeVersion(`${base}.${timestamp || Date.now()}.${sha}`)
}

function userscriptHeader(version) {
  return [
    '// ==UserScript==',
    `// @id ${plugin.id}`,
    `// @name ${plugin.name}`,
    `// @category ${plugin.category || 'Themes'}`,
    `// @version ${version}`,
    `// @namespace https://github.com/Falenone/TestTheme2`,
    `// @author ${plugin.author || ''}`,
    `// @description ${plugin.description || ''}`,
    '// @match https://intel.ingress.com/*',
    '// @match http://intel.ingress.com/*',
    '// @include https://intel.ingress.com/*',
    '// @include http://intel.ingress.com/*',
    plugin.downloadURL ? `// @downloadURL ${plugin.downloadURL}` : null,
    plugin.downloadURL ? `// @updateURL ${plugin.downloadURL.replace(/\.user\.js$/i, '.meta.js')}` : null,
    '// @grant none',
    '// ==/UserScript=='
  ].filter(Boolean).join('\n')
}

function userscriptBody(version) {
  return `
(function () {
  'use strict';

  if (typeof window.plugin !== 'function') window.plugin = function () {};

  const PLUGIN_ID = ${JSON.stringify(plugin.id)};
  const PLUGIN_NAME = ${JSON.stringify(plugin.displayName || plugin.name.replace(/^IITC plugin:\\s*/i, ''))};
  const VERSION = ${JSON.stringify(version)};
  const CATALOG = ${JSON.stringify(catalog)};
  const STORAGE_KEY = PLUGIN_ID + '.settings';
  const STYLE_ID = PLUGIN_ID + '-style';
  const LAST_STYLE_MARKER = 'data-' + PLUGIN_ID.toLowerCase() + '-managed';

  function getThemes() {
    return Array.isArray(CATALOG.themes) ? CATALOG.themes : [];
  }

  function getTheme(themeId) {
    const themes = getThemes();
    return themes.find(theme => theme.id === themeId) || themes[0] || null;
  }

  function defaultSettings() {
    const firstTheme = getThemes()[0];
    return {
      enabled: true,
      theme: firstTheme ? firstTheme.id : '',
      options: {}
    };
  }

  function readSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return Object.assign(defaultSettings(), parsed);
    } catch (err) {
      return defaultSettings();
    }
  }

  function writeSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function selectedOptionsFor(settings, theme) {
    const selected = settings.options && settings.options[theme.id];
    return Array.isArray(selected) ? selected : [];
  }

  function cssFor(settings) {
    if (!settings.enabled) return '';

    const theme = getTheme(settings.theme);
    if (!theme) return '';

    const css = [
      '/* ' + PLUGIN_NAME + ': ' + theme.name + ' */',
      theme.css || ''
    ];

    const selectedOptions = new Set(selectedOptionsFor(settings, theme));
    const options = Array.isArray(theme.options) ? theme.options : [];

    options.forEach(function (option) {
      if (selectedOptions.has(option.id)) {
        css.push('/* Option: ' + option.name + ' */');
        css.push(option.css || '');
      }
    });

    return css.join('\\n');
  }

  function ensureStyleElement() {
    let style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.type = 'text/css';
      style.setAttribute(LAST_STYLE_MARKER, 'true');
    }

    if (document.head && style.parentNode !== document.head) {
      document.head.appendChild(style);
    }

    /*
      Keep this plugin's CSS last in <head>, so it naturally wins over IITC
      and other plugins unless they use stronger selectors or later inline styles.
    */
    if (document.head && document.head.lastElementChild !== style) {
      document.head.appendChild(style);
    }

    return style;
  }

  function applyTheme() {
    const settings = readSettings();
    const style = ensureStyleElement();
    style.textContent = cssFor(settings);
  }

  function resetSettings() {
    writeSettings(defaultSettings());
    applyTheme();
  }

  function makeElement(tag, attributes, children) {
    const el = document.createElement(tag);

    Object.entries(attributes || {}).forEach(function ([key, value]) {
      if (key === 'className') el.className = value;
      else if (key === 'textContent') el.textContent = value;
      else if (key === 'style') Object.assign(el.style, value);
      else el.setAttribute(key, value);
    });

    (children || []).forEach(function (child) {
      el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });

    return el;
  }

  function renderSettings(container) {
    const settings = readSettings();
    const themes = getThemes();
    const currentTheme = getTheme(settings.theme);

    container.textContent = '';

    container.appendChild(makeElement('p', {
      textContent: 'Select which compiled CSS theme should overwrite IITC styles.',
      style: {marginTop: '0'}
    }));

    const enabled = makeElement('input', {type: 'checkbox'});
    enabled.checked = settings.enabled;
    enabled.addEventListener('change', function () {
      const next = readSettings();
      next.enabled = enabled.checked;
      writeSettings(next);
      applyTheme();
      renderSettings(container);
    });

    const enabledLabel = makeElement('label', {style: {display: 'block', margin: '0.5em 0'}}, [
      enabled,
      ' Enabled'
    ]);
    container.appendChild(enabledLabel);

    const themeSelect = makeElement('select', {style: {minWidth: '16em'}});
    themes.forEach(function (theme) {
      const option = makeElement('option', {value: theme.id, textContent: theme.name});
      option.selected = currentTheme && theme.id === currentTheme.id;
      themeSelect.appendChild(option);
    });

    themeSelect.addEventListener('change', function () {
      const next = readSettings();
      next.theme = themeSelect.value;
      writeSettings(next);
      applyTheme();
      renderSettings(container);
    });

    container.appendChild(makeElement('label', {style: {display: 'block', margin: '0.5em 0'}}, [
      makeElement('span', {textContent: 'Theme ', style: {display: 'inline-block', minWidth: '5em'}}),
      themeSelect
    ]));

    if (currentTheme && currentTheme.description) {
      container.appendChild(makeElement('p', {
        textContent: currentTheme.description,
        style: {opacity: '0.8', margin: '0.25em 0 0.75em'}
      }));
    }

    const options = currentTheme && Array.isArray(currentTheme.options) ? currentTheme.options : [];

    if (currentTheme && options.length > 0) {
      const fieldset = makeElement('fieldset', {style: {marginTop: '0.75em'}});
      fieldset.appendChild(makeElement('legend', {textContent: 'Options'}));

      const selected = new Set(selectedOptionsFor(settings, currentTheme));

      options.forEach(function (themeOption) {
        const checkbox = makeElement('input', {type: 'checkbox', value: themeOption.id});
        checkbox.checked = selected.has(themeOption.id);

        checkbox.addEventListener('change', function () {
          const next = readSettings();
          const nextOptions = new Set(selectedOptionsFor(next, currentTheme));

          if (checkbox.checked) nextOptions.add(themeOption.id);
          else nextOptions.delete(themeOption.id);

          next.options = next.options || {};
          next.options[currentTheme.id] = Array.from(nextOptions);
          writeSettings(next);
          applyTheme();
        });

        fieldset.appendChild(makeElement('label', {style: {display: 'block', margin: '0.25em 0'}}, [
          checkbox,
          ' ' + themeOption.name
        ]));
      });

      container.appendChild(fieldset);
    }

    const buttons = makeElement('div', {style: {marginTop: '1em'}});
    const resetButton = makeElement('button', {type: 'button', textContent: 'Reset settings'});
    resetButton.addEventListener('click', function () {
      resetSettings();
      renderSettings(container);
    });
    buttons.appendChild(resetButton);
    container.appendChild(buttons);

    container.appendChild(makeElement('p', {
      textContent: PLUGIN_NAME + ' ' + VERSION,
      style: {fontSize: '0.9em', opacity: '0.7', marginBottom: '0'}
    }));
  }

  function createSettingsDialog() {
    const container = makeElement('div', {
      className: PLUGIN_ID + '-settings',
      style: {minWidth: '280px'}
    });
    renderSettings(container);
    return container;
  }

  function showSettings() {
    const content = createSettingsDialog();

    if (window.dialog) {
      window.dialog({
        html: content,
        title: PLUGIN_NAME,
        width: 'auto'
      });
      return;
    }

    alert(PLUGIN_NAME + ' is active, but the IITC dialog API is unavailable.');
  }

  function addToolboxButton() {
    const buttonId = PLUGIN_ID + '-toolbox-button';

    if (document.getElementById(buttonId)) return true;

    /*
      IITC-CE v0.38+ Toolbox API.
      See IITC migration docs: IITC.toolbox.addButton({ id, label, action }).
    */
    if (window.IITC && window.IITC.toolbox && typeof window.IITC.toolbox.addButton === 'function') {
      window.IITC.toolbox.addButton({
        id: buttonId,
        label: PLUGIN_NAME,
        title: 'Configure ' + PLUGIN_NAME,
        action: showSettings
      });
      return true;
    }

    /*
      Older/nonstandard toolbox API used by some plugins/builds.
    */
    if (window.toolbox && typeof window.toolbox.addButton === 'function') {
      window.toolbox.addButton({
        id: buttonId,
        label: PLUGIN_NAME,
        title: 'Configure ' + PLUGIN_NAME,
        action: showSettings
      });
      return true;
    }

    /*
      Last-resort legacy fallback: append directly to #toolbox.
      This matches the old IITC plugin pattern and makes the button visible
      even when no toolbox helper API is exposed.
    */
    const toolbox = document.getElementById('toolbox');
    if (toolbox) {
      const link = document.createElement('a');
      link.id = buttonId;
      link.href = '#';
      link.textContent = PLUGIN_NAME;
      link.title = 'Configure ' + PLUGIN_NAME;
      link.addEventListener('click', function (event) {
        event.preventDefault();
        showSettings();
      });
      toolbox.appendChild(link);
      return true;
    }

    return false;
  }

  function addToolboxButtonWhenReady() {
    if (addToolboxButton()) return;

    let attempts = 0;
    const timer = window.setInterval(function () {
      attempts += 1;

      if (addToolboxButton() || attempts >= 50) {
        window.clearInterval(timer);
      }
    }, 200);
  }

  function keepStyleLast() {
    if (!document.head || typeof MutationObserver !== 'function') return;

    const observer = new MutationObserver(function () {
      const style = document.getElementById(STYLE_ID);
      if (style && document.head.lastElementChild !== style) {
        document.head.appendChild(style);
      }
    });

    observer.observe(document.head, {childList: true});
  }

  function setup() {
    applyTheme();
    addToolboxButtonWhenReady();
    keepStyleLast();
    console.log(PLUGIN_NAME + ' ' + VERSION);
  }

  window.plugin[PLUGIN_ID] = {
    setup: setup,
    applyTheme: applyTheme,
    showSettings: showSettings,
    resetSettings: resetSettings,
    catalog: CATALOG,
    info: {
      name: PLUGIN_NAME,
      version: VERSION
    }
  };

  if (window.iitcLoaded) setup();
  else if (Array.isArray(window.bootPlugins)) window.bootPlugins.push(setup);
  else window.bootPlugins = [setup];
})();
`
}

const version = getVersion()
const distDir = path.join(root, 'dist')
const fileName = `${plugin.id}.user.js`
const metaName = `${plugin.id}.meta.js`

fs.rmSync(distDir, {recursive: true, force: true})
fs.mkdirSync(distDir, {recursive: true})

fs.writeFileSync(path.join(distDir, fileName), userscriptHeader(version) + '\n' + userscriptBody(version), 'utf8')
fs.writeFileSync(path.join(distDir, metaName), userscriptHeader(version) + '\n', 'utf8')

console.log(`Built dist/${fileName} (${version}, ${mode})`)
