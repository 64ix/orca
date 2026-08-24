import { describe, expect, it } from 'vitest'
import {
  SHIPPED_STAGE_STEERING_MESSAGE,
  STAGE_AUTHORITY_REFUSED_CODE,
  StageAuthorityRefusedError,
  assertStageWriteAllowed,
  decideStageWrite
} from './stage-write-authority'
import type { WorkflowTaskTreeFacts } from '../stage-derivation/stage-derivation'
import { WORKFLOW_STAGE_IDS, type WorkflowStage } from '../workflow-stages'

const OPEN_PR_FACTS: WorkflowTaskTreeFacts = {
  self: { pullRequests: [{ id: 'pr-open', state: 'open' }] }
}
const UNCONSUMED_MERGE_FACTS: WorkflowTaskTreeFacts = {
  self: { pullRequests: [{ id: 'pr-merged', state: 'merged' }] }
}

const FACT_SHAPES = [
  { name: 'no governing facts', facts: null },
  { name: 'an open pull request fact', facts: OPEN_PR_FACTS },
  { name: 'an unconsumed merged PR fact', facts: UNCONSUMED_MERGE_FACTS }
] as const

type FactShapeName = (typeof FACT_SHAPES)[number]['name']

const REQUESTS: readonly (WorkflowStage | null)[] = [...WORKFLOW_STAGE_IDS, null]

function label(stage: WorkflowStage | null): string {
  return stage === null ? 'a null clear' : stage
}

/** Spec rule: facts override declarations at derivation time, never at authority time. */
function expectedEffectiveStage(
  request: WorkflowStage | null,
  factShape: FactShapeName
): WorkflowStage | null {
  if (factShape === 'an open pull request fact') {
    return 'review'
  }
  if (factShape === 'an unconsumed merged PR fact') {
    return 'shipped'
  }
  return request
}

describe('stage write authority matrix (7 stages x agent/human x fact shapes)', () => {
  for (const { name: factName, facts } of FACT_SHAPES) {
    for (const request of REQUESTS) {
      it(`human declaring ${label(request)} with ${factName} is allowed`, () => {
        const decision = decideStageWrite({ callerKind: 'human', requestedStage: request, facts })

        expect(decision.allowed).toBe(true)
        expect(decision).toMatchObject({
          allowed: true,
          requestedStage: request,
          effectiveStage: expectedEffectiveStage(request, factName)
        })
      })

      it(`agent declaring ${label(request)} with ${factName}`, () => {
        const decision = decideStageWrite({ callerKind: 'agent', requestedStage: request, facts })

        if (request === 'shipped') {
          // Fail-closed: no fact shape rescues an agent's shipped attempt.
          expect(decision).toEqual({
            allowed: false,
            requestedStage: 'shipped',
            code: STAGE_AUTHORITY_REFUSED_CODE,
            explanation: SHIPPED_STAGE_STEERING_MESSAGE
          })
          return
        }

        expect(decision).toMatchObject({
          allowed: true,
          effectiveStage: expectedEffectiveStage(request, factName)
        })
      })
    }
  }
})

describe('steering message and explanations', () => {
  it('carries the steering message verbatim on the refused shipped write', () => {
    const decision = decideStageWrite({ callerKind: 'agent', requestedStage: 'shipped' })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.explanation).toBe('shipped is set by a merged PR or by you in the board UI.')
      expect(decision.explanation).toBe(SHIPPED_STAGE_STEERING_MESSAGE)
    }
  })

  it('lets an agent exit triage by re-declaring a working stage', () => {
    const decision = decideStageWrite({ callerKind: 'agent', requestedStage: 'implementing' })

    expect(decision).toMatchObject({ allowed: true, effectiveStage: 'implementing' })
    if (decision.allowed) {
      // No facts passed: the explanation must not imply derivation consulted any.
      expect(decision.explanation).toBe('declared implementing (no provider facts consulted)')
    }
  })

  it('keeps the full fact-derived explanation when facts are actually supplied', () => {
    const decision = decideStageWrite({
      callerKind: 'agent',
      requestedStage: 'implementing',
      facts: { self: { pullRequests: [] } }
    })

    expect(decision).toMatchObject({ allowed: true, effectiveStage: 'implementing' })
    if (decision.allowed) {
      expect(decision.explanation).toBe('declared implementing; effective stage is implementing')
    }
  })

  it('accepts an agent-declared review that an open PR overrides at derivation time', () => {
    const decision = decideStageWrite({
      callerKind: 'agent',
      requestedStage: 'review',
      facts: OPEN_PR_FACTS
    })

    expect(decision).toMatchObject({ allowed: true, effectiveStage: 'review' })
    if (decision.allowed) {
      expect(decision.explanation).toBe(
        'declared review; an open pull request keeps the effective stage at review'
      )
    }
  })

  it('accepts an agent declaration that an unconsumed merge keeps at shipped', () => {
    const decision = decideStageWrite({
      callerKind: 'agent',
      requestedStage: 'implementing',
      facts: UNCONSUMED_MERGE_FACTS
    })

    expect(decision).toMatchObject({ allowed: true, effectiveStage: 'shipped' })
    if (decision.allowed) {
      expect(decision.explanation).toBe(
        'declared implementing; an unconsumed merged pull request keeps the effective stage at shipped until a human de-ships it'
      )
    }
  })

  it('lets a human clear while a merge is still unconsumed and says so', () => {
    const decision = decideStageWrite({
      callerKind: 'human',
      requestedStage: null,
      facts: UNCONSUMED_MERGE_FACTS
    })

    expect(decision).toMatchObject({ allowed: true, effectiveStage: 'shipped' })
    if (decision.allowed) {
      expect(decision.explanation).toContain('until a human de-ships it')
    }
  })

  it('reports no-change when workflowStage is absent from the request', () => {
    const decision = decideStageWrite({ callerKind: 'agent' })

    expect(decision).toMatchObject({ allowed: true, effectiveStage: null })
    if (decision.allowed) {
      expect(decision.explanation).toBe('stage unchanged (no provider facts consulted)')
    }
  })

  it('returns JSON-serializable decisions for both outcomes', () => {
    const refused = decideStageWrite({ callerKind: 'agent', requestedStage: 'shipped' })
    const accepted = decideStageWrite({
      callerKind: 'human',
      requestedStage: 'review',
      facts: OPEN_PR_FACTS
    })

    expect(JSON.parse(JSON.stringify(refused))).toEqual(refused)
    expect(JSON.parse(JSON.stringify(accepted))).toEqual(accepted)
  })
})

describe('assertStageWriteAllowed', () => {
  it('throws the typed passthrough error on an agent shipped attempt', () => {
    let caught: unknown
    try {
      assertStageWriteAllowed({ callerKind: 'agent', requestedStage: 'shipped' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(StageAuthorityRefusedError)
    const refusedError = caught as StageAuthorityRefusedError
    expect(refusedError.code).toBe(STAGE_AUTHORITY_REFUSED_CODE)
    expect(refusedError.message).toBe(SHIPPED_STAGE_STEERING_MESSAGE)
    expect(refusedError.decision).toMatchObject({ allowed: false })
  })

  it('returns the accepted decision for human writes including shipped', () => {
    const decision = assertStageWriteAllowed({ callerKind: 'human', requestedStage: 'shipped' })

    expect(decision).toMatchObject({ allowed: true, effectiveStage: 'shipped' })
  })
})
