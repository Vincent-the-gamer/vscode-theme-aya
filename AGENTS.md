# AGENTS.md

## Project Overview

**VSCode Theme Aya** — A Murasame-style VSCode theme extension inspired by the character Aya from _Senren \* Banka_. It provides light/dark themes and a "Bladelight" feature that patches VSCode's workbench HTML to inject custom CSS/JS for glow effects and a custom logo.

## Tech Stack

- **TypeScript** (ES modules)
- **tsdown** — bundler (builds `src/index.ts` → `dist/index.mjs`)
- **npm** — package manager
- **@vscode/vsce** — packaging & publishing to VSCode Marketplace

## Project Structure

```
vscode-theme-aya/
├── src/
│   ├── index.ts        # Extension entry point (activate/deactivate, workbench patching)
│   ├── messages.ts     # UI message strings
│   └── statusbar.ts    # Status bar indicator for Bladelight
├── themes/
│   ├── aya-dark.json   # Dark theme color definitions
│   └── aya-light.json  # Light theme color definitions
├── bladelight.css      # CSS for the glow/bladelight effect
├── tsconfig.json       # TypeScript config
├── tsdown.config.ts    # Bundler config
├── package.json        # Extension manifest (VSCode contributes, scripts, deps)
└── env.d.ts            # Ambient type declarations
```

## Key Commands

| Command            | Description                      |
| ------------------ | -------------------------------- |
| `npm run build`    | Bundle the extension with tsdown |
| `npm run pack`     | Package `.vsix` via vsce         |
| `npm run publish`  | Publish to VSCode Marketplace    |
| `npx tsc --noEmit` | Type-check without emitting      |

## Architecture Notes

- **Bladelight** works by locating VSCode's `workbench.html`, creating a backup, then injecting `<style>`/`<script>` tags into `<head>` and a status indicator script into `<body>`.
- The `aya.imports` setting accepts an array of URLs (CSS or JS). File URLs require the `file://` scheme.
- A session UUID is embedded in the HTML as a comment marker to track which backup corresponds to the current patch.
- `tsconfig.json` uses `moduleResolution: "bundler"` and excludes `tsdown.config.ts` to avoid type resolution issues with the bundler config.

## Conventions

- Keep changes minimal and consistent with the existing code style.
- Do not add new dependencies unless explicitly requested.
- TypeScript strict mode is enabled — fix type errors at the root cause, not with `any` casts (except where unavoidable, e.g., `globalThis` access).
- The extension targets VSCode `^1.120.0`.
