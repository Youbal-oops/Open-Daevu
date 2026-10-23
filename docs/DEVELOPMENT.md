# Development

Use Windows x64 and Node.js 24, as in [the Windows workflow](../.github/workflows/windows.yml). Clone the repository and run `npm ci`; the committed lockfile records dependencies. This audit did not establish compatibility with every Node or Windows version.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite plus the Electron application |
| `npm run dev:web` | Browser-only preview, using browser local storage |
| `npm run build` / `npm start` | Build the frontend / launch Electron against that build |
| `npm run check:docs` | Check local Markdown/HTML links, heading fragments and repository documentation invariants |
| `npm test` | Node test suite using local fixtures; no paid provider inference |
| `npm run test:ui` | Real main-process/renderer smoke test against a temporary profile; build first |
| `npm run test:web-chat` | Native website/composer fixture checks |
| `npm run test:welcome` | Native onboarding checks; build first |
| `node scripts/test-sheet.cjs` | Spreadsheet renderer fixture |
| `node scripts/test-canvas-shelf.cjs` | Workspace/pull-out renderer fixture |
| `node scripts/test-app-launch.cjs` | App-window and shortcut checks with a temporary profile; build first |
| `npm run dist:win` | Installer and portable packaging; outputs to ignored `release/` |

Some native scripts require a Windows desktop session. Read a script before running it on another platform. The default test command uses Node's default concurrency; to diagnose resource-sensitive failures, run `node --test --test-concurrency=2 tests/*.test.cjs` and record that choice. Do not replace a failing result with a claimed pass from an older run.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/` | React renderer, editor/canvas/calendar, app studio and host-side SDK bridges |
| `shared/` | Domain validation, formulas, blocks, schemas and shared calculations |
| `electron/main.cjs`, `preload.cjs` | Desktop startup, windows, IPC and native operations |
| `electron/store.cjs`, `storage.cjs`, `drive-sync.cjs` | Local persistence, storage switching and shared Drive format |
| `electron/accounts.cjs`, `providers.cjs`, `runner.cjs`, `mcp*.cjs` | Credentials, provider adapters, agent runs and MCP |
| `electron/app-projects.cjs`, `app-builder.cjs`, `app-windows.cjs` | Project app sources, compilation, publishing and windows |
| `electron/plugins.cjs`, `plugin-*.cjs` | Plugin installation, SDK operations and native website panels |
| `bundled-plugins/`, `plugin-examples/` | Optional extensions and examples, not fresh-workspace content |
| `tests/`, `scripts/` | Automated fixtures, checks, packaging and documentation media tools |
| `build/` | Required icons, installer configuration and font license; keep tracked |
| `docs/assets/` | Intentional documentation images/video; keep tracked |
| `dist/`, `release/`, `.test-data/` | Generated output/profiles; keep untracked |

The app packages the allowlisted runtime paths in `package.json`, not the entire repository. Check packaging separately from development behavior; esbuild's ASAR path and bundled plugins are packaging-sensitive.

## Documentation ownership

[AGENTS.md](../AGENTS.md) gives repository-wide instructions for AI agents, including the required manual user review before every commit.

- [README](../README.md): purpose, status, installation and entry points.
- [Guide](GUIDE.md): current usage, limits and app SDK procedures.
- [Plugins](../PLUGINS.md): manifests, permissions, SDK and package limits.
- [Account connections](../ACCOUNT-CONNECTIONS.md): connection setup and verification limits.
- [Release context](RELEASE-NOTES.md): published release links and corrections to older claims.
- [Releasing](RELEASING.md): prospective release checks, not evidence of completed checks.
- [Validation](../VALIDATION.md): preserved historical records, including private-development versions.
- [Audit](PUBLIC-REPOSITORY-AUDIT.md): source evidence, changes and remaining concerns from this cleanup.

When changing a behavior, update its canonical explanation and link from other documents. Keep past test counts attached to their original context. A maintained guide should not require readers to assemble current behavior from old release notes.
