# Release context

The original GitHub release notes and tags remain unchanged. This index records the public releases inspected on 23 October 2026; it is not a new release announcement. The source version is in [package.json](../package.json).

| Public release | Original notes | Scope described in those notes |
| --- | --- | --- |
| 2.0.7 | [23 October 2026](https://github.com/Youbal-oops/Open-Daevu/releases/tag/v2.0.7) | Agent file/page/task functions and Escape sidebar behavior |
| 2.0.6 | [23 October 2026](https://github.com/Youbal-oops/Open-Daevu/releases/tag/v2.0.6) | Account/API built-in tools and profile-menu navigation |
| 2.0.5 | [22 October 2026](https://github.com/Youbal-oops/Open-Daevu/releases/tag/v2.0.5) | Picture/filter/table/formula/export/update fixes |
| 2.0.0 | [22 October 2026](https://github.com/Youbal-oops/Open-Daevu/releases/tag/v2.0.0) | Plugin contributions, boards, spreadsheets and file previews |
| 1.0.1 | [20 October 2026](https://github.com/Youbal-oops/Open-Daevu/releases/tag/v1.0.1) | Plugin icon picker and Wing Hop example |
| 1.0.0 | [20 October 2026](https://github.com/Youbal-oops/Open-Daevu/releases/tag/v1.0.0) | First public release |

## Reading older claims

- The 2.0.6 notes describe web fetch as unable to reach the local network. That release predates the address-validation and connection-pinning fixes merged in PR #60. Current source changes are not evidence that the older release binary contains them. See [security boundaries](../SECURITY.md) and [issue #17](https://github.com/Youbal-oops/Open-Daevu/issues/17).
- The 2.0.5 export note concerns formula references rewritten for **export-compatible sheet names**. Renaming a sheet inside the editor is a different path; its source fix and review are tracked in [issue #29](https://github.com/Youbal-oops/Open-Daevu/issues/29).
- Statements about a packaged app having been started, or counts in [historical validation](../VALIDATION.md), are retained reports from that development period. This documentation audit did not re-run old releases or independently reproduce every historical result.
- Pre-1.0 version labels in validation notes refer to private development. They are not evidence that matching public releases exist.

Use the [current guide](GUIDE.md), [connection setup](../ACCOUNT-CONNECTIONS.md) and [plugin reference](../PLUGINS.md) for source behavior. Provider websites, account eligibility and tools may change independently of a release.
