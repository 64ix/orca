export type TerminalPaneProps = {
  tabId: string
  worktreeId: string
  cwd?: string
  isActive: boolean
  isVisible?: boolean
  isWorktreeActive?: boolean
  // When set (Activity portal), isolates one split pane as a transient override that doesn't touch expandedPaneId or persist the layout.
  isolatedPaneKey?: string | null
  // Why: ephemeral one-off command terminals don't need the header's prominent split affordance (split shortcuts still work).
  showSplitButton?: boolean
  onPtyExit: (ptyId: string) => void
  onCloseTab: () => void
}

export type TerminalPaneHandle = {
  closeActivePane: () => void
}
