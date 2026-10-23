<!-- Youbal said to fix: document sensitive reporting and the source's actual trust boundaries. -->
# Security

## Report a vulnerability

GitHub private vulnerability reporting was **disabled when checked on 23 October 2026**. The maintainer should enable it or publish a verified private contact. If [Report a vulnerability](https://github.com/Youbal-oops/Open-Daevu/security/advisories/new) is available when you report, use it. Otherwise open an issue asking for a private reporting channel **without** exploit details, credentials or private data. No private contact address or response deadline is promised here.

Include the affected version/commit, impact, reproduction steps and a minimal example. Do not attach your credential vault, OAuth configuration, provider cookies, private MCP URLs or full workspace. If a credential was published, revoke/rotate it at the provider first. Removing a file in a new commit does not remove copies from history, forks or downloads; coordinate any additional remediation with the maintainer.

Development targets the latest source/release. There is no separate backport policy or guaranteed support period for older versions.

## Data and trust boundaries

| Component | Boundary and limitations |
| --- | --- |
| Workspace storage | Project content is stored on disk and is not encrypted by Daevu. Back up the complete workspace, including shared change logs and attachments. |
| Provider and MCP credentials | The app uses Electron safeStorage/Windows protection for its device-local vault; Claude Code manages its own files in an isolated configuration folder. Copying the project does not transfer sign-in. |
| Agents and tools | Requests include relevant project context. Selected tools, service permissions and CLI settings control access. Prompt instructions are not a security boundary; a powerful CLI or MCP server can have wider access than the UI suggests. |
| Project apps and HTML plugins | Sandboxed frames restrict direct network, Node and filesystem access. Host SDK calls can read/write project data within their allowed scope. Draft previews use real project data. |
| Website and browser plugins | Website panels contact external services. Browser scripts/tools execute in matching pages' main JavaScript world and can read page content or use its network capabilities. Broad match patterns grant broad page access. |
| Python scripts | Manual execution under the Windows user account; `-I` isolates Python startup configuration, not filesystem or network access. Discarding sheet edits cannot undo script side effects. |
| Drive storage | Drive for desktop performs transport. Legacy locks are advisory across asynchronous replicas; shared editing preserves conflicts but is not character-level document collaboration. |
| Updates | Packaged builds contact GitHub after startup and periodically. The current UI has no automatic-check toggle. Installers are unsigned; the built-in updater checks download size but does not verify a cryptographic digest or publisher signature. |

Review extension permissions, tools and imported code before use. These implementation boundaries are not a security certification. [Open security/bug reports](https://github.com/Youbal-oops/Open-Daevu/issues) and the [repository audit](docs/PUBLIC-REPOSITORY-AUDIT.md) track outstanding concerns. Do not interpret an old release note's private-network or isolation claim as a guarantee.
