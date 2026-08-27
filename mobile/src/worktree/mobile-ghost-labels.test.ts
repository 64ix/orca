import { describe, expect, it } from 'vitest'
import { MOBILE_GHOST_BADGE_LABELS } from './mobile-ghost-labels'

describe('MOBILE_GHOST_BADGE_LABELS', () => {
  it('labels every GhostCandidateBadge, matching desktop FeatureBoardGhostCard wording', () => {
    expect(MOBILE_GHOST_BADGE_LABELS).toEqual({
      'ready-for-agent': 'Ready for agent',
      'ready-for-human': 'Ready for human',
      'needs-triage': 'Needs triage'
    })
  })
})
