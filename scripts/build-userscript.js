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
  const BUILD_DATE = ${JSON.stringify(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).replace(',', ''))};
  const CATALOG = ${JSON.stringify(catalog)};
  const DEFAULT_THEME_ID = '__default__';
  const STORAGE_KEY = PLUGIN_ID + '.settings';
  const STYLE_ID = PLUGIN_ID + '-style';
  const LAST_STYLE_MARKER = 'data-' + PLUGIN_ID.toLowerCase() + '-managed';

  function allThemes() {
    const defaultTheme = Object.assign({
      id: DEFAULT_THEME_ID,
      name: 'Default',
      description: 'Turns off all theme CSS and options.',
      preview: ''
    }, CATALOG.defaultTheme || {});

    return [defaultTheme].concat(Array.isArray(CATALOG.themes) ? CATALOG.themes : []);
  }

  function selectableThemes() {
    return Array.isArray(CATALOG.themes) ? CATALOG.themes : [];
  }

  function globalOptions() {
    return Array.isArray(CATALOG.globalOptions) ? CATALOG.globalOptions : [];
  }

  function getTheme(themeId) {
    if (themeId === DEFAULT_THEME_ID) return allThemes()[0];

    const themes = selectableThemes();
    return themes.find(theme => theme.id === themeId) || themes[0] || allThemes()[0];
  }

  function defaultSettings() {
    return {
      theme: DEFAULT_THEME_ID,
      variants: {},
      themeOptions: {},
      globalOptions: []
    };
  }

  function normalizeSettings(settings) {
    const next = Object.assign(defaultSettings(), settings || {});

    if (next.enabled === false) {
      next.theme = DEFAULT_THEME_ID;
    }

    if (!next.theme) next.theme = DEFAULT_THEME_ID;
    if (!next.variants || typeof next.variants !== 'object') next.variants = {};
    if (!next.themeOptions || typeof next.themeOptions !== 'object') next.themeOptions = {};
    if (!Array.isArray(next.globalOptions)) next.globalOptions = [];

    return next;
  }

  function readSettings() {
    try {
      return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (err) {
      return defaultSettings();
    }
  }

  function writeSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  }

  function selectedVariantFor(settings, theme) {
    if (!theme || theme.id === DEFAULT_THEME_ID) return '';

    const variants = Array.isArray(theme.variants) ? theme.variants : [];
    if (variants.length === 0) return '';

    return settings.variants[theme.id] || variants[0].id;
  }

  function selectedThemeOptionsFor(settings, theme) {
    if (!theme || theme.id === DEFAULT_THEME_ID) return [];

    const selected = settings.themeOptions && settings.themeOptions[theme.id];
    return Array.isArray(selected) ? selected : [];
  }

  function cssFor(settings) {
    settings = normalizeSettings(settings);

    if (settings.theme === DEFAULT_THEME_ID) return '';

    const theme = getTheme(settings.theme);
    if (!theme || theme.id === DEFAULT_THEME_ID) return '';

    const css = [];

    if (CATALOG.globalImports) {
      /*
        Keep this first so @import rules remain valid. CSS @import rules must
        precede normal style rules, so do not move this below theme CSS.
      */
      css.push(CATALOG.globalImports);
    }

    css.push('/* ' + PLUGIN_NAME + ': ' + theme.name + ' */');
    css.push(theme.css || '');

    const variants = Array.isArray(theme.variants) ? theme.variants : [];
    const variantId = selectedVariantFor(settings, theme);

    variants.forEach(function (variant) {
      if (variant.id === variantId) {
        css.push('/* Variant: ' + variant.name + ' */');
        css.push(variant.css || '');
      }
    });

    const selectedOptions = new Set(selectedThemeOptionsFor(settings, theme));
    const themeOptions = Array.isArray(theme.options) ? theme.options : [];

    themeOptions.forEach(function (option) {
      if (selectedOptions.has(option.id)) {
        css.push('/* Theme option: ' + option.name + ' */');
        css.push(option.css || '');
      }
    });

    const selectedGlobalOptions = new Set(settings.globalOptions || []);
    globalOptions().forEach(function (option) {
      if (selectedGlobalOptions.has(option.id)) {
        css.push('/* Global option: ' + option.name + ' */');
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

  let activeSettingsDialog = null;

  function rerenderSettingsDialog() {
    if (activeSettingsDialog) renderSettingsDialog(activeSettingsDialog);
  }

  function defaultPreviewSvg() {
    return 'data:image/svg+xml;base64,' + btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="166" viewBox="0 0 250 166">' +
      '<rect width="250" height="166" fill="#20252b"/>' +
      '<rect x="36" y="36" width="178" height="94" rx="12" fill="#2c333a"/>' +
      '<text x="125" y="89" text-anchor="middle" fill="#d8dde3" font-family="Arial" font-size="22">Default</text>' +
      '</svg>'
    );
  }

  function createPreviewImage(theme) {
    const img = makeElement('img', {
      alt: theme.name,
      src: theme.preview || defaultPreviewSvg(),
      style: {
        width: '250px',
        height: '166px',
        objectFit: 'cover',
        display: 'block',
        borderRadius: '6px',
        background: '#111'
      }
    });

    return img;
  }

  function createThemeCard(theme, selectedThemeId, onSelect) {
    const selected = theme.id === selectedThemeId;

    const card = makeElement('button', {
      type: 'button',
      className: PLUGIN_ID + '-theme-card',
      style: {
        width: '250px',
        padding: '0',
        margin: '0',
        border: selected ? '2px solid #f5c542' : '1px solid rgba(255,255,255,0.25)',
        borderRadius: '8px',
        background: selected ? 'rgba(245,197,66,0.12)' : 'rgba(255,255,255,0.04)',
        color: 'inherit',
        cursor: 'pointer',
        textAlign: 'center',
        overflow: 'hidden'
      }
    }, [
      createPreviewImage(theme),
      makeElement('div', {
        textContent: theme.name,
        style: {
          padding: '6px 4px 8px',
          fontWeight: selected ? '700' : '500',
          fontSize: '13px'
        }
      })
    ]);

    card.addEventListener('click', function () {
      onSelect(theme.id);
    });

    return card;
  }

  function makeCheckbox(labelText, checked, onChange) {
    const checkbox = makeElement('input', {type: 'checkbox'});
    checkbox.checked = !!checked;
    checkbox.addEventListener('change', function () {
      onChange(checkbox.checked);
    });

    return makeElement('label', {style: {display: 'block', margin: '0.35em 0', cursor: 'pointer'}}, [
      checkbox,
      ' ' + labelText
    ]);
  }

  function makeRadio(labelText, name, checked, onChange) {
    const radio = makeElement('input', {type: 'radio', name: name});
    radio.checked = !!checked;
    radio.addEventListener('change', function () {
      if (radio.checked) onChange();
    });

    return makeElement('label', {style: {display: 'block', margin: '0.35em 0', cursor: 'pointer'}}, [
      radio,
      ' ' + labelText
    ]);
  }

  function renderRightPanel(container, settings, selectedTheme) {
    container.textContent = '';

    if (!selectedTheme || selectedTheme.id === DEFAULT_THEME_ID) {
      container.appendChild(makeElement('h3', {textContent: 'Default'}));
      container.appendChild(makeElement('p', {
        textContent: 'Default turns off all injected theme, variant, theme-option, and global-option CSS.',
        style: {marginTop: '0'}
      }));
      return;
    }

    container.appendChild(makeElement('h3', {textContent: selectedTheme.name}));
    if (selectedTheme.description) {
      container.appendChild(makeElement('p', {
        textContent: selectedTheme.description,
        style: {marginTop: '0', opacity: '0.85'}
      }));
    }

    const variants = Array.isArray(selectedTheme.variants) ? selectedTheme.variants : [];
    if (variants.length > 0) {
      const box = makeElement('div', {style: {marginBottom: '1em'}});
      box.appendChild(makeElement('h4', {textContent: 'Variants', style: {marginBottom: '0.25em'}}));

      const selectedVariant = selectedVariantFor(settings, selectedTheme);
      variants.forEach(function (variant) {
        box.appendChild(makeRadio(variant.name, PLUGIN_ID + '-variant', variant.id === selectedVariant, function () {
          const next = readSettings();
          next.variants = next.variants || {};
          next.variants[selectedTheme.id] = variant.id;
          writeSettings(next);
          applyTheme();
          rerenderSettingsDialog();
        }));
      });

      container.appendChild(box);
    }

    const themeOptions = Array.isArray(selectedTheme.options) ? selectedTheme.options : [];
    if (themeOptions.length > 0) {
      const box = makeElement('div', {style: {marginBottom: '1em'}});
      box.appendChild(makeElement('h4', {textContent: 'Theme options', style: {marginBottom: '0.25em'}}));

      const selected = new Set(selectedThemeOptionsFor(settings, selectedTheme));
      themeOptions.forEach(function (option) {
        box.appendChild(makeCheckbox(option.name, selected.has(option.id), function (checked) {
          const next = readSettings();
          const nextOptions = new Set(selectedThemeOptionsFor(next, selectedTheme));

          if (checked) nextOptions.add(option.id);
          else nextOptions.delete(option.id);

          next.themeOptions = next.themeOptions || {};
          next.themeOptions[selectedTheme.id] = Array.from(nextOptions);
          writeSettings(next);
          applyTheme();
        }));
      });

      container.appendChild(box);
    }

    const globals = globalOptions();
    if (globals.length > 0) {
      const box = makeElement('div', {style: {marginBottom: '1em'}});
      box.appendChild(makeElement('h4', {textContent: 'Global options', style: {marginBottom: '0.25em'}}));

      const selected = new Set(settings.globalOptions || []);
      globals.forEach(function (option) {
        box.appendChild(makeCheckbox(option.name, selected.has(option.id), function (checked) {
          const next = readSettings();
          const nextOptions = new Set(next.globalOptions || []);

          if (checked) nextOptions.add(option.id);
          else nextOptions.delete(option.id);

          next.globalOptions = Array.from(nextOptions);
          writeSettings(next);
          applyTheme();
        }));
      });

      container.appendChild(box);
    }
  }

  function renderSettingsDialog(container) {
    const settings = readSettings();
    const selectedTheme = getTheme(settings.theme);

    container.textContent = '';

    container.appendChild(makeElement('p', {
      textContent: 'hello',
      style: {
        margin: '0 0 1em',
        fontSize: '14px',
        opacity: '0.9'
      }
    }));

    const layout = makeElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'max-content minmax(260px, 1fr)',
        gap: '16px',
        alignItems: 'start'
      }
    });

    const left = makeElement('div');
    left.appendChild(makeElement('h3', {textContent: 'Themes', style: {marginTop: '0'}}));

    const grid = makeElement('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 250px)',
        gap: '10px',
        maxHeight: '70vh',
        overflow: 'auto',
        paddingRight: '4px'
      }
    });

    allThemes().forEach(function (theme) {
      grid.appendChild(createThemeCard(theme, settings.theme, function (themeId) {
        const next = readSettings();
        next.theme = themeId;

        if (themeId === DEFAULT_THEME_ID) {
          next.globalOptions = [];
          next.themeOptions = {};
        }

        writeSettings(next);
        applyTheme();
        renderSettingsDialog(container);
      }));
    });

    left.appendChild(grid);

    const right = makeElement('div', {
      style: {
        minWidth: '260px',
        maxWidth: '360px',
        padding: '0 0 0 6px'
      }
    });

    renderRightPanel(right, settings, selectedTheme);

    const resetButton = makeElement('button', {
      type: 'button',
      textContent: 'Reset to Default',
      style: {marginTop: '1em'}
    });
    resetButton.addEventListener('click', function () {
      resetSettings();
      renderSettingsDialog(container);
    });

    right.appendChild(resetButton);
    right.appendChild(makeElement('p', {
      textContent: PLUGIN_NAME + ' ' + VERSION + ' · Built ' + BUILD_DATE,
      style: {fontSize: '0.9em', opacity: '0.7', marginBottom: '0'}
    }));

    layout.appendChild(left);
    layout.appendChild(right);
    container.appendChild(layout);
  }

  function createSettingsDialog() {
    const container = makeElement('div', {
      className: PLUGIN_ID + '-settings',
      style: {
        minWidth: '820px',
        maxWidth: '95vw',
        maxHeight: '80vh',
        overflow: 'auto'
      }
    });

    activeSettingsDialog = container;
    renderSettingsDialog(container);
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

    if (window.IITC && window.IITC.toolbox && typeof window.IITC.toolbox.addButton === 'function') {
      window.IITC.toolbox.addButton({
        id: buttonId,
        label: PLUGIN_NAME,
        title: 'Configure ' + PLUGIN_NAME,
        action: showSettings
      });
      return true;
    }

    if (window.toolbox && typeof window.toolbox.addButton === 'function') {
      window.toolbox.addButton({
        id: buttonId,
        label: PLUGIN_NAME,
        title: 'Configure ' + PLUGIN_NAME,
        action: showSettings
      });
      return true;
    }

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
