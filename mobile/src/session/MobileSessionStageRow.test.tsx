import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MobileStageRowModel } from '../worktree/mobile-stage-row-model'
import { MobileSessionStageRow } from './MobileSessionStageRow'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({ ChevronRight: 'ChevronRight' }))

describe('MobileSessionStageRow', () => {
  const mounted: ReactTestRenderer[] = []
  let renderer!: ReactTestRenderer

  afterEach(() => {
    act(() => mounted.pop()?.unmount())
  })

  function render(element: Parameters<typeof create>[0]): ReactTestRenderer {
    renderer = create(element)
    mounted.push(renderer)
    return renderer
  }

  function texts(): string[] {
    return renderer.root
      .findAllByType('Text')
      .flatMap((node) => node.children.filter((child) => typeof child === 'string'))
  }

  it('shows the effective stage label and the derivation explanation', () => {
    const model: MobileStageRowModel = {
      stageLabel: 'Review',
      explanation: 'Open pull request #42 keeps the stage at Review.',
      shippedSourceLabel: null
    }
    act(() => {
      render(createElement(MobileSessionStageRow, { model, onPress: () => {} }))
    })
    expect(texts()).toContain('Review')
    expect(texts()).toContain('Open pull request #42 keeps the stage at Review.')
  })

  it('prefixes the shipped source annotation ahead of the explanation when present', () => {
    const model: MobileStageRowModel = {
      stageLabel: 'Shipped',
      explanation: 'Merged pull request #99 keeps the stage at Shipped until you de-ship it.',
      shippedSourceLabel: 'Set by merged PR #99'
    }
    act(() => {
      render(createElement(MobileSessionStageRow, { model, onPress: () => {} }))
    })
    expect(texts().join(' ')).toContain('Set by merged PR #99')
    expect(texts().join(' ')).toContain('Merged pull request #99 keeps the stage at Shipped')
  })

  it('opens the stage action sheet on tap', () => {
    const onPress = vi.fn()
    const model: MobileStageRowModel = {
      stageLabel: 'No stage',
      explanation: 'You set this stage.',
      shippedSourceLabel: null
    }
    act(() => {
      render(createElement(MobileSessionStageRow, { model, onPress }))
    })
    const pressable = renderer.root.findByType('Pressable')
    pressable.props.onPress()
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
