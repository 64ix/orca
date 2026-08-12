# Spec implementation runner

How specs and PRs are implemented in this repo (used by `/implement-spec`).

## Base branch

`main` — every feature branch is cut from `origin/main` and every PR targets
`64ix/orca/main`. Never `stablyai/orca` (see `FORK.md`).

## Validation

From the worktree root:

- `pnpm test` — the gate. Run it for any change.
- `pnpm typecheck` and `pnpm lint` — run when relevant (types or code-quality touched).
- `pnpm format` — format the diff with oxfmt.

Lint rules are strict: `max-lines` disables are forbidden (see `AGENTS.md`),
oxlint runs with `--deny-warnings` on `src`, `config`, `tests`, `mobile`.

## Coding standards

- `AGENTS.md` — style, naming, platform/SSH/folder-workspace/remote-wire/git-compat constraints.
- `docs/STYLEGUIDE.md` — the design system for all UI work (tokens in
  `src/renderer/src/assets/main.css`, shadcn primitives in `src/renderer/src/components/ui/`).

## E2E specs

Specs under `tests/e2e/` need the built app and report `not-run` when it is
unavailable — that is a valid outcome, not a failure.
