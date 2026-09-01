import { describe, expect, it } from 'vitest'
import { buildFeatureBoardGhostCandidates } from '../../../../shared/feature-board/ghost-candidates'
import { mapIssueWorkItem } from './work-item'

/**
 * The seam #94/#102 fixed: real `search/issues` payloads carry the body, the mapper derives
 * spec/ticket from it, and the ghost board excludes sub-tickets. Each layer is unit-tested
 * on its own; this walks the whole path so a body shape that stops being recognized shows up
 * as a ticket resurfacing in Idea rather than as a silent classification change.
 */
function searchIssue(number: number, title: string, body: string): Record<string, unknown> {
  return {
    number,
    title,
    body,
    state: 'open',
    html_url: `https://github.com/owner/repo/issues/${number}`,
    labels: [],
    updated_at: '2026-08-27T00:00:00.000Z'
  }
}

// Verbatim heading shapes from the issues that reported the bug (ProtoRTS #407/#409/#411).
const SPEC_BODY =
  '## Problem Statement\n\nLe menu sait dire...\n\n## Solution\n\nAu premier lancement...'
const TICKET_BODY =
  '## Parent\n\n#407\n\n## What to build\n\nLe jeu télécharge...\n\n## Acceptance criteria\n\n- [ ] ...'

describe('spec sub-tickets never reach the ghost board', () => {
  const items = [
    searchIssue(407, '[Spec] Le jeu écrit ses propres fichiers', SPEC_BODY),
    searchIssue(409, "L'update se télécharge et se vérifie, sans rien remplacer", TICKET_BODY),
    searchIssue(411, 'La relance automatique, annulable', TICKET_BODY),
    searchIssue(
      417,
      "L'effacement récursif du .old ignore les fichiers cachés",
      '## Problem\n\nDirAccess...'
    )
  ].map((item) => ({ ...mapIssueWorkItem(item), repoId: 'repo-1' }))

  it('derives the spec and its tickets from the body the list endpoint returns', () => {
    expect(items.map((item) => [item.number, item.specShape, item.parentIssueNumber])).toEqual([
      [407, 'spec', undefined],
      [409, 'ticket', 407],
      [411, 'ticket', 407],
      [417, undefined, undefined]
    ])
  })

  it('leaves the spec and unparented issues as ghosts while its tickets stay off the board', () => {
    const ghosts = buildFeatureBoardGhostCandidates({
      openIssues: items,
      repoId: 'repo-1',
      linkedIssueNumbers: new Set<number>(),
      referencedIssueNumbers: new Set<number>(),
      dismissedIssueNumbers: new Set<number>()
    })
    expect(ghosts.map((ghost) => [ghost.issue.number, ghost.targetStage])).toEqual([
      [407, 'spec'],
      [417, 'idea']
    ])
    expect(ghosts[0]?.childTicketCount).toBe(2)
  })
})
