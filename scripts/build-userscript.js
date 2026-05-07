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
  const LIVE_CSS_STYLE_ID = PLUGIN_ID + '-live-dev-css-style';
  const LIVE_CSS_STORAGE_KEY = PLUGIN_ID + '.liveCss';
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
      globalOptions: [],
      autoVariant: {}
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
    if (!next.autoVariant || typeof next.autoVariant !== 'object') next.autoVariant = {};

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

  function timeToMinutes(value) {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return 0;

    const hours = Math.max(0, Math.min(23, parseInt(match[1], 10)));
    const minutes = Math.max(0, Math.min(59, parseInt(match[2], 10)));

    return hours * 60 + minutes;
  }

  function isCurrentTimeInRange(start, end) {
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);

    if (startMinutes === endMinutes) return false;
    if (startMinutes > endMinutes) return current >= startMinutes || current < endMinutes;

    return current >= startMinutes && current < endMinutes;
  }

  function getAutoVariantSettings(settings, theme) {
    if (!theme || !theme.autoVariant || theme.autoVariant.enabled !== true) return null;

    const stored = settings.autoVariant && settings.autoVariant[theme.id] ? settings.autoVariant[theme.id] : {};

    return {
      enabled: stored.enabled === true,
      darkStart: stored.darkStart || theme.autoVariant.defaultDarkStart || '18:00',
      darkEnd: stored.darkEnd || theme.autoVariant.defaultDarkEnd || '06:00'
    };
  }

  function getEffectiveVariantId(settings, theme) {
    const autoSettings = getAutoVariantSettings(settings, theme);

    if (!autoSettings || autoSettings.enabled !== true) {
      return selectedVariantFor(settings, theme);
    }

    const darkVariant = theme.autoVariant.dark || '';
    const lightVariant = theme.autoVariant.light || '';

    return isCurrentTimeInRange(autoSettings.darkStart, autoSettings.darkEnd) ? darkVariant : lightVariant;
  }

  function getEffectiveVariantLabel(settings, theme) {
    const autoSettings = getAutoVariantSettings(settings, theme);

    if (!autoSettings || autoSettings.enabled !== true) {
      return selectedVariantFor(settings, theme) || 'none';
    }

    return 'Auto → ' + getEffectiveVariantId(settings, theme);
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
    const variantId = getEffectiveVariantId(settings, theme);

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

  function ensureLiveCssStyleElement() {
    let style = document.getElementById(LIVE_CSS_STYLE_ID);

    if (!style) {
      style = document.createElement('style');
      style.id = LIVE_CSS_STYLE_ID;
      style.type = 'text/css';
      style.setAttribute(LAST_STYLE_MARKER, 'true');
    }

    const target = document.documentElement || document.head || document.body;
    if (target && style.parentNode !== target) {
      target.appendChild(style);
    }

    if (target && target.lastElementChild !== style) {
      target.appendChild(style);
    }

    return style;
  }

  function readLiveCss() {
    return localStorage.getItem(LIVE_CSS_STORAGE_KEY) || '';
  }

  function writeLiveCss(cssText) {
    localStorage.setItem(LIVE_CSS_STORAGE_KEY, cssText || '');
  }

  function clearLiveCss() {
    localStorage.removeItem(LIVE_CSS_STORAGE_KEY);
  }

  function applyLiveCss(cssText) {
    const style = ensureLiveCssStyleElement();
    style.textContent = cssText || '';
  }

  function applySavedLiveCss() {
    applyLiveCss(readLiveCss());
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
    applySavedLiveCss();
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

  function makeOptionDescription(description) {
    if (!description) return null;

    return makeElement('span', {
      textContent: description,
      className: 'testtheme-option-description'
    });
  }

  function makeCheckbox(labelText, checked, onChange, description) {
    const checkbox = makeElement('input', {type: 'checkbox'});
    checkbox.checked = !!checked;
    checkbox.addEventListener('change', function () {
      onChange(checkbox.checked);
    });

    const children = [
      checkbox,
      ' ' + labelText
    ];

    const optionDescription = makeOptionDescription(description);
    if (optionDescription) children.push(optionDescription);

    return makeElement('label', {className: 'testtheme-checkbox'}, children);
  }

  function makeRadio(labelText, name, checked, onChange, description) {
    const radio = makeElement('input', {type: 'radio', name: name});
    radio.checked = !!checked;
    radio.addEventListener('change', function () {
      if (radio.checked) onChange();
    });

    const children = [
      radio,
      ' ' + labelText
    ];

    const optionDescription = makeOptionDescription(description);
    if (optionDescription) children.push(optionDescription);

    return makeElement('label', {className: 'testtheme-radio'}, children);
  }

  function renderMetadataBadges(container, theme) {
    const tags = Array.isArray(theme.tags) ? theme.tags : [];
    if (tags.length === 0) return;

    const badgeRow = makeElement('div', {
      className: 'testtheme-badge-row'
    });

    tags.forEach(function (tag) {
      badgeRow.appendChild(makeElement('span', {
        textContent: String(tag),
        className: 'testtheme-badge'
      }));
    });

    container.appendChild(badgeRow);
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

    renderMetadataBadges(container, selectedTheme);

    if (selectedTheme.notes) {
      container.appendChild(makeElement('p', {
        textContent: selectedTheme.notes,
        className: 'testtheme-notes'
      }));
    }

    renderVariants(container, settings, selectedTheme);
    renderAutoVariantOption(container, settings, selectedTheme);
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

  function renderAutoVariantOption(container, settings, selectedTheme) {
    if (!selectedTheme || !selectedTheme.autoVariant || selectedTheme.autoVariant.enabled !== true) return;

    const autoSettings = getAutoVariantSettings(settings, selectedTheme);
    const box = makeElement('div', {
      className: 'testtheme-option-section testtheme-auto-variant-section'
    });

    box.appendChild(makeElement('h4', {
      textContent: 'Auto light/dark'
    }));

    const enabled = makeElement('input', {
      type: 'checkbox',
      className: 'testtheme-auto-variant-toggle'
    });
    enabled.checked = autoSettings.enabled === true;

    const darkStart = makeElement('input', {
      type: 'time',
      value: autoSettings.darkStart,
      className: 'testtheme-time-input'
    });

    const darkEnd = makeElement('input', {
      type: 'time',
      value: autoSettings.darkEnd,
      className: 'testtheme-time-input'
    });

    function saveAutoSettings() {
      const next = readSettings();
      next.autoVariant = next.autoVariant || {};
      next.autoVariant[selectedTheme.id] = {
        enabled: enabled.checked,
        darkStart: darkStart.value || selectedTheme.autoVariant.defaultDarkStart || '18:00',
        darkEnd: darkEnd.value || selectedTheme.autoVariant.defaultDarkEnd || '06:00'
      };

      writeSettings(next);
      applyTheme();
      rerenderSettingsDialog();
    }

    enabled.addEventListener('change', saveAutoSettings);
    darkStart.addEventListener('change', saveAutoSettings);
    darkEnd.addEventListener('change', saveAutoSettings);

    box.appendChild(makeElement('label', {
      className: 'testtheme-checkbox'
    }, [
      enabled,
      ' Enable time-based auto light/dark'
    ]));

    box.appendChild(makeElement('div', {
      className: 'testtheme-time-row'
    }, [
      makeElement('span', {
        textContent: 'Dark from'
      }),
      darkStart,
      makeElement('span', {
        textContent: 'to'
      }),
      darkEnd
    ]));

    box.appendChild(makeElement('p', {
      textContent: 'Current variant: ' + getEffectiveVariantLabel(settings, selectedTheme),
      className: 'testtheme-debug-small'
    }));

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

  function bringDialogToFront(dialogContentSelector) {
    const existingDialogContent = document.querySelector(dialogContentSelector);
    if (!existingDialogContent) return false;

    const existingDialogRoot = existingDialogContent.closest('.ui-dialog');
    if (!existingDialogRoot) return true;

    const allDialogs = Array.from(document.querySelectorAll('.ui-dialog'));
    const highestZIndex = allDialogs.reduce(function (highest, dialog) {
      const zIndex = parseInt(window.getComputedStyle(dialog).zIndex, 10);
      return Number.isFinite(zIndex) ? Math.max(highest, zIndex) : highest;
    }, 1000);

    existingDialogRoot.style.zIndex = String(highestZIndex + 1);
    return true;
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

  function getThemeStyleStatus() {
    const style = document.getElementById(STYLE_ID);
    const target = document.documentElement || document.head || document.body;

    const cssText = style ? style.textContent : '';

    return {
      found: !!style,
      cssLength: cssText.length,
      cssLines: cssText ? cssText.replaceAll('\\r\\n', '\\n').replaceAll('\\r', '\\n').split('\\n').length : 0,
      parentTag: style && style.parentNode && style.parentNode.tagName ? style.parentNode.tagName.toLowerCase() : 'none',
      lastInTarget: !!(style && target && target.lastElementChild === style)
    };
  }

  function appendDebugRow(container, label, value) {
    container.appendChild(makeElement('div', {
      className: 'testtheme-debug-row'
    }, [
      makeElement('strong', {
        textContent: label
      }),
      makeElement('span', {
        textContent: String(value)
      })
    ]));
  }

  function getCurrentLocalTimeString() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return hours + ':' + minutes;
  }

  function getAutoVariantConfigStatus(theme) {
    if (!theme || !theme.autoVariant || theme.autoVariant.enabled !== true) return 'not configured';

    const variants = Array.isArray(theme.variants) ? theme.variants : [];
    const ids = variants.map(function (variant) {
      return variant.id;
    });
    const missing = [];

    if (!ids.includes(theme.autoVariant.light)) missing.push('light: ' + theme.autoVariant.light);
    if (!ids.includes(theme.autoVariant.dark)) missing.push('dark: ' + theme.autoVariant.dark);

    if (missing.length > 0) return 'misconfigured, missing ' + missing.join(', ');

    return 'ok';
  }

  function reloadInjectedCssFromDebug() {
    applyTheme();
    keepStyleLast();
    rerenderSettingsDialog();
    showDebugDialog();
  }

  function getActiveCssFiles(settings, theme) {
    const files = [];

    if (!theme || theme.id === DEFAULT_THEME_ID) return files;

    if (CATALOG.globalImports) {
      files.push('global-imports.css');
    }

    if (Array.isArray(theme.sharedCssFiles)) {
      theme.sharedCssFiles.forEach(function (sharedFile) {
        files.push('themes/shared/' + sharedFile.file);
      });
    }

    files.push('themes/' + theme.id + '/base.css');

    const variantId = getEffectiveVariantId(settings, theme);
    const variant = Array.isArray(theme.variants) ? theme.variants.find(function (item) {
      return item.id === variantId;
    }) : null;

    if (variant && variant.file) {
      files.push('themes/' + theme.id + '/' + variant.file);
    }

    const selectedThemeOptions = new Set(selectedThemeOptionsFor(settings, theme));
    const themeOptions = Array.isArray(theme.options) ? theme.options : [];
    themeOptions.forEach(function (option) {
      if (selectedThemeOptions.has(option.id)) {
        files.push('themes/' + theme.id + '/' + option.file);
      }
    });

    const selectedGlobalOptions = new Set(settings.globalOptions || []);
    globalOptions().forEach(function (option) {
      if (selectedGlobalOptions.has(option.id)) {
        files.push('global-options/' + option.file);
      }
    });

    return files;
  }

  function getAutoVariantDebugText(settings, theme) {
    const autoSettings = getAutoVariantSettings(settings, theme);

    if (!autoSettings) return 'not available';
    if (autoSettings.enabled !== true) return 'available, disabled';

    return 'enabled, dark ' + autoSettings.darkStart + '–' + autoSettings.darkEnd + ', effective ' + getEffectiveVariantId(settings, theme);
  }

  function getSavedVariantDebugText(settings, theme) {
    if (!theme || theme.id === DEFAULT_THEME_ID) return 'none';

    const savedVariant = settings.variants && settings.variants[theme.id] ? settings.variants[theme.id] : '';
    const variants = Array.isArray(theme.variants) ? theme.variants : [];

    if (!savedVariant) return 'none saved';
    if (variants.some(function (variant) { return variant.id === savedVariant; })) return savedVariant;

    return savedVariant + ' (missing, fallback: ' + selectedVariantFor(settings, theme) + ')';
  }

  function getLiveCssStatus() {
    const saved = readLiveCss();
    const style = document.getElementById(LIVE_CSS_STYLE_ID);
    const cssText = style ? style.textContent : '';

    return {
      saved: saved.length > 0,
      savedLength: saved.length,
      active: cssText.length > 0,
      activeLength: cssText.length,
      activeLines: cssText ? cssText.replaceAll('\\r\\n', '\\n').replaceAll('\\r', '\\n').split('\\n').length : 0
    };
  }

  function getSettingsStorageStatus() {
    const raw = localStorage.getItem(STORAGE_KEY);

    return {
      saved: raw !== null,
      size: raw ? raw.length : 0
    };
  }

  function clearSavedSettingsFromDebug() {
    if (!window.confirm('Clear all saved ' + PLUGIN_NAME + ' settings? This will reset the plugin as if freshly installed.')) return;

    localStorage.removeItem(STORAGE_KEY);
    applyTheme();
    rerenderSettingsDialog();

    const existingDebugDialog = document.querySelector('.testtheme-debug-dialog');
    if (existingDebugDialog && existingDebugDialog.closest('.ui-dialog')) {
      existingDebugDialog.closest('.ui-dialog').remove();
    }

    showDebugDialog();
  }

  function showDebugDialog() {
    if (bringDialogToFront('.testtheme-debug-dialog')) return;

    const settings = readSettings();
    const theme = getTheme(settings.theme);
    const styleStatus = getThemeStyleStatus();
    const storageStatus = getSettingsStorageStatus();
    const liveCssStatus = getLiveCssStatus();
    const activeCssFiles = getActiveCssFiles(settings, theme);

    const content = makeElement('div', {
      className: 'testtheme-debug-dialog'
    });

    content.appendChild(makeElement('h3', {
      textContent: 'Theme status'
    }));
    appendDebugRow(content, 'Selected theme', theme ? theme.name : 'none');
    appendDebugRow(content, 'Current time', getCurrentLocalTimeString());
    appendDebugRow(content, 'Selected variant', theme ? getEffectiveVariantLabel(settings, theme) : 'none');
    appendDebugRow(content, 'Saved variant', theme ? getSavedVariantDebugText(settings, theme) : 'none');
    appendDebugRow(content, 'Auto config', theme ? getAutoVariantConfigStatus(theme) : 'none');
    appendDebugRow(content, 'Auto light/dark', theme ? getAutoVariantDebugText(settings, theme) : 'none');
    appendDebugRow(content, 'Theme options', theme ? selectedThemeOptionsFor(settings, theme).join(', ') || 'none' : 'none');
    appendDebugRow(content, 'Global options', (settings.globalOptions || []).join(', ') || 'none');
    appendDebugRow(content, 'Theme style element', styleStatus.found ? 'found' : 'missing');
    appendDebugRow(content, 'Theme style last in target', styleStatus.lastInTarget ? 'yes' : 'no');
    appendDebugRow(content, 'Style parent', styleStatus.parentTag);
    appendDebugRow(content, 'Injected CSS characters', styleStatus.cssLength);
    appendDebugRow(content, 'Injected CSS lines', styleStatus.cssLines);
    appendDebugRow(content, 'Settings saved', storageStatus.saved ? 'yes' : 'no');
    appendDebugRow(content, 'Settings size', storageStatus.size + ' characters');
    appendDebugRow(content, 'Storage key', STORAGE_KEY);
    appendDebugRow(content, 'Live CSS active', liveCssStatus.active ? 'yes' : 'no');
    appendDebugRow(content, 'Live CSS saved', liveCssStatus.saved ? 'yes' : 'no');
    appendDebugRow(content, 'Live CSS characters', liveCssStatus.activeLength);
    appendDebugRow(content, 'Live CSS lines', liveCssStatus.activeLines);

    if (theme && Array.isArray(theme.sharedCssFiles)) {
      appendDebugRow(content, 'Shared CSS files', theme.sharedCssFiles.map(function (item) {
        return item.file;
      }).join(', ') || 'none');
    }

    content.appendChild(makeElement('h3', {
      textContent: 'Active CSS files'
    }));

    if (activeCssFiles.length === 0) {
      appendDebugRow(content, 'Files', 'none');
    } else {
      const activeFilesBox = makeElement('textarea', {
        className: 'testtheme-debug-textarea',
        readonly: 'readonly'
      });
      activeFilesBox.value = activeCssFiles.join('\\n');
      content.appendChild(activeFilesBox);
    }

    content.appendChild(makeElement('h3', {
      textContent: 'CSS order'
    }));
    appendDebugRow(content, '1', 'global-imports.css');
    appendDebugRow(content, '2', 'selected theme shared CSS files');
    appendDebugRow(content, '3', 'selected theme base.css');
    appendDebugRow(content, '4', 'selected variant CSS');
    appendDebugRow(content, '5', 'selected theme option CSS');
    appendDebugRow(content, '6', 'selected global option CSS');

    const buttonRow = makeElement('div', {
      className: 'testtheme-debug-button-row'
    });

    const reloadButton = makeElement('button', {
      type: 'button',
      textContent: 'Reload injected CSS',
      className: 'testtheme-reload-css-button'
    });
    reloadButton.addEventListener('click', reloadInjectedCssFromDebug);

    const clearButton = makeElement('button', {
      type: 'button',
      textContent: 'Clear saved settings',
      className: 'testtheme-clear-settings-button'
    });
    clearButton.addEventListener('click', clearSavedSettingsFromDebug);

    buttonRow.appendChild(reloadButton);
    buttonRow.appendChild(clearButton);
    content.appendChild(buttonRow);

    if (window.dialog) {
      window.dialog({
        html: content,
        title: PLUGIN_NAME + ' Debug',
        width: 'auto'
      });
      return;
    }

    alert('Debug information is only available inside IITC dialogs.');
  }

  function addDebugButtonToSettingsDialog() {
    if (!activeSettingsDialog || typeof activeSettingsDialog.closest !== 'function') return false;

    const dialogRoot = activeSettingsDialog.closest('.ui-dialog');
    if (!dialogRoot) return false;

    const buttonSet = dialogRoot.querySelector('.ui-dialog-buttonset');
    if (!buttonSet) return false;

    const buttonId = PLUGIN_ID + '-debug-dialog-button';
    if (dialogRoot.querySelector('#' + buttonId)) return true;

    const debugButton = document.createElement('button');
    debugButton.id = buttonId;
    debugButton.type = 'button';
    debugButton.textContent = 'Debug';
    debugButton.className = 'testtheme-debug-button ui-button ui-corner-all ui-widget';

    debugButton.addEventListener('click', function (event) {
      event.preventDefault();
      showDebugDialog();
    });

    buttonSet.insertBefore(debugButton, buttonSet.firstChild);
    return true;
  }

  function addExtraButtonsToSettingsDialogWhenReady() {
    if (addAboutButtonToSettingsDialog() && addDebugButtonToSettingsDialog() && addLiveCssButtonToSettingsDialog()) return;

    let attempts = 0;
    const timer = window.setInterval(function () {
      attempts += 1;

      const aboutReady = addAboutButtonToSettingsDialog();
      const debugReady = addDebugButtonToSettingsDialog();
      const liveCssReady = addLiveCssButtonToSettingsDialog();

      if ((aboutReady && debugReady && liveCssReady) || attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 50);
  }

  function showLiveCssDialog() {
    if (bringDialogToFront('.testtheme-live-css-dialog')) return;

    const savedLiveCss = readLiveCss();
    const currentThemeStyle = document.getElementById(STYLE_ID);
    const activeLiveStyle = document.getElementById(LIVE_CSS_STYLE_ID);

    const textarea = makeElement('textarea', {
      className: 'testtheme-live-css-textarea',
      spellcheck: 'false'
    });
    textarea.value = activeLiveStyle && activeLiveStyle.textContent ? activeLiveStyle.textContent : savedLiveCss;

    const status = makeElement('p', {
      className: 'testtheme-live-css-status',
      textContent: savedLiveCss ? 'Saved live CSS is active.' : 'Live CSS is temporary until you click Save.'
    });

    function updateStatus(message) {
      status.textContent = message;
    }

    const applyButton = makeElement('button', {
      type: 'button',
      textContent: 'Apply',
      className: 'testtheme-live-css-apply-button'
    });
    applyButton.addEventListener('click', function () {
      applyLiveCss(textarea.value);
      updateStatus('Applied live CSS temporarily.');
    });

    const saveButton = makeElement('button', {
      type: 'button',
      textContent: 'Save',
      className: 'testtheme-live-css-save-button'
    });
    saveButton.addEventListener('click', function () {
      writeLiveCss(textarea.value);
      applyLiveCss(textarea.value);
      updateStatus('Saved and applied live CSS.');
    });

    const clearButton = makeElement('button', {
      type: 'button',
      textContent: 'Clear',
      className: 'testtheme-live-css-clear-button'
    });
    clearButton.addEventListener('click', function () {
      if (!window.confirm('Clear saved and active Live CSS?')) return;

      textarea.value = '';
      clearLiveCss();
      applyLiveCss('');
      updateStatus('Cleared saved and active live CSS.');
    });

    const loadCurrentButton = makeElement('button', {
      type: 'button',
      textContent: 'Load current injected CSS',
      className: 'testtheme-live-css-load-current-button'
    });
    loadCurrentButton.addEventListener('click', function () {
      textarea.value = currentThemeStyle ? currentThemeStyle.textContent : '';
      updateStatus('Loaded current injected theme CSS into the editor. Copy only the changes you want.');
    });

    const buttonRow = makeElement('div', {
      className: 'testtheme-live-css-button-row'
    }, [
      applyButton,
      saveButton,
      clearButton,
      loadCurrentButton
    ]);

    const content = makeElement('div', {
      className: 'testtheme-live-css-dialog'
    }, [
      makeElement('p', {
        className: 'testtheme-live-css-warning',
        textContent: 'Development tool: Live CSS is for testing only. Copy final changes into source CSS files before release.'
      }),
      textarea,
      buttonRow,
      status
    ]);

    if (window.dialog) {
      window.dialog({
        html: content,
        title: PLUGIN_NAME + ' Live CSS',
        width: 'auto'
      });
      return;
    }

    alert('Live CSS editor is only available inside IITC dialogs.');
  }

  function addLiveCssButtonToSettingsDialog() {
    if (!activeSettingsDialog || typeof activeSettingsDialog.closest !== 'function') return false;

    const dialogRoot = activeSettingsDialog.closest('.ui-dialog');
    if (!dialogRoot) return false;

    const buttonSet = dialogRoot.querySelector('.ui-dialog-buttonset');
    if (!buttonSet) return false;

    const buttonId = PLUGIN_ID + '-live-css-dialog-button';
    if (dialogRoot.querySelector('#' + buttonId)) return true;

    const liveCssButton = document.createElement('button');
    liveCssButton.id = buttonId;
    liveCssButton.type = 'button';
    liveCssButton.textContent = 'Live CSS';
    liveCssButton.className = 'testtheme-live-css-button ui-button ui-corner-all ui-widget';

    liveCssButton.addEventListener('click', function (event) {
      event.preventDefault();
      showLiveCssDialog();
    });

    buttonSet.insertBefore(liveCssButton, buttonSet.firstChild);
    return true;
  }

  function showSettings() {
    const content = createSettingsDialog();

    if (window.dialog) {
      window.dialog({
        html: content,
        title: PLUGIN_NAME,
        width: 'auto'
      });
      addExtraButtonsToSettingsDialogWhenReady();
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
      const liveStyle = document.getElementById(LIVE_CSS_STYLE_ID);
      const target = document.documentElement || document.head || document.body;

      if (style && target && style.parentNode !== target) {
        target.appendChild(style);
      }

      if (liveStyle && target && liveStyle.parentNode !== target) {
        target.appendChild(liveStyle);
      }

      if (style && liveStyle && target && liveStyle.previousElementSibling !== style) {
        target.appendChild(style);
        target.appendChild(liveStyle);
        return;
      }

      if (style && !liveStyle && target && target.lastElementChild !== style) {
        target.appendChild(style);
      }

      if (liveStyle && target && target.lastElementChild !== liveStyle) {
        target.appendChild(liveStyle);
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

  function startAutoVariantTimer() {
    window.setInterval(function () {
      const settings = readSettings();
      const theme = getTheme(settings.theme);
      const autoSettings = getAutoVariantSettings(settings, theme);

      if (autoSettings && autoSettings.enabled === true) {
        applyTheme();
        rerenderSettingsDialog();
      }
    }, 60 * 1000);
  }

  function setup() {
    ensureSettingsUiCss();
    applyTheme();
    addToolboxButtonWhenReady();
    keepStyleLast();
    startAutoVariantTimer();
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
