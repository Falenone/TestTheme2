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

    if (Array.isArray(theme.sharedCssFiles)) {
      theme.sharedCssFiles.forEach(function (sharedFile) {
        css.push('/* Shared theme CSS: ' + sharedFile.file + ' */');
        css.push(sharedFile.css || '');
      });
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

	const header = makeElement('div', {
	  style: {
		textAlign: 'center',
		margin: '0 0 1em'
	  }
	});

	header.appendChild(makeElement('img', {
	  src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPoAAACmCAYAAAGEp6InAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAFF2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNy4wLWMwMDAgNzkuMTM1N2M5ZSwgMjAyMS8wNy8xNC0wMDozOTo1NiAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczpkYz0iaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8iIHhtbG5zOnBob3Rvc2hvcD0iaHR0cDovL25zLmFkb2JlLmNvbS9waG90b3Nob3AvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0RXZ0PSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VFdmVudCMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIDIyLjUgKFdpbmRvd3MpIiB4bXA6Q3JlYXRlRGF0ZT0iMjAyNi0wMS0xMVQxOTowODowMiswMjowMCIgeG1wOk1vZGlmeURhdGU9IjIwMjYtMDEtMjNUMTI6NTE6NDcrMDI6MDAiIHhtcDpNZXRhZGF0YURhdGU9IjIwMjYtMDEtMjNUMTI6NTE6NDcrMDI6MDAiIGRjOmZvcm1hdD0iaW1hZ2UvcG5nIiBwaG90b3Nob3A6Q29sb3JNb2RlPSIzIiBwaG90b3Nob3A6SUNDUHJvZmlsZT0ic1JHQiBJRUM2MTk2Ni0yLjEiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6ZjU4YTI3ZDUtYzlmZS1i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',
	  alt: '',
	  style: {
		maxWidth: '250px',
		maxHeight: '166px',
		display: 'block',
		margin: '0 auto 0.5em'
	  }
	}));

	header.appendChild(makeElement('div', {
	  textContent: 'hello',
	  style: {
		fontSize: '14px',
		opacity: '0.9'
	  }
	}));

	container.appendChild(header);	

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
