# Public repository audit — 23 October 2026

This audit reviews public-facing documentation, consistency and repository hygiene. It used AI assistance, source inspection and automated checks. Source evidence and actual test results are recorded below; they do not imply that the maintainer personally performed those checks.

## Scope and baseline

The review covers the tracked repository inventory, every tracked Markdown document, the six public release notes available at audit time, GitHub workflow configuration, and source paths supporting the documented features. It is a documentation/maintainability review with focused code tracing, not a complete line-by-line security review or certification of service compatibility.

The branch starts at public `main`, commit `100e504` (source version 2.0.7). The earlier local-only bug/performance commit `c44d5fe` remains on local `main` and is intentionally excluded from this PR. Its fixes must not be described as shipped public behavior by this audit.

Public Git history contains 15 reachable commits and starts with the 1.0.0 commit dated 20 October 2026. Youbal's roughly six-week private development period is a maintainer-supplied account, not something reconstructed or independently dated from public commits. No commits, contributors, milestones, tags or historical test results were invented or rewritten.

## Contradictions resolved

| Earlier claim | Correction | Source evidence |
| --- | --- | --- |
| Nothing leaves the computer unless explicitly sent | Packaged updates make automatic GitHub requests; providers, browser/MCP and optional Drive use their services | [main](../electron/main.cjs), [updates](../electron/updates.cjs), [providers](../electron/providers.cjs) |
| Drive always permits only one computer; sync happens only on opening | Distinguish legacy advisory sessions from optional shared-editing change logs, outboxes and conflict review | [storage](../electron/storage.cjs), [sync](../electron/drive-sync.cjs) |
| Plugins and all SDK storage are always device-local | Drive mode locates plugin packages/registry/settings/storage in the workspace; website cookies stay local | [plugin initialization](../electron/main.cjs), [plugin storage](../electron/plugins.cjs), [website sessions](../electron/plugin-web.cjs) |
| Connections/Plugins/Tools are sidebar pages | Use the profile menu; keep Settings' current section names | [profile menu/settings](../src/settings.jsx) |
| Notes still have Markdown edit/preview; supported uploads only open externally | Block editing and in-app viewers exist; document each format's actual limits | [editor](../src/main.jsx), [viewers](../src/file-viewer.jsx) |
| All Word originals survive import | A successful Word conversion skips retaining the original in this public baseline | [files:import](../electron/main.cjs), [conversion](../electron/doc-convert.cjs) |
| Imported overflow survives CSV/export; the grid stops at 1,000 rows | Import caps are 10,000 rows, 256 columns and 24 sheets; virtualized editing is a separate limit | [import](../electron/sheet-files.cjs), [grid](../src/sheet.jsx), [workbook](../shared/workbook.mjs) |
| Shared history is never compacted | Startup attempts compaction for sufficiently large shared logs | [startup](../electron/main.cjs), [compact](../electron/drive-sync.cjs) |
| MCP writes always ask | Explicit Always allow all tools policy also allows writes/unclassified calls | [MCP policy](../electron/mcp.cjs) |
| Every plugin contribution is an opaque sandbox page | Themes/functions are declarative; browser scripts/tools run in web-page context | [schemas](../shared/plugins.mjs), [browser](../electron/browser.cjs) |
| Apps are single HTML files or only support Three/Phaser | Current studio uses multiple files; builder also supports React/React DOM | [studio sources](../electron/app-projects.cjs), [builder](../electron/app-builder.cjs) |
| Voice is absent everywhere because it was absent in 0.3.0 | Direct account agents lack voice; optional websites can expose their own voice controls | [provider adapters](../electron/providers.cjs), [website controls](../electron/web-chat-page.cjs) |
| Branch/tag pushes automatically build releases | Existing Windows workflow is manual dispatch; only tag-ref dispatches attach release assets | [Windows workflow](../.github/workflows/windows.yml) |
| Historical validation counts prove today's status | Preserve original records and label them historical; record this run separately | [validation](../VALIDATION.md) |

The [release context](RELEASE-NOTES.md) also distinguishes export-time formula-name rewriting from editor sheet renaming, and flags the old web-fetch private-network claim as an intended restriction with known gaps. Published release notes and assets were not edited.

## Change ledger

The table records the files changed in the documentation cleanup and the purpose of each change.

| Files | Change |
| --- | --- |
| [README](../README.md) | Purpose, installation, core versus integrations, extension architecture, stabilization direction, private-development/AI history, limitations and contributor links |
| [GUIDE](GUIDE.md) | Correct current navigation/limits/storage/permissions while retaining technical SDK examples |
| [ACCOUNT-CONNECTIONS](../ACCOUNT-CONNECTIONS.md), [PLUGINS](../PLUGINS.md) | Resolve setup/tool/voice/storage claims and distinguish sandbox types |
| [VALIDATION](../VALIDATION.md) | Add a historical-scope preface; preserve every byte of the original text after it |
| [RELEASING](RELEASING.md), [RELEASE-NOTES](RELEASE-NOTES.md) | Manual workflow, real packaged checks, new-tag-only publication and historical context |
| [CONTRIBUTING](../CONTRIBUTING.md), [DEVELOPMENT](DEVELOPMENT.md) | Focused contributions, AI transparency, source map, command ownership and actual test reporting |
| [SECURITY](../SECURITY.md), [.gitignore](../.gitignore) | Reporting fallback, trust boundaries and local credential/profile/signing exclusions |
| [Issue templates](../.github/ISSUE_TEMPLATE), [PR template](../.github/pull_request_template.md) | Environment/reproduction/timing details, sensitive-data guidance and review evidence |
| [Checker](../scripts/check-docs.cjs), [checker tests](../tests/documentation.test.cjs), [docs workflow](../.github/workflows/docs.yml), [package script](../package.json) | Dependency-free local link/case/heading checks and version consistency, run on PRs |
| [Agent instructions](../AGENTS.md) | Repository-wide guidelines and explicit manual user review before every AI-created commit |
| This report | Source evidence, scope, actual results, outstanding concerns and limits |

No production implementation, license/trademark text, visual asset, release binary or generated distribution file was changed. Build icons/installer sources and documentation images/video are intentional tracked assets and were retained.

## Hygiene review

A local pattern scan inspected **396 text blobs reachable from public main across all 15 commits**. It looked for private-key headers, recognizable GitHub/provider tokens, AWS access-key IDs, credential literals and personal home paths. No high-confidence key/token match was found. The 13 credential-literal candidates came from mocked account/MCP tests; two home-path regex candidates were JavaScript/UI-test syntax, not personal directories. Test fixtures were retained.

This limited scan is not proof that no credential was ever exposed. It did not inspect unreachable Git objects, other remote branches, forks, GitHub secret-scanning alerts, issue attachments or release installers. Five documentation JPEGs were visually inspected and show sample project/agent data; binary payloads, all animation/video frames and embedded media metadata were not exhaustively inspected. No confirmed historical credential exposure was identified that could be truthfully reported as requiring rotation. If one is found, revoke/rotate it and coordinate remediation; a normal deletion does not erase prior copies. Public Git author metadata remains unchanged and is not reproduced here.

No tracked credential vault, OAuth client JSON, private signing key, `node_modules`, generated `dist` or release EXE path was found. The largest tracked file is the intentional app demonstration GIF (about 3.6 MB). Gitignore changes prevent common local artifacts; they do not remove previously tracked content. Third-party/legal records were read and retained, not relicensed or certified as a complete transitive-license inventory.

GitHub's private vulnerability-reporting API returned **enabled: false** on 23 October 2026. Enabling a private channel or publishing a verified private contact remains a maintainer action; no settings were changed. The current security document gives a minimal public channel-request fallback without sensitive details.

## Verification

The initial cleanup commands below ran in this branch/worktree on Windows with Node.js 24.12.0 and the existing installed dependencies. A fresh `npm ci` was not run. These results describe that revision; the agent-guidance follow-up is recorded separately below.

| Check | Actual result |
| --- | --- |
| `npm run check:docs` | Passed: **14 Markdown files, 104 local links** |
| `npm test` | Passed: **300 tests**, 0 failures, default Node concurrency; includes two new checker regression tests |
| `npm run build` | Passed in 22 seconds; existing Vite large-chunk advisory remains |
| YAML parsing | Both workflows and all three issue-template/config YAML files parsed with the already-installed `js-yaml`; no new dependency added |
| History preservation | Original validation body retained exactly after the preface; legal/trademark records unchanged after accounting for checkout line endings |
| Gitignore probes | Credential vault, OAuth JSON, signing key, local Codex auth, workspace and temporary test paths are ignored |
| `git diff --check` | Passed; checkout line-ending advisories only |

The first documentation-check run identified unfinished audit links and a README heading mismatch; these were corrected. The initial historical-body check caught newline normalization, so the body was restored directly from the original Git blob. A raw-byte comparison of untouched legal files also encountered Windows checkout line endings; normalized text and the Git diff establish that they were not edited. No failing result is being substituted with an older run.

Documentation checks cover local targets, path case for GitHub/Linux compatibility, heading fragments and package-version consistency. They do not validate all external HTTP links or every Markdown dialect. Native UI/provider tests and installer packaging were not re-run for this documentation-only change. The docs workflow’s [first PR run](https://github.com/Youbal-oops/Open-Daevu/actions/runs/39978291601) passed on commit `fe37d77`. This is remote evidence for that revision, not a packaged-application check.

## Outstanding concerns and unverified claims

- This PR documents rather than repairs application defects. In particular, the public source still has known web-fetch/address-validation gaps, broad plain-JSON action fallback, plugin URL-matching problems and updater integrity limitations. Existing issues and the separate local bug-fix work track those changes.
- Large document/sheet/chart performance, import truncation/save limits, Word image loss, file-edit restore, note dependency moves and inline-picture cleanup remain implementation concerns. No new functionality was added to address them here.
- The Claude API prompt conflicts with its supplied built-in file tools; the connection guide now states that inconsistency instead of saying the tools do not exist.
- No new installer, portable binary, release tag or historical version was built/published by this documentation PR. Windows compatibility across versions, ASAR packaging and signed-in provider websites were not revalidated by this audit.
- Official OpenAI sign-in and CLI references were opened during the audit. Their documented flows are not evidence that any particular account is eligible. Live Google/Claude/MCP consent, paid inference, website composer/voice behavior and every custom API were not tested.
- Historic validation entries are reports from prior work, not independent proof of every claimed milestone. The private six-week timeline is explicitly attributed to Youbal.
- [Third-party notices](../THIRD-PARTY-NOTICES.md) remain unchanged; `npm ls --all` displays the package tree, not a complete legal compliance report. A deeper license inventory and binary/media metadata review are separate work.

## Agent-guidance follow-up

The follow-up removes requester-attribution labels from the current files and introduces [AGENTS.md](../AGENTS.md) as the repository-wide AI-agent policy. CONTRIBUTING, DEVELOPMENT and the PR template link or reinforce the policy. It requires the requesting user to review the final diff and explicitly approve it before any AI-created commit, including documentation or tooling changes. These edits remain uncommitted pending that review; existing commits and tags are unchanged.

For this follow-up, `npm run check:docs` passed and both documentation-check regression tests passed. `git diff --check` passed. The application suite and build were not rerun for comment removal and documentation-only policy edits; the 300-test/build results above belong to the initial cleanup revision.
