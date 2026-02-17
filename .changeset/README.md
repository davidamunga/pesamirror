# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and the changelog.

## Adding a changeset

When you change something that should affect the next release:

1. Run **`npx changeset`** in the repo root (or add a file manually under `.changeset/`).
2. Choose the version bump: **patch** (1.0.0 → 1.0.1), **minor** (1.0.0 → 1.1.0), or **major** (1.0.0 → 2.0.0).
3. Write a short line for the changelog (e.g. "Add SMS trigger" or "Fix PIN warning on first launch").
4. Commit the new file (e.g. `.changeset/cool-feature.md`) and open a PR to `main`.

The **Version** workflow will run on the PR, run `changeset version`, sync the new version to the Android app (`app/build.gradle.kts`), and update the PR with the version bump and CHANGELOG. Merge that PR when ready.

When you merge to `main`, the **Release** workflow runs: it creates the tag (e.g. `v1.0.1`), pushes it, builds the APK, and creates a draft GitHub Release. You only need to open the draft and click **Publish release**.
