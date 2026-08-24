import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  closeTerminalLinkActionRequest,
  type TerminalLinkActionRequest
} from './terminal-link-action-request'

/** State for the terminal link-action popover, dismissed automatically when the pane hides. */
export function useTerminalLinkActionState(options: {
  isActive: boolean
  isRendererVisible: boolean
  paneLayoutRevision: number
}): {
  terminalLinkActionRequest: TerminalLinkActionRequest | null
  setTerminalLinkActionRequest: Dispatch<SetStateAction<TerminalLinkActionRequest | null>>
  requestTerminalLinkAction: (request: TerminalLinkActionRequest) => void
  closeTerminalLinkActions: (dismissed?: TerminalLinkActionRequest) => void
} {
  const { isActive, isRendererVisible, paneLayoutRevision } = options
  const [terminalLinkActionRequest, setTerminalLinkActionRequest] =
    useState<TerminalLinkActionRequest | null>(null)
  const requestTerminalLinkAction = useCallback((request: TerminalLinkActionRequest) => {
    setTerminalLinkActionRequest(request)
  }, [])
  const closeTerminalLinkActions = useCallback((dismissed?: TerminalLinkActionRequest) => {
    setTerminalLinkActionRequest((current) => closeTerminalLinkActionRequest(current, dismissed))
  }, [])

  useEffect(() => {
    closeTerminalLinkActions()
  }, [closeTerminalLinkActions, isActive, isRendererVisible, paneLayoutRevision])

  return {
    terminalLinkActionRequest,
    setTerminalLinkActionRequest,
    requestTerminalLinkAction,
    closeTerminalLinkActions
  }
}
