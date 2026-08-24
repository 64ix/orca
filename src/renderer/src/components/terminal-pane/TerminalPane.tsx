import { forwardRef } from 'react'
import type { TerminalPaneProps, TerminalPaneHandle } from './terminal-pane-props'

export type { TerminalPaneHandle } from './terminal-pane-props'
import { useTerminalPaneScope } from './use-terminal-pane-scope'
import { useTerminalPaneRuntimeState } from './use-terminal-pane-runtime-state'
import { useTerminalPaneCloseEffects } from './use-terminal-pane-close-effects'
import { useTerminalPaneSurfaceActions } from './use-terminal-pane-surface-actions'
import { TerminalPaneView } from './TerminalPaneView'

/**
 * Composition root for the terminal pane. Data lives in the scope/runtime hooks, side
 * effects in the close-effects hook, surface interactions in surface-actions, and all
 * rendering in TerminalPaneView.
 */
function TerminalPane(props: TerminalPaneProps, ref: React.ForwardedRef<TerminalPaneHandle>) {
  const core = useTerminalPaneScope(props)
  const rt = useTerminalPaneRuntimeState(props, core)
  const s = { ...core, ...rt }
  const e = useTerminalPaneCloseEffects({ ...props, ref }, s, rt)
  const a = useTerminalPaneSurfaceActions(props, s, rt, e)

  return <TerminalPaneView props={props} s={s} a={a} />
}

export default forwardRef(TerminalPane)
