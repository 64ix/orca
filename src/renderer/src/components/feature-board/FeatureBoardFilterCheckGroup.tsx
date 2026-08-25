import React from 'react'
import { DropdownMenuLabel } from '@/components/ui/dropdown-menu'
import { FilterToggleRow } from '@/components/sidebar/FilterToggleRow'

export type FeatureBoardFilterCheckOption<T extends string> = {
  value: T
  label: string
  icon: React.ReactNode
}

/**
 * One filter dimension rendered as a labeled group of switch rows (reuses the
 * sidebar's `FilterToggleRow` so the board's filter menu shares its exact
 * look/behavior). Used for the board's stage / agent-state / PR-state
 * dimensions, each a small fixed option set.
 */
export function FeatureBoardFilterCheckGroup<T extends string>({
  title,
  options,
  selected,
  onToggle
}: {
  title: string
  options: readonly FeatureBoardFilterCheckOption<T>[]
  selected: ReadonlySet<T>
  onToggle: (value: T) => void
}): React.JSX.Element {
  return (
    <div>
      <DropdownMenuLabel className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </DropdownMenuLabel>
      {options.map((option) => (
        <FilterToggleRow
          key={option.value}
          icon={option.icon}
          label={option.label}
          checked={selected.has(option.value)}
          onChange={() => onToggle(option.value)}
        />
      ))}
    </div>
  )
}
