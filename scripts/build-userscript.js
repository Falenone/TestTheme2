#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import {execSync} from 'node:child_process'

const root = process.cwd()
const mode = process.argv.includes('--dev') ? 'dev' : 'prod'

const plugin = readJson(path.join(root, 'plugin.json'))
const catalog = readJson(path.join(root, 'build/themes.json'))
const settingsUiCss = readText(path.join(root, 'ui/settings.css'))
const headerConfig = readJson(path.join(root, 'ui/header.json'), {
  text: 'Welcome to Blurtheme! Pick your theme and options below',
  imageSrc: ''
})
const aboutConfig = readJson(path.join(root, 'ui/about.json'), {
  author: plugin.author || 'Falenone',
  githubUrl: 'https://github.com/Falenone/TestTheme2',
  telegramUrl: 'https://t.me/YOUR_TELEGRAM_LINK'
})

function readText(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return fallback
  }
}

function readJson(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function shell(command, fallback = '') {
  try {
    return execSync(command, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim()
  } catch {
    return fallback
  }
}

function sanitizeVersion(version) {
  return String(version || '0.1.0')
    .replace(/^v/i, '')
    .replace(/[^0-9A-Za-z._-]/g, '.')
}

function getVersion() {
  const tag = shell('git describe --tags --abbrev=0', '0.1.0')
  const base = sanitizeVersion(tag)

  if (mode === 'prod') return base

  const timestamp = shell('git show -s --format=%cd --date=format:%Y%m%d.%H%M%S HEAD', '')
  const sha = shell('git rev-parse --short HEAD', 'local')
  return sanitizeVersion(`${base}.${timestamp || Date.now()}.${sha}`)
}

function getBuildDate() {
  return new Date()
    .toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC'
    })
    .replace(',', '')
}

function getNamespace() {
  if (aboutConfig.githubUrl) return aboutConfig.githubUrl
  if (plugin.downloadURL) return plugin.downloadURL.replace(/\/files\/release\/.*$/i, '')
  return 'https://github.com/Falenone/TestTheme2'
}

function userscriptHeader(version) {
  return [
    '// ==UserScript==',
    `// @id ${plugin.id}`,
    `// @name ${plugin.name}`,
    `// @category ${plugin.category || 'Themes'}`,
    `// @version ${version}`,
    `// @namespace ${getNamespace()}`,
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
  const constants = {
    pluginId: plugin.id,
    pluginName: plugin.displayName || plugin.name.replace(/^IITC plugin:\s*/i, ''),
    version,
    buildDate: getBuildDate(),
    catalog,
    settingsUiCss,
    headerConfig,
    aboutConfig
  }

  return `
(function () {
  'use strict';

  if (typeof window.plugin !== 'function') window.plugin = function () {};

  const PLUGIN_ID = ${JSON.stringify(constants.pluginId)};
  const PLUGIN_NAME = ${JSON.stringify(constants.pluginName)};
  const VERSION = ${JSON.stringify(constants.version)};
  const BUILD_DATE = ${JSON.stringify(constants.buildDate)};
  const CATALOG = ${JSON.stringify(constants.catalog)};
  const SETTINGS_UI_CSS = ${JSON.stringify(constants.settingsUiCss)};
  const HEADER_CONFIG = ${JSON.stringify(constants.headerConfig)};
  const ABOUT_CONFIG = ${JSON.stringify(constants.aboutConfig)};
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

  function ensureDefaultVariant(settings, theme) {
    if (!theme || theme.id === DEFAULT_THEME_ID) return settings;

    const variants = Array.isArray(theme.variants) ? theme.variants : [];
    if (variants.length === 0) return settings;

    settings.variants = settings.variants || {};

    const selectedVariantExists = variants.some(function (variant) {
      return variant.id === settings.variants[theme.id];
    });

    if (!selectedVariantExists) {
      settings.variants[theme.id] = variants[0].id;
    }

    return settings;
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

    /*
      Keep the theme style last in <html>. CSS still applies, and this makes the
      theme layer later than plugin styles that append to <head> after IITC boot.
    */
    const target = document.documentElement || document.head || document.body;
    if (target && style.parentNode !== target) {
      target.appendChild(style);
    }

    if (target && target.lastElementChild !== style) {
      target.appendChild(style);
    }

    return style;
  }

  function ensureSettingsUiCss() {
    const styleId = PLUGIN_ID + '-settings-ui-style';
    let style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      style.type = 'text/css';
      document.head.appendChild(style);
    }

    style.textContent = SETTINGS_UI_CSS;
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
    return makeElement('img', {
      alt: theme.name,
      src: theme.preview || defaultPreviewSvg(),
      className: 'testtheme-theme-preview'
    });
  }

  function createThemeCard(theme, selectedThemeId, onSelect) {
    const selected = theme.id === selectedThemeId;

    const card = makeElement('button', {
      type: 'button',
      className: 'testtheme-preview-card ' + PLUGIN_ID + '-preview-card' + (selected ? ' is-selected' : '')
    }, [
      createPreviewImage(theme),
      makeElement('div', {
        textContent: theme.name,
        className: 'testtheme-theme-title'
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

    return makeElement('label', {className: 'testtheme-checkbox'}, [
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

    return makeElement('label', {className: 'testtheme-radio'}, [
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
        className: 'testtheme-description'
      }));
      return;
    }

    container.appendChild(makeElement('h3', {textContent: selectedTheme.name}));

    if (selectedTheme.description) {
      container.appendChild(makeElement('p', {
        textContent: selectedTheme.description,
        className: 'testtheme-description'
      }));
    }

    renderVariants(container, settings, selectedTheme);
    renderThemeOptions(container, settings, selectedTheme);
    renderGlobalOptions(container, settings);
  }

  function renderVariants(container, settings, selectedTheme) {
    const variants = Array.isArray(selectedTheme.variants) ? selectedTheme.variants : [];
    if (variants.length === 0) return;

    const box = makeElement('div', {className: 'testtheme-option-section'});
    box.appendChild(makeElement('h4', {textContent: 'Variants'}));

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

  function renderThemeOptions(container, settings, selectedTheme) {
    const themeOptions = Array.isArray(selectedTheme.options) ? selectedTheme.options : [];
    if (themeOptions.length === 0) return;

    const box = makeElement('div', {className: 'testtheme-option-section'});
    box.appendChild(makeElement('h4', {textContent: 'Theme options'}));

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

  function renderGlobalOptions(container, settings) {
    const globals = globalOptions();
    if (globals.length === 0) return;

    const box = makeElement('div', {className: 'testtheme-option-section'});
    box.appendChild(makeElement('h4', {textContent: 'Global options'}));

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

  function renderSettingsDialog(container) {
    const settings = readSettings();
    const selectedTheme = getTheme(settings.theme);

    container.textContent = '';

    const header = makeElement('div', {
      className: 'testtheme-header'
    });

    if (HEADER_CONFIG.imageSrc) {
      header.appendChild(makeElement('img', {
        src: HEADER_CONFIG.imageSrc,
        alt: '',
        className: 'testtheme-header-image'
      }));
    }

    header.appendChild(makeElement('div', {
      textContent: HEADER_CONFIG.text || '',
      className: 'testtheme-header-text'
    }));

    container.appendChild(header);

    const layout = makeElement('div', {
      className: 'testtheme-layout'
    });

    const left = makeElement('div', {
      className: 'testtheme-left'
    });
    left.appendChild(makeElement('h3', {textContent: 'Themes'}));

    const grid = makeElement('div', {
      className: 'testtheme-theme-grid'
    });

    allThemes().forEach(function (theme) {
      grid.appendChild(createThemeCard(theme, settings.theme, function (themeId) {
        const next = readSettings();
        next.theme = themeId;

        if (themeId === DEFAULT_THEME_ID) {
          next.globalOptions = [];
          next.themeOptions = {};
        } else {
          ensureDefaultVariant(next, getTheme(themeId));
        }

        writeSettings(next);
        applyTheme();
        renderSettingsDialog(container);
      }));
    });

    left.appendChild(grid);

    const right = makeElement('div', {
      className: 'testtheme-right'
    });

    renderRightPanel(right, settings, selectedTheme);

    const resetButton = makeElement('button', {
      type: 'button',
      textContent: 'Reset to Default',
      className: 'testtheme-reset-button'
    });

    resetButton.addEventListener('click', function () {
      resetSettings();
      renderSettingsDialog(container);
    });

    right.appendChild(resetButton);
    right.appendChild(makeElement('p', {
      textContent: PLUGIN_NAME + ' ' + VERSION + ' · Built ' + BUILD_DATE,
      className: 'testtheme-version'
    }));

    layout.appendChild(left);
    layout.appendChild(right);
    container.appendChild(layout);
  }

  function createSettingsDialog() {
    const container = makeElement('div', {
      className: 'testtheme-settings ' + PLUGIN_ID + '-settings'
    });

    activeSettingsDialog = container;
    renderSettingsDialog(container);
    return container;
  }

  function showAboutDialog() {
    const existingAboutDialog = document.querySelector('.testtheme-about-dialog');

    if (existingAboutDialog) {
      const existingDialogRoot = existingAboutDialog.closest('.ui-dialog');

      if (existingDialogRoot) {
        const allDialogs = Array.from(document.querySelectorAll('.ui-dialog'));
        const highestZIndex = allDialogs.reduce(function (highest, dialog) {
          const zIndex = parseInt(window.getComputedStyle(dialog).zIndex, 10);
          return Number.isFinite(zIndex) ? Math.max(highest, zIndex) : highest;
        }, 1000);

        existingDialogRoot.style.zIndex = String(highestZIndex + 1);
      }

      return;
    }

    const content = makeElement('div', {
      className: 'testtheme-about-dialog'
    }, [
      makeElement('h3', {textContent: PLUGIN_NAME}),
      makeElement('p', {
        textContent: 'Author: ' + (ABOUT_CONFIG.author || 'Falenone')
      }),
      makeElement('p', {}, [
        makeElement('a', {
          href: ABOUT_CONFIG.githubUrl || '#',
          target: '_blank',
          rel: 'noopener noreferrer',
          textContent: 'GitHub repository'
        })
      ]),
      makeElement('p', {}, [
        makeElement('a', {
          href: ABOUT_CONFIG.telegramUrl || '#',
          target: '_blank',
          rel: 'noopener noreferrer',
          textContent: 'Telegram'
        })
      ])
    ]);

    if (window.dialog) {
      window.dialog({
        html: content,
        title: 'About ' + PLUGIN_NAME,
        width: 'auto'
      });
      return;
    }

    alert(PLUGIN_NAME + '\\nAuthor: ' + (ABOUT_CONFIG.author || 'Falenone'));
  }

  function addAboutButtonToSettingsDialog() {
    if (!activeSettingsDialog || typeof activeSettingsDialog.closest !== 'function') return false;

    const dialogRoot = activeSettingsDialog.closest('.ui-dialog');
    if (!dialogRoot) return false;

    const buttonSet = dialogRoot.querySelector('.ui-dialog-buttonset');
    if (!buttonSet) return false;

    const buttonId = PLUGIN_ID + '-about-dialog-button';
    if (dialogRoot.querySelector('#' + buttonId)) return true;

    const aboutButton = document.createElement('button');
    aboutButton.id = buttonId;
    aboutButton.type = 'button';
    aboutButton.textContent = 'About';
    aboutButton.className = 'testtheme-about-button ui-button ui-corner-all ui-widget';

    aboutButton.addEventListener('click', function (event) {
      event.preventDefault();
      showAboutDialog();
    });

    buttonSet.insertBefore(aboutButton, buttonSet.firstChild);
    return true;
  }

  function addAboutButtonToSettingsDialogWhenReady() {
    if (addAboutButtonToSettingsDialog()) return;

    let attempts = 0;
    const timer = window.setInterval(function () {
      attempts += 1;

      if (addAboutButtonToSettingsDialog() || attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 50);
  }

  function showSettings() {
    const content = createSettingsDialog();

    if (window.dialog) {
      window.dialog({
        html: content,
        title: PLUGIN_NAME,
        width: 'auto'
      });
      addAboutButtonToSettingsDialogWhenReady();
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
    if (!document.documentElement || typeof MutationObserver !== 'function') return;

    let scheduled = false;

    const moveLast = function () {
      scheduled = false;
      const style = document.getElementById(STYLE_ID);
      const target = document.documentElement || document.head || document.body;

      if (style && target && target.lastElementChild !== style) {
        target.appendChild(style);
      }
    };

    const observer = new MutationObserver(function () {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(moveLast, 0);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    moveLast();
  }

  function setup() {
    ensureSettingsUiCss();
    applyTheme();
    addToolboxButtonWhenReady();
    keepStyleLast();
    window.setTimeout(applyTheme, 250);
    window.setTimeout(applyTheme, 1000);
    console.log(PLUGIN_NAME + ' ' + VERSION);
  }

  setup.info = {
    pluginId: PLUGIN_ID,
    script: {
      name: PLUGIN_NAME,
      version: VERSION,
      description: CATALOG.plugin && CATALOG.plugin.description ? CATALOG.plugin.description : ''
    }
  };

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
