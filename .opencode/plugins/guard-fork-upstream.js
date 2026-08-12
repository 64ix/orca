// PreToolUse-equivalent guard for the 64ix/orca fork (opencode has no
// PreToolUse hooks; see FORK.md). Blocks the same writes as
// .claude/hooks/guard-fork-remote.sh:
//   1. pushing to `upstream`
//   2. a gh write aimed at `stablyai/orca`
//   3. `gh pr create` that does not name the fork explicitly
//      (gh defaults a fork's base repo to the PARENT)
//
// Reads are never blocked (gh pr/issue view|list|diff, gh api without a write
// --method, git fetch upstream), nor is merely *mentioning* the strings. Each
// rule is anchored at command position within its own `;`/`&`/`|` segment.
// The plugin no-ops unless the session is in a checkout whose origin is
// 64ix/orca, so a stray global load stays inert in every other repo.

export const GuardForkUpstream = async ({ worktree, directory, $ }) => {
  const root = worktree || directory
  let origin = ''
  try {
    origin = String(await $`git -C ${root} remote get-url origin`.quiet())
  } catch {
    // not a checkout of anything
  }
  if (!origin.includes('64ix/orca')) {
    return {}
  }

  const GH_WRITE = /^gh\s+[a-z-]+\s+(create|edit|comment|close|reopen|merge|review|delete|ready|lock|transfer|sync|upload)(\s|$)/
  const GH_API_WRITE = /^gh\s+api\b.*(--method|-X)\s*=?\s*(POST|PUT|PATCH|DELETE)/
  const UPSTREAM = /(--repo|-R)\s*=?\s*["']?stablyai\/orca\b|repos\/stablyai\/orca|stablyai\/orca\.git/

  const block = (msg) => {
    throw new Error(`BLOCKED by .opencode/plugins/guard-fork-upstream.js\n\n${msg}`)
  }

  return {
    'tool.execute.before': async (input, output) => {
      if (input.tool !== 'bash') {
        return
      }
      const cmd = String(output.args?.command ?? output.args?.cmd ?? '')
      if (!cmd) {
        return
      }

      for (const rawSeg of cmd.split(/[;&|\n]/)) {
        // unwrap a `$(` command-substitution prefix (and its closing paren)
        // so inner commands keep their own command position; rules below are
        // anchored at segment start, mirroring the shell guard
        const seg = rawSeg.startsWith('$(')
          ? rawSeg.slice(2).replace(/\)$/, '').trimStart()
          : rawSeg.trimStart()

        if (/^git\s+push\b/.test(seg) &&
            (/\s+upstream(\s|$)/.test(seg) || /stablyai\/orca/.test(seg))) {
          block(`Never push to upstream (stablyai/orca). It is a read-only remote:
fetch for rebases, nothing else. Push to origin (64ix/orca) instead:

  git push -u origin <branch>`)
        }

        if ((GH_WRITE.test(seg) || GH_API_WRITE.test(seg)) && UPSTREAM.test(seg)) {
          block(`Write aimed at stablyai/orca. Upstream is read-only — issues, PRs
and comments all live on the fork. Reading upstream is fine
(gh pr view/list/diff, gh issue view/list, gh api without a write --method,
git fetch upstream).

Retarget the fork:  --repo 64ix/orca`)
        }

        if (/^gh\s+pr\s+create\b/.test(seg) && !/(--repo|-R)\s*=?\s*["']?64ix\/orca/.test(seg)) {
          block(`gh pr create without an explicit --repo. For a fork, gh resolves the base
repo to the PARENT (stablyai/orca) — this is exactly how upstream issues and
PRs have been opened unrequested. Always name the fork:

  gh pr create --repo 64ix/orca --base main --title ... --body ...`)
        }
      }
    }
  }
}
