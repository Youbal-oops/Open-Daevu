<!-- Youbal said to fix: add contribution priorities, reproducible checks and honest AI-assistance guidance. -->
# Contributing

Daevu's core feature set is complete. The priorities are bug fixes, performance, reliability and compatibility. Prefer plugins and project apps for new functionality. Open an issue before a substantial core/API change so its scope can be discussed.

## Report a problem

Use the [issue templates](https://github.com/Youbal-oops/Open-Daevu/issues/new/choose). Include the app version, installer/portable/source build, Windows version, steps, expected result and actual result. For performance problems, include approximate project/data size and timings when possible. Use a minimal synthetic example instead of sharing private work. Sensitive issues follow [SECURITY.md](SECURITY.md).

## Make a change

1. Create a branch from public `main`; keep unrelated changes separate.
2. Set up Node.js 24 on Windows and run `npm ci`.
3. Keep changes focused. Explain the trigger, changed behavior and any remaining limits.
4. Add a regression test when it meaningfully captures the defect. Documentation-only edits normally need the documentation check, not new application tests.
5. Run the checks appropriate to the change and report their actual results:

```powershell
npm run check:docs
npm test
npm run build
# For renderer or native integration changes, after building:
npm run test:ui
```

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for additional native checks. A passing unit suite is not evidence that a packaged installer, provider sign-in or paid request was tested. If a check fails or cannot run, say so. Do not publish a new release as part of an ordinary fix PR.

## AI assistance and review

Extensive AI coding assistance was used to build Daevu. AI-assisted contributions are welcome; there is no need to disguise their origin. Describe assistance when it affects review, and check the resulting diff, dependencies and behavior. Do not submit invented test results, source citations, contributors or claims of personal review.

Attribute a requested correction to its actual requester. This repository-cleanup request is recorded as **“Youbal said to fix”** in its audit and commit. That attribution records the request; it does not claim Youbal personally performed the code review or tests.

## Repository conventions

- Keep installation and scope in README, procedures in the guide, SDK/package details in PLUGINS, and provider setup in ACCOUNT-CONNECTIONS. Link to the canonical explanation instead of maintaining conflicting copies.
- Update docs when commands, navigation, limits or permissions change. Treat versioned validation notes as historical evidence; append context rather than deleting technical records.
- Keep generated `dist/`, `release/`, dependency folders, test profiles and credentials out of source control. Documentation screenshots and build icons are intentional tracked assets.
- Preserve licensing, trademarks and visual identity. Include only third-party code/assets you have the right to contribute.
- Do not rewrite published history or move existing release tags. Use normal commits for corrections.
