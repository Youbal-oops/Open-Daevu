# Releasing

Releases are published on this repository's Releases page.

```powershell
npm version patch        # or minor / major
npm ci
npm test
npm run dist:win         # Setup and Portable installers appear in release/
gh release create vX.Y.Z release/*.exe --title vX.Y.Z --generate-notes
```

The GitHub Actions workflow (Actions, Build Windows app, Run workflow) builds the same installers on a clean machine if you would rather not build locally.

## Good to know

- The build is unsigned, so Windows shows a warning on first run. A code-signing certificate removes it.
- The Daevu name and logo are covered by [TRADEMARKS.md](../TRADEMARKS.md).
