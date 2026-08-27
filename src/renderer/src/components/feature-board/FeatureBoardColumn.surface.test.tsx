// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { WORKFLOW_STAGE_IDS } from '../../../../shared/workflow-stages'
import { FeatureBoardColumn } from './FeatureBoardColumn'

function renderColumn(props: { isAlternateSurface?: boolean }): HTMLElement {
  const { container } = render(
    <FeatureBoardColumn stage="idea" cards={[]} isAlternateSurface={props.isAlternateSurface} />
  )
  const column = container.querySelector<HTMLElement>('[data-feature-board-column]')
  if (!column) {
    throw new Error('column not rendered')
  }
  return column
}

describe('FeatureBoardColumn surface', () => {
  afterEach(cleanup)

  it('marks the alternate column so every other lane reads as a tinted surface', () => {
    expect(renderColumn({ isAlternateSurface: true }).dataset.featureBoardColumnSurface).toBe('alt')
    expect(renderColumn({}).dataset.featureBoardColumnSurface).toBe('base')
  })

  it('alternates by stage index so no two neighbouring lanes share a surface', () => {
    const surfaces = WORKFLOW_STAGE_IDS.map(
      (_, index) =>
        renderColumn({ isAlternateSurface: index % 2 === 1 }).dataset.featureBoardColumnSurface
    )
    for (const [index, surface] of surfaces.entries()) {
      if (index === 0) {
        continue
      }
      expect(surface).not.toBe(surfaces[index - 1])
    }
  })
})
