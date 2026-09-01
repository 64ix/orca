import { describe, expect, it } from 'vitest'
import { featureBoardCardSurfaceClass } from './feature-board-card-surface'

describe('featureBoardCardSurfaceClass', () => {
  it('keeps the card outline and its own surface visible at rest', () => {
    const idle = featureBoardCardSurfaceClass({
      isAwaitingInput: false,
      isSelected: false,
      isCurrent: false
    })
    expect(idle).toContain('border')
    expect(idle).toContain('bg-card')
    expect(idle).toContain('shadow-xs')
  })

  it('insets the content so a selection ring never crosses the title', () => {
    // Why: the nested WorktreeCard only pads 5px above its title — enough for a transparent
    // border, not for the board's always-drawn outline plus a 1px ring on top of it.
    expect(
      featureBoardCardSurfaceClass({ isAwaitingInput: false, isSelected: false, isCurrent: false })
    ).toContain('pt-1')
  })

  it('states awaiting-input and selection as ring tints layered over the same outline', () => {
    const awaiting = featureBoardCardSurfaceClass({
      isAwaitingInput: true,
      isSelected: false,
      isCurrent: false
    })
    const selected = featureBoardCardSurfaceClass({
      isAwaitingInput: false,
      isSelected: true,
      isCurrent: false
    })

    expect(awaiting).toContain('ring-amber-500/60')
    expect(selected).toContain('ring-primary/60')
    // Both keep the base outline rather than swapping it out.
    expect(awaiting).toContain('bg-card')
    expect(selected).toContain('bg-card')
  })

  it('washes the whole card, branch row included, for the workspace the user is in', () => {
    const current = featureBoardCardSurfaceClass({
      isAwaitingInput: false,
      isSelected: false,
      isCurrent: true
    })
    // Why assert bg-card is gone: the wash has to replace the card surface, not sit under it —
    // twMerge dropping the loser is what makes a single class carry the whole-card tint.
    expect(current).toContain('bg-[color-mix(in_srgb,var(--foreground)_6%,var(--card))]')
    expect(current).not.toContain('bg-card')
  })

  it('keeps the current wash under the selection ring rather than replacing it', () => {
    const both = featureBoardCardSurfaceClass({
      isAwaitingInput: false,
      isSelected: true,
      isCurrent: true
    })
    expect(both).toContain('bg-[color-mix(in_srgb,var(--foreground)_6%,var(--card))]')
    expect(both).toContain('ring-primary/60')
  })

  it('lets selection win over awaiting-input so one card never shows two rings', () => {
    const both = featureBoardCardSurfaceClass({
      isAwaitingInput: true,
      isSelected: true,
      isCurrent: false
    })
    expect(both).toContain('ring-primary/60')
    expect(both).not.toContain('ring-amber-500/60')
  })
})
