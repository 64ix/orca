# Fork notes — 64ix/orca (« the fork »)

Fork of [stablyai/orca](https://github.com/stablyai/orca) carrying our work. `origin` is
**64ix/orca** — that is where every branch, PR, issue, and comment lives. `upstream` is
**stablyai/orca**, read-only: we only fetch from it for rebases.

## Branch model

- `main` — the fork's default branch (both on GitHub and via `origin/HEAD`), our
  working baseline. Upstream history plus our commits; every branch is cut from
  `origin/main`, and every PR targets `64ix/orca/main`.
- Feature branches — short-lived, pushed to `origin`, merged back to `main`.

> [!WARNING]
> **Every fork PR must target `64ix/orca/main` — never `stablyai/orca`.** The
> failure is silent: nothing errors.
>
> *Wrong repo:* `gh` resolves a fork's base repo to the **parent**, so an unqualified
> `gh pr create` opens the PR on `stablyai/orca`. Issues, comments, and merges aimed
> at upstream go the same way. This has happened more than once — agents opened
> issues and PRs upstream that nobody asked for.
>
> *Wrong branch:* the PR shows as merged but the code never reaches the branch the
> app is built from, so the feature is simply absent at runtime.
>
> Before opening a PR, name both explicitly; after, read the base back:
>
> ```bash
> gh pr create --repo 64ix/orca --base main --title ... --body ...   # never rely on either default
> gh pr view <n> --json baseRefName,baseRepository -q '{base: .baseRefName, repo: .baseRepository.nameWithOwner}'
> # must print: main / 64ix/orca
> ```

## Local clone invariants

The repo carries the guard scripts, their registrations and these docs, but some
invariants live in `.git/config`, in `~/.codex/` and in the gh CLI's state, so
**they do not travel with the repo**. One idempotent command applies them per
clone, and reports what only you can do:

```bash
sh config/scripts/fork-setup.sh
```

What it does, should you want it by hand:

```bash
git remote set-url --push upstream DISABLED     # `git push upstream` fails loudly; fetch still works
git config remote.origin.gh-resolved base       # what `gh repo set-default 64ix/orca` writes
chmod +x .claude/hooks/guard-fork-remote.sh
```

plus the Codex registration below. Verify:

```bash
git remote -v | grep upstream                   # push URL must read DISABLED
git config --get remote.origin.gh-resolved      # base
git symbolic-ref refs/remotes/origin/HEAD       # refs/remotes/origin/main
```

Because all worktrees share the common `.git/config`, the push-URL and
gh-resolved settings apply to every worktree from one run. The `--repo` risk is
the one no default fixes — `gh` resolves a fork's base repo to the **parent**
regardless — hence the agent guards below.

## Agent guards

Three layers, all shipping in the repo, all gated on the checkout's `origin`
being `64ix/orca` (matching the remote, not a path, covers every worktree):

- **`.claude/hooks/guard-fork-remote.sh`** — one `PreToolUse` script shared by
  Claude Code and Codex. It blocks pushes to `upstream`, gh writes aimed at
  `stablyai/orca`, and any `gh pr create` that does not pass
  `--repo 64ix/orca`, explaining the correct form on stderr (exit 2). Reads of
  upstream stay allowed, and so does merely mentioning the strings — rules are
  anchored at command position within each `;`/`&`/`|` segment. It accepts
  `tool_input.command` as a string or an argv array.
- **`.opencode/plugins/guard-fork-upstream.js`** — the opencode equivalent:
  a `tool.execute.before` hook on the bash tool applying the same rules
  (opencode has no PreToolUse hooks; the plugin throws to block, which
  auto-loads in every worktree).
- **`AGENTS.md` → "Fork and Upstream Discipline"** — the education layer every
  agent reads at session start.

Test the shell guard without an agent:

```bash
printf '{"cwd":"%s","tool_input":{"command":"gh pr create --title x"}}' "$PWD" |
  .claude/hooks/guard-fork-remote.sh; echo "exit=$?"   # expect 2 + the guidance
```

*Claude Code* registers the hook per project in `.claude/settings.json`. Both
files are tracked (the repo ignores only `.claude/skills/`), so they reach every
worktree.

*Codex* (verified on codex-cli 0.146.0) has **no project-scoped hook source**:
neither `.codex/hooks.json`, nor `.codex/config.toml`, nor a root `hooks.json`
is read. The only non-plugin surface is `~/.codex/hooks.json`, whose format
matches Claude Code's:

```json
{ "hooks": { "PreToolUse": [ { "matcher": "Bash|shell|exec_command|local_shell",
  "hooks": [ { "type": "command",
    "command": "/absolute/path/to/orca/.claude/hooks/guard-fork-remote.sh" } ] } ] } }
```

That registration is global, which is exactly why the script gates on `origin` —
in any other repo it exits 0 before looking at the command. Being outside the
repo, it is a per-machine invariant like the git config above.

> [!IMPORTANT]
> A Codex hook does not run until it is **trusted**: it starts as
> `trustStatus: untrusted`, and an untrusted hook is skipped **silently** — the
> command runs unguarded and nothing is logged. Approve it in the `codex` TUI's
> startup hook review; the decision is recorded as `hook_trust` in
> `~/.codex/config.toml`. Trust is keyed by a hash of the hook, so **editing the
> script drops it back to `modified` and it must be re-approved.**

## Rebase flow

```bash
git fetch upstream
git rebase upstream/main
```

Fast-forwarding `main` from upstream keeps the fork current; rebase feature
branches onto the refreshed `origin/main`. Never merge upstream into a branch —
rebase keeps the history ours.

## Core touchpoints (rebase conflict hotspots)

Keep this list current — everything else we write must stay additive.

| File | Change |
|------|--------|
| `.github/scripts/check-root-directory-entries.mjs` | fork-owned root-entry allowlist (`FORK.md`, `.claude`, `.opencode`) — upstream's root guard would otherwise block the fork's own setup |

Additive (no conflict risk): `FORK.md`, `.claude/hooks/guard-fork-remote.sh`,
`.claude/settings.json`, `.opencode/plugins/guard-fork-upstream.js`,
`config/scripts/fork-setup.sh`, the `## Agent skills` block in `AGENTS.md`,
`docs/agents/`.
