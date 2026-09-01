// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { FeatureBoardColumn } from './FeatureBoardColumn'

function renderColumn(handlers: {
  onWorkspaceDragOver?: (event: React.DragEvent) => void
  onWorkspaceDrop?: (event: React.DragEvent) => void
  isDragTarget?: boolean
}): HTMLElement {
  const { container } = render(<FeatureBoardColumn stage="review" cards={[]} {...handlers} />)
  const column = container.querySelector<HTMLElement>('[data-feature-board-column]')
  if (!column) {
    throw new Error('column not rendered')
  }
  return column
}

describe('FeatureBoardColumn as a workspace drop target (#105)', () => {
  afterEach(cleanup)

  it('routes native dragover and drop on the column surface to the handlers', () => {
    const onWorkspaceDragOver = vi.fn()
    const onWorkspaceDrop = vi.fn()
    const column = renderColumn({ onWorkspaceDragOver, onWorkspaceDrop })

    fireEvent.dragOver(column)
    fireEvent.drop(column)

    expect(onWorkspaceDragOver).toHaveBeenCalledTimes(1)
    expect(onWorkspaceDrop).toHaveBeenCalledTimes(1)
  })

  it('shows the standard drop indicator while the column is the target', () => {
    expect(renderColumn({ isDragTarget: true }).className).toContain('border-primary/60')
    cleanup()
    expect(renderColumn({}).className).not.toContain('border-primary/60')
  })
})
