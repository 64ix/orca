import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MobilePrRowModel } from '../worktree/mobile-pr-row-model'
import { MobileSessionPrRow } from './MobileSessionPrRow'

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => ({
  ChevronRight: 'ChevronRight',
  GitPullRequest: 'GitPullRequest'
}))

describe('MobileSessionPrRow', () => {
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

  it('shows the linked PR number and state', () => {
    const model: MobilePrRowModel = { number: 42, stateLabel: 'Open', stateToken: 'statusGreen' }
    act(() => {
      render(createElement(MobileSessionPrRow, { model, onPress: () => {} }))
    })
    expect(texts()).toContain('#42')
    expect(texts()).toContain('Open')
  })

  it('navigates to the existing PR surface on tap', () => {
    const onPress = vi.fn()
    const model: MobilePrRowModel = { number: 7, stateLabel: 'Merged', stateToken: 'statusPurple' }
    act(() => {
      render(createElement(MobileSessionPrRow, { model, onPress }))
    })
    renderer.root.findByType('Pressable').props.onPress()
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
