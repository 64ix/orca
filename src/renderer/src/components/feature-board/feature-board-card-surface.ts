import { cn } from '@/lib/utils'

/**
 * The board card's own surface (#2 follow-up): unlike the sidebar, where a card only draws chrome
 * on hover, a board card must read as a discrete object on its lane at rest — so the outline,
 * background and hairline lift are always painted, and state is layered on as a ring.
 */
export function featureBoardCardSurfaceClass(state: {
  isAwaitingInput: boolean
  isSelected: boolean
  /** The workspace the user is currently in — the board's equivalent of the sidebar's active row. */
  isCurrent: boolean
}): string {
  return cn(
    // min-w-0: the flex-col column stretches this card to full width, but without it the
    // card's own auto min-width grows to fit the branch row's unbroken text (#77).
    'relative min-w-0 w-full rounded-lg border border-border pt-1 shadow-xs',
    'transition-[background-color,border-color,box-shadow] duration-150',
    // Why the whole card carries the current wash: the nested sidebar surface paints its own,
    // but it ends where its content ends — above the branch row the board card renders itself —
    // so the card read as half-tinted. Mixed from tokens rather than flat `accent` because in
    // dark mode #404040 on a #171717 card reads as a selection slab; this state should stay as
    // quiet as the sidebar's own active card. Same recipe as the tab bar's active tab.
    state.isCurrent ? 'bg-[color-mix(in_srgb,var(--foreground)_6%,var(--card))]' : 'bg-card',
    'hover:border-ring/45 hover:shadow-sm',
    // Selection wins: an awaiting-input card the user opened would otherwise stack two rings.
    state.isSelected
      ? 'border-primary/45 ring-1 ring-primary/60'
      : state.isAwaitingInput && 'border-amber-500/45 ring-1 ring-amber-500/60'
  )
}
