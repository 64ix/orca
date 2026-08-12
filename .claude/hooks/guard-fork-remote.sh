#!/bin/sh
# PreToolUse guard for the 64ix/orca fork. Shared by two agents:
#   - Claude Code — registered per-project in `.claude/settings.json`
#   - Codex       — registered per-user in `~/.codex/hooks.json` (Codex has no
#                   project-scoped hook source, so the cwd gate below is what
#                   keeps it inert in every other repo)
#
# Blocks the three ways an agent has actually sent work to the wrong place:
#   1. pushing to `upstream`
#   2. a gh write aimed at `stablyai/orca`
#   3. `gh pr create` that does not name the fork explicitly
#      (gh defaults a fork's base repo to the PARENT — that is how issues and
#      PRs have landed on stablyai/orca without being asked for)
#
# Reads the PreToolUse JSON on stdin. exit 2 = block, stderr goes back to the
# agent, so every message says what to run instead.
#
# Never blocked: reads (gh pr/issue view|list|diff, gh api without a write
# --method, git fetch upstream), and merely *mentioning* any of these strings.
# The command is split into segments on `;`, `&`, `|` and newlines, and each
# rule is anchored at command position within its own segment — so
# `grep "gh pr create"`, docs quoting the strings, and
# `gh pr view -R stablyai/... && gh pr comment --repo 64ix/...` all pass,
# and one segment's repo flag cannot vouch for another's.

payload=$(cat) || exit 0

# Extract `tool_input.command` from the PreToolUse JSON with POSIX sed — no
# jq dependency (jq is not guaranteed on every machine, and this hook must
# never silently no-op). Codex's shell tool may pass `command` as an argv
# array; join its elements on newlines so each one keeps its own command
# position. JSON escapes other than \" inside the command are not resolved —
# the emdash original had the same fidelity, and commands carrying them are
# vanishingly rare in practice.
cmd=$(printf '%s' "$payload" | sed -n '
  s/.*"command"[[:space:]]*:[[:space:]]*//;
  t have
  b
  :have
  s/^\["//;
  s/"\][}]*$//;
  s/","/\
/g;
  s/^"//;
  s/"}[}]*$//;
  s/"$//;
  p
')
# argv-array form (Codex): the elements were joined on newlines above; flatten
# them back into a command line so compound rules like `git push upstream`
# match within one segment instead of straddling several.
case "$payload" in *'"command":['*) cmd=$(printf '%s' "$cmd" | tr '\n' ' ') ;;
esac
[ -n "$cmd" ] || exit 0

# Scope gate. The Claude registration is already project-local, but the Codex
# one is global: do nothing unless this session is in a checkout of our fork.
# Matching on origin rather than on a path covers every worktree for free.
cwd=$(printf '%s' "$payload" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$cwd" ] || cwd=$PWD
case $(git -C "$cwd" remote get-url origin 2>/dev/null) in
  *64ix/orca*) ;;
  *) exit 0 ;;
esac

has() { printf '%s' "$seg" | grep -qE "$1"; }

block() {
  printf 'BLOCKED by .claude/hooks/guard-fork-remote.sh\n\n%s\n' "$1" >&2
  exit 2
}

# Command position inside a segment: its start, or right after a `$(`.
AT='(^|\$\()[[:space:]]*'
Q='["'"'"']?'

GH_WRITE="${AT}gh[[:space:]]+[a-z-]+[[:space:]]+(create|edit|comment|close|reopen|merge|review|delete|ready|lock|transfer|sync|upload)([[:space:]]|\$)"
GH_API_WRITE="${AT}gh[[:space:]]+api.*(--method|-X)[[:space:]]*=?[[:space:]]*(POST|PUT|PATCH|DELETE)"
UPSTREAM="(--repo|-R)[[:space:]=]+${Q}stablyai/orca|repos/stablyai/orca|stablyai/orca\.git"

set -f # a segment may contain `*`; do not let `for` glob it
segments=$(printf '%s' "$cmd" | tr ';&|' '\n\n\n')
IFS='
'
for seg in $segments; do
  [ -n "$seg" ] || continue

  if has "${AT}git[[:space:]]+push" &&
    { has "[[:space:]]upstream([[:space:]]|\$)" || has 'stablyai/orca'; }; then
    block 'Never push to upstream (stablyai/orca). It is a read-only remote:
fetch for rebases, nothing else. Push to origin (64ix/orca) instead:

  git push -u origin <branch>'
  fi

  if { has "$GH_WRITE" || has "$GH_API_WRITE"; } && has "$UPSTREAM"; then
    block 'Write aimed at stablyai/orca. Upstream is read-only — issues, PRs
and comments all live on the fork. Reading upstream is fine
(gh pr view/list/diff, gh issue view/list, gh api without a write --method,
git fetch upstream).

Retarget the fork:  --repo 64ix/orca'
  fi

  if has "${AT}gh[[:space:]]+pr[[:space:]]+create"; then
    has "(--repo|-R)[[:space:]=]+${Q}64ix/orca" ||
      block 'gh pr create without an explicit --repo. For a fork, gh resolves the base
repo to the PARENT (stablyai/orca) — this is exactly how upstream issues and
PRs have been opened unrequested. Always name the fork:

  gh pr create --repo 64ix/orca --base main --title ... --body ...'
  fi
done

exit 0
