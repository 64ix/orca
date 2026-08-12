#!/bin/sh
# Idempotent per-clone setup for the 64ix/orca fork. See FORK.md.
# Refuses to run against a checkout whose origin is not 64ix/orca.
#
# Applies the local-clone invariants (which live in .git/config, ~/.codex and
# gh's state, so they do not travel with the repo):
#   - upstream push URL -> DISABLED (fetch still works; push fails loudly)
#   - gh default repo -> 64ix/orca (remote.origin.gh-resolved = base)
#   - guard script executable + registered for Codex in ~/.codex/hooks.json
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUARD="$ROOT/.claude/hooks/guard-fork-remote.sh"
CODX_HOOKS="${CODX_HOOKS:-$HOME/.codex/hooks.json}"
CODX_MATCHER='Bash|shell|exec_command|local_shell'

# --- scope gate --------------------------------------------------------------
origin="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
case "$origin" in
  *64ix/orca*) ;;
  *)
    echo "refusing to set up fork invariants: origin is '$origin', expected 64ix/orca" >&2
    exit 1
    ;;
esac

# --- git config (shared by every worktree of this clone) ---------------------
if git -C "$ROOT" remote get-url upstream >/dev/null 2>&1; then
  git -C "$ROOT" remote set-url --push upstream DISABLED
  echo "upstream push URL -> DISABLED"
fi

git -C "$ROOT" config remote.origin.gh-resolved base
echo "remote.origin.gh-resolved -> base"

# --- guard script ------------------------------------------------------------
[ -f "$GUARD" ] || { echo "missing guard script: $GUARD" >&2; exit 1; }
chmod +x "$GUARD"
echo "guard script executable: $GUARD"

# --- Codex registration (global, origin-gated by the script itself) ----------
if command -v codex >/dev/null 2>&1; then
  mkdir -p "$(dirname "$CODX_HOOKS")"
  if [ -f "$CODX_HOOKS" ]; then
    if command -v jq >/dev/null 2>&1; then
      tmp="$CODX_HOOKS.tmp"
      jq --arg cmd "$GUARD" --arg matcher "$CODX_MATCHER" '
        def present: any(.hooks.PreToolUse[]?; .hooks[]?.command == $cmd);
        if present then . else
          .hooks.PreToolUse = (.hooks.PreToolUse // []) + [{
            "matcher": $matcher,
            "hooks": [{ "type": "command", "command": $cmd }]
          }]
        end
      ' "$CODX_HOOKS" > "$tmp" && mv "$tmp" "$CODX_HOOKS"
    else
      echo "SKIP Codex merge: $CODX_HOOKS exists but jq is missing — install jq and re-run"
    fi
  else
    printf '{"hooks":{"PreToolUse":[{"matcher":"%s","hooks":[{"type":"command","command":"%s"}]}]}}\n' \
      "$CODX_MATCHER" "$GUARD" > "$CODX_HOOKS"
  fi
  echo "Codex hook registered: $CODX_HOOKS"
else
  echo "SKIP Codex registration: codex not found (nothing to do on machines without Codex)"
fi

# --- gh default repo ---------------------------------------------------------
if command -v gh >/dev/null 2>&1; then
  gh repo set-default 64ix/orca >/dev/null 2>&1 && echo "gh default repo -> 64ix/orca"
fi

# --- verify ------------------------------------------------------------------
echo
echo "verify:"
git -C "$ROOT" remote -v | grep upstream   # push URL must read DISABLED
git -C "$ROOT" config --get remote.origin.gh-resolved
[ -f "$HOME/.codex/hooks.json" ] && jq -r '.hooks.PreToolUse[]?.hooks[]?.command' "$HOME/.codex/hooks.json" 2>/dev/null
printf '{"cwd":"%s","tool_input":{"command":"gh pr create --title x"}}' "$ROOT" |
  "$GUARD"; echo "guard self-test exit=$? (expect 2)"
