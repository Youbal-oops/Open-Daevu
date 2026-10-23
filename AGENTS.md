# Instructions for AI agents

These instructions apply throughout the repository. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the documentation relevant to the task before making changes.

## Manual user review before every commit

1. Work on a separate branch and keep unrelated work separate. Inspect the existing changes before editing; do not overwrite work you did not create.
2. Complete the requested changes and relevant checks. Prepare a reviewable diff, including new files, a changed-file summary, actual test results and remaining concerns.
3. Present that material to the user who requested the work. **Do not create any Git commit until the user has manually reviewed the proposed changes and explicitly approved that final diff for commit.**
4. A request to do work, silence, an earlier approval or an automated review is not approval of the current diff. If approved changes are subsequently edited, obtain approval for the revised diff before committing.
5. Commit only the reviewed changes after approval. This rule includes documentation, tests, tooling, generated files and this instructions file. It also covers commands that create commits indirectly, such as `npm version`, amend, cherry-pick, merge or rebase operations. Do not enable automatic commits or bypass the review step.
6. Commit approval does not itself authorize pushing, merging, publishing, tagging or releasing. Perform those actions only when explicitly authorized for the reviewed changes.

If approval has not been given, leave the changes uncommitted and state that they are ready for manual review.

## Project scope

Daevu is an open-source, local-first Windows desktop workspace. Its core feature set is complete. Prioritize bug fixes, performance, reliability and compatibility. Prefer plugins or project apps for new functionality; discuss necessary core extension/API changes before implementing them. Do not add unrelated features, refactor unrelated production code or remove existing functionality.

## Accurate documentation and transparent assistance

- Verify feature, permission, storage, privacy, compatibility and version claims against the actual source and configuration. Distinguish source behavior from published release behavior and third-party service availability.
- Use concise, natural technical writing. Avoid promotional claims, repetition, generic templates, exaggerated guarantees and tools intended to disguise AI authorship.
- Retain the disclosure that extensive AI coding assistance was used. Do not invent development milestones, contributors, sources, test results or personal review by the maintainer.
- Keep maintainer-reported private development history clearly separate from what public Git history establishes.
- Put installation and scope in README, procedures in the guide, SDK/package details in PLUGINS, and provider setup in ACCOUNT-CONNECTIONS. Link to the canonical explanation rather than maintaining contradictory copies.
- Preserve useful historical technical records. Add context when they no longer describe current behavior rather than deleting or silently rewriting them.
- Describe changes factually; do not add per-file requester or author labels unless explicitly requested.

## Repository hygiene and preservation

- Understand a file's purpose before changing or removing it. Keep credentials, private workspace data, local profiles, dependency folders and generated distributions out of source control.
- Never print or publish secret values. Follow [SECURITY.md](SECURITY.md), and flag confirmed historical credential exposure for manual remediation; a new deletion does not erase old copies.
- Preserve licensing, trademarks and visual identity. Do not modify release binaries or generated distribution files as part of source/documentation cleanup.
- Do not rewrite, squash, fabricate or backdate history, force-push, or change existing release tags. Use normal commits after manual user approval.

## Checks and handoff

Run `npm run check:docs` for documentation changes and the existing tests/build or native checks relevant to the actual change. See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for commands and Windows requirements. Do not claim that unit fixtures establish live provider, installer or cross-version compatibility.

Report commands actually run, results including failures, checks not performed and claims that could not be verified. For documentation-only edits, do not invent a new application test run or reuse an old result as evidence for the current diff.

Before asking for commit approval, provide the concise audit/change summary, changed files, reviewable diff and outstanding concerns. Keep the work uncommitted until the user approves it.
