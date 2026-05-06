# TestTheme2

Standalone IITC theme selector and CSS injector.

This repo builds a userscript that works without any runtime dependencies:

- no `iitcpluginkit`
- no `iitc-kuku-helper-handlebars`
- no `iitc-theme-chooser`

## UI behavior

Inside IITC, click the **TestTheme2** toolbox button.

The settings window shows:

- a `hello` description at the top
- theme preview cards on the left
- each preview is displayed at 250×166 px
- the theme title is shown under each preview
- `Default`, which turns off all injected CSS and options
- per-theme variants on the right
- per-theme options on the right
- global options on the right

## Theme folders

Every folder in `themes/` is automatically compiled as a selectable theme.

```text
themes/
  my-theme/
    theme.json
    preview.svg
    base.css
    variants/
      light.css
      dark.css
    options/
      blur.css
      compact.css
```

Required:

- `base.css`

Optional:

- `theme.json`
- `preview.svg`, `preview.png`, `preview.jpg`, `preview.jpeg`, or `preview.webp`
- `variants/*.css`
- `options/*.css`

## Special global imports

Use this file for CSS `@import` rules:

```text
global-imports.css
```

The contents of `global-imports.css` are always placed at the very top of the injected CSS whenever anything other than **Default** is selected. This keeps `@import` rules valid.

## Global options

Global options go in:

```text
global-options/
  blur.css
  rounded-panels.css
```

These are available no matter which non-default theme is selected.

## Add a new theme

Create:

```text
themes/my-new-theme/base.css
```

Optionally add:

```text
themes/my-new-theme/theme.json
themes/my-new-theme/preview.svg
themes/my-new-theme/variants/light.css
themes/my-new-theme/variants/dark.css
themes/my-new-theme/options/blur.css
```

GitHub Actions will automatically discover and compile it on push.

## Local build

```bash
npm run build
```

The generated userscript appears in `dist/`.

## GitHub Pages

Enable Pages:

Settings → Pages → Build and deployment → Source: GitHub Actions

After every push to `main`, the workflow builds and deploys:

```text
/files/release/iitc_plugin_TestTheme2.user.js
/files/release/iitc_plugin_TestTheme2.meta.js
```
