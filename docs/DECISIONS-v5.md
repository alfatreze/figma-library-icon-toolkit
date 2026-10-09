# Decisions v5: publishing to a repository

| # | Decision | Why |
|---|---|---|
| 1 | **No local helper.** The plugin talks to GitHub and gitlab.com directly. | A design-system owner should not need Node, a terminal or a cloned repo. The first iteration (a localhost helper) was a misreading of "push to GitHub and GitLab"; it is removed. |
| 2 | **Personal access token pasted into the plugin**, stored in `figma.clientStorage` (this computer only). Not part of the team config, exports or diagnostics. | Plugins cannot use the user's git credentials or open an OAuth window with a client secret safely. A fine-grained, repository-scoped token limits the blast radius. |
| 3 | **Network access only for api.github.com and gitlab.com**, and only on Test connection or Publish. | The manifest must list domains in advance. This is the smallest useful set. Self-hosted hosts need a different approach (see roadmap). |
| 4 | **Always a new branch from the default branch + a pull / merge request.** Never a direct change to the default branch. | Review is the point; a bad export must not reach production code. |
| 5 | **One commit** on GitHub (trees built in several requests, then one commit); GitLab needs several commits for large exports (the commits API takes bounded batches). | Keeps the review small; the limits are in `gitHost/github.ts` and `gitlab.ts`. |
| 6 | **Plan before writing**: compare git blob ids (SHA-1 of the content) with the repository tree, show added / changed / removed / same, send only what changed. | No surprise diffs; small requests; "nothing to publish" is a real answer. |
| 7 | **Delete only what the tool published**: the list in `<folder>/.icon-toolkit.json`. | A hand-written file in the same folder is never removed. |
| 8 | **Path rules** (`gitHost/paths.ts`): plain subfolder (not the root, no dot-folders, no `node_modules`), plain asset file types, no `package.json`, safe branch names. | A malicious or mistaken config cannot write hooks, workflows or manifests. |
| 9 | **Ask before create**: the dialog states the target, the branch and what will be sent; nothing is sent until the user confirms. | Publishing is an outward-facing action. |
| 10 | **Fake servers in tests** (`test/helpers/fakeHost.ts`). Real-account checks are in `docs/verification.md` (V14, V32, V33). | CI cannot hold a token; the fakes encode the rules we depend on (create vs update, base trees). |
