# TestTheme2

Standalone IITC theme plugin.

This repo builds a userscript that works without any runtime dependencies:

- no `iitcpluginkit`
- no `iitc-kuku-helper-handlebars`
- no `iitc-theme-chooser`

It provides its own small theme selector inside IITC and injects the selected CSS directly into the Intel map page.

## How themes work

Each folder in `themes/` is automatically treated as a selectable theme.

```text
themes/
  my-theme/
    theme.json
    base.css
    options/
      compact.css
      high-contrast.css
```

Required:

- `base.css`

Optional:

- `theme.json` for display metadata
- `options/*.css` for toggleable options

GitHub Actions automatically discovers any new folder you add under `themes/`, compiles the CSS into the userscript, and deploys the result to GitHub Pages.

## Add a new theme

Create a new folder:

```text
themes/my-new-theme/
```

Add:

```text
themes/my-new-theme/base.css
```

Optional metadata:

```json
{
  "name": "My New Theme",
  "description": "Short description"
}
```

Optional toggles:

```text
themes/my-new-theme/options/compact.css
themes/my-new-theme/options/big-font.css
```

Run locally:

```bash
npm run build
```

The generated userscript will appear in `dist/`.

## GitHub Pages

Enable Pages:

Settings → Pages → Build and deployment → Source: GitHub Actions

After every push to `main`, the workflow builds and deploys:

```text
/files/release/iitc_plugin_TestTheme2.user.js
/files/release/iitc_plugin_TestTheme2.meta.js
```

## In IITC

Open IITC, then use the **TestTheme2** button in the IITC toolbox to:

- enable/disable theme injection
- choose a theme
- toggle CSS options
- reset settings

The plugin keeps the injected CSS at the end of `<head>`, so it is loaded after IITC’s existing styles and can override them.
