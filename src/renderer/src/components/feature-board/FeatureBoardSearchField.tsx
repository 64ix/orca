import React, { useRef } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { overlayReserve } from '@/components/sidebar/WorkspaceKanbanSearchField'
import { translate } from '@/i18n/i18n'

export type FeatureBoardSearchFieldProps = {
  query: string
  /** False for text that never narrows the board (whitespace-only, over-bound). */
  isFiltering: boolean
  /** True when the text was discarded for length, which needs saying out loud. */
  isTooLarge: boolean
  matchCount: number
  totalCount: number
  onQueryChange: (query: string) => void
  onClear: () => void
}

/**
 * Board text-search field (#50) — same undebounced-input, deferred-filter
 * discipline as the drawer's `WorkspaceKanbanSearchField`, reusing its overlay
 * math directly so the counter/clear affordance measures identically.
 */
export default function FeatureBoardSearchField({
  query,
  isFiltering,
  isTooLarge,
  matchCount,
  totalCount,
  onQueryChange,
  onClear
}: FeatureBoardSearchFieldProps): React.JSX.Element {
  const hasText = query !== ''
  const counterText = isFiltering ? `${matchCount} / ${totalCount}` : null
  const inputRef = useRef<HTMLInputElement>(null)

  const tooLargeMessage = isTooLarge
    ? translate(
        'components.featureBoard.search.tooLarge',
        'Search text is too long — the board is unfiltered'
      )
    : null
  const tooLargeLabel = isTooLarge
    ? translate('components.featureBoard.search.tooLargeLabel', 'Too long')
    : null
  const badgeText = tooLargeLabel ?? counterText

  return (
    <div className="relative flex min-w-0 max-w-64 flex-1 items-center">
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        aria-label={translate('components.featureBoard.search.placeholder', 'Search cards')}
        placeholder={translate('components.featureBoard.search.placeholder', 'Search cards')}
        aria-invalid={isTooLarge || undefined}
        className="h-7 bg-background pl-7 text-xs"
        style={hasText ? { paddingRight: overlayReserve(badgeText) } : undefined}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || event.nativeEvent.isComposing || !hasText) {
            return
          }
          event.preventDefault()
          onClear()
        }}
      />
      {hasText ? (
        <div className="absolute right-1 flex items-center gap-0.5">
          {tooLargeLabel ? (
            <span
              aria-hidden="true"
              title={tooLargeMessage ?? undefined}
              className="text-[10px] text-destructive"
            >
              {tooLargeLabel}
            </span>
          ) : counterText ? (
            <span aria-hidden="true" className="text-[10px] tabular-nums text-muted-foreground">
              {counterText}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={translate('components.featureBoard.search.clear', 'Clear search')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onClear()
              inputRef.current?.focus()
            }}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div role="status" aria-live="polite" className="sr-only">
        {tooLargeMessage ??
          (isFiltering
            ? translate(
                'components.featureBoard.search.matchAnnouncement',
                '{{value0}} of {{value1}} cards match',
                { value0: matchCount, value1: totalCount }
              )
            : '')}
      </div>
    </div>
  )
}
