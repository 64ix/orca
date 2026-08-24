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
  const scope = useTerminalPaneScope(props)
  const runtime = useTerminalPaneRuntimeState(props, scope)
  const combined = { ...scope, ...runtime }
  const effects = useTerminalPaneCloseEffects({ ...props, ref }, combined, runtime)
  const actions = useTerminalPaneSurfaceActions(props, combined, runtime, effects)

  return <TerminalPaneView props={props} s={combined} a={actions} />
}

export default forwardRef(TerminalPane)
