import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { PaneManager, ManagedPane } from '@/lib/pane-manager/pane-manager'
import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { PtyTransport } from './pty-transport'
import {
  firesNativePasteEvent,
  getClipboardEventText,
  isClipboardEventPasteRequired
} from './terminal-clipboard-event-paste'
import {
  assertClipboardTextWithinLimitWithYield,
  type ReadClipboardTextOptions
} from '../../../../shared/clipboard-text'
import { copyTerminalSelection } from './terminal-selection-copy'
import { keybindingMatchesAction } from '../../../../shared/keybindings'
import { pasteTerminalClipboard } from './terminal-clipboard-paste'
import { APP_MENU_PASTE_EVENT } from '@/lib/app-menu-paste'
import {
  APP_MENU_SELECTION_ACTION_EVENT,
  type AppMenuSelectionAction
} from '@/lib/app-menu-selection-actions'
import { isEditableTarget } from '@/lib/editable-target'
import { formatClipboardImagePasteError } from './terminal-paste-errors'
import type { TerminalPasteSource } from './terminal-paste-coordinator'
import { createPanePasteExecutor } from './terminal-paste-execution'
import { useAppStore } from '../../store'

const NATIVE_CHAT_ROOT_SELECTOR = '[data-native-chat-root="true"]'

function isInsideNativeChatRoot(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(NATIVE_CHAT_ROOT_SELECTOR) !== null
}

type UseTerminalPasteDispatchParams = {
  isActive: boolean
  tabId: string
  worktreeId: string
  containerRef: RefObject<HTMLDivElement | null>
  managerRef: RefObject<PaneManager | null>
  paneTransportsRef: RefObject<Map<number, PtyTransport>>
  keybindings: Parameters<typeof keybindingMatchesAction>[3]
  // Why: Windows ConPTY doesn't forward DECSET 2004 from TUIs, so xterm may not know multi-line paste needs bracketed protection.
  forceBracketedMultilineTextPaste: boolean
  setTerminalError: Dispatch<SetStateAction<string | null>>
}

/**
 * Owns paste entry points for this pane's container: keyboard chord, native paste event
 * fallback, app-menu paste, app-menu selection actions (copy/select-all), and primary-
 * clipboard middle-click semantics are dispatched through the shared paste coordinator.
 */
export function useTerminalPasteDispatch({
  isActive,
  tabId,
  worktreeId,
  containerRef,
  managerRef,
  paneTransportsRef,
  keybindings,
  forceBracketedMultilineTextPaste,
  setTerminalError
}: UseTerminalPasteDispatchParams): void {
  useEffect(() => {
    if (!isActive) {
      return
    }
    const container = containerRef.current
    if (!container) {
      return
    }

    const isMac = navigator.userAgent.includes('Mac')
    const shortcutPlatform: NodeJS.Platform = isMac
      ? 'darwin'
      : navigator.userAgent.includes('Windows')
        ? 'win32'
        : 'linux'

    const { executePanePasteText, resolvePaneProtectedMultilinePasteOptions } =
      createPanePasteExecutor({
        tabId,
        worktreeId,
        managerRef,
        paneTransportsRef,
        shortcutPlatform,
        forceBracketedMultilineTextPaste,
        setTerminalError
      })

    const pasteFromClipboard = (
      pane: ManagedPane,
      source: Extract<TerminalPasteSource, 'keyboard' | 'paste-event'>,
      readClipboardText: (options?: ReadClipboardTextOptions) => Promise<string> = window.api.ui
        .readClipboardText
    ): void => {
      const connectionId = getConnectionId(worktreeId) ?? null
      const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
        useAppStore.getState(),
        worktreeId
      )
      const activeElementAtDispatch = document.activeElement
      void pasteTerminalClipboard({
        readClipboardText,
        saveClipboardImageAsTempFile: window.api.ui.saveClipboardImageAsTempFile,
        connectionId,
        runtimeEnvironmentId,
        protectedMultilineTextPasteOptions: resolvePaneProtectedMultilinePasteOptions(pane),
        pasteText: (text, options) =>
          executePanePasteText(pane, source, activeElementAtDispatch, text, options),
        onTextPasteError: () =>
          setTerminalError('Paste failed: clipboard text is too large for a safe terminal paste.'),
        onImagePasteError: (error) => setTerminalError(formatClipboardImagePasteError(error))
      }).catch(() => {
        setTerminalError('Paste failed.')
      })
    }

    let suppressNextNativePaste = false
    let pasteSuppressionTimerId: number | null = null
    const shouldSuppressNativePaste = (e: KeyboardEvent): boolean => {
      const key = e.key.toLowerCase()
      return (
        (isMac && key === 'v' && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) ||
        (!isMac && key === 'v' && e.ctrlKey && !e.metaKey && !e.altKey) ||
        (!isMac && e.key === 'Insert' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey)
      )
    }
    const onKeyPaste = (e: KeyboardEvent): void => {
      const target = e.target
      if (
        (target instanceof Element && target.closest('[data-terminal-search-root]')) ||
        isInsideNativeChatRoot(target)
      ) {
        return
      }
      const matchesPaste = keybindingMatchesAction(
        'terminal.paste',
        e,
        shortcutPlatform,
        keybindings,
        { context: 'terminal' }
      )
      if (!matchesPaste) {
        if (shouldSuppressNativePaste(e)) {
          // Why: bare Ctrl+V is readline's quote-insert on Windows/Linux; suppress the native paste Chromium may add while letting xterm keep the keydown.
          suppressNextNativePaste = true
          if (pasteSuppressionTimerId !== null) {
            window.clearTimeout(pasteSuppressionTimerId)
          }
          pasteSuppressionTimerId = window.setTimeout(() => {
            pasteSuppressionTimerId = null
            suppressNextNativePaste = false
          }, 0)
        }
        return
      }
      if (isClipboardEventPasteRequired() && firesNativePasteEvent(e, isMac)) {
        // Why: without navigator.clipboard the chord's native paste event is the
        // only clipboard access — let its default fire and handle it in onPaste.
        // A remapped chord (e.g. Ctrl+Y) fires no paste event, so keep consuming it
        // below instead of letting xterm encode it to the PTY as a raw control char.
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const manager = managerRef.current
      if (!manager) {
        return
      }
      const pane = manager.getActivePane() ?? manager.getPanes()[0]
      if (!pane) {
        return
      }
      suppressNextNativePaste = true
      if (pasteSuppressionTimerId !== null) {
        window.clearTimeout(pasteSuppressionTimerId)
      }
      pasteSuppressionTimerId = window.setTimeout(() => {
        pasteSuppressionTimerId = null
        suppressNextNativePaste = false
      }, 0)
      pasteFromClipboard(pane, 'keyboard')
    }

    // Fallback: paste events from non-keyboard sources (Edit > Paste menu, programmatic paste, etc.).
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target
      if (
        (target instanceof Element && target.closest('[data-terminal-search-root]')) ||
        isInsideNativeChatRoot(target)
      ) {
        return
      }
      if (suppressNextNativePaste) {
        suppressNextNativePaste = false
        if (pasteSuppressionTimerId !== null) {
          window.clearTimeout(pasteSuppressionTimerId)
          pasteSuppressionTimerId = null
        }
        e.preventDefault()
        e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const manager = managerRef.current
      if (!manager) {
        return
      }
      const pane = manager.getActivePane() ?? manager.getPanes()[0]
      if (!pane) {
        return
      }
      if (isClipboardEventPasteRequired()) {
        const eventText = getClipboardEventText(e)
        pasteFromClipboard(pane, 'paste-event', (options) =>
          assertClipboardTextWithinLimitWithYield(eventText, options)
        )
        return
      }
      pasteFromClipboard(pane, 'paste-event')
    }

    const onAppMenuPaste = (event: Event): void => {
      const activeElementAtDispatch = document.activeElement
      if (
        !(activeElementAtDispatch instanceof Element) ||
        !container.contains(activeElementAtDispatch) ||
        activeElementAtDispatch.closest('[data-terminal-search-root]') ||
        isInsideNativeChatRoot(activeElementAtDispatch)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const manager = managerRef.current
      if (!manager) {
        return
      }
      const pane = manager.getActivePane() ?? manager.getPanes()[0]
      if (!pane) {
        return
      }
      const connectionId = getConnectionId(worktreeId) ?? null
      const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
        useAppStore.getState(),
        worktreeId
      )
      void pasteTerminalClipboard({
        readClipboardText: window.api.ui.readClipboardText,
        saveClipboardImageAsTempFile: window.api.ui.saveClipboardImageAsTempFile,
        connectionId,
        runtimeEnvironmentId,
        protectedMultilineTextPasteOptions: resolvePaneProtectedMultilinePasteOptions(pane),
        pasteText: (text, options) =>
          executePanePasteText(pane, 'app-menu', activeElementAtDispatch, text, options),
        onTextPasteError: () =>
          setTerminalError('Paste failed: clipboard text is too large for a safe terminal paste.'),
        onImagePasteError: (error) => setTerminalError(formatClipboardImagePasteError(error))
      }).catch(() => {
        setTerminalError('Paste failed.')
      })
    }

    const onAppMenuSelectionAction = (event: Event): void => {
      const activeElement = document.activeElement
      if (
        !(activeElement instanceof Element) ||
        !container.contains(activeElement) ||
        isEditableTarget(activeElement) ||
        activeElement.closest('[data-terminal-search-root]') ||
        isInsideNativeChatRoot(activeElement)
      ) {
        return
      }
      const manager = managerRef.current
      const pane = manager?.getActivePane() ?? manager?.getPanes()[0]
      if (!pane) {
        return
      }
      const action = (event as CustomEvent<AppMenuSelectionAction>).detail
      if (action === 'copy') {
        if (!pane.terminal.getSelection()) {
          return
        }
        event.preventDefault()
        void copyTerminalSelection({
          terminal: pane.terminal,
          writeClipboardText: window.api.ui.writeTerminalClipboardText
        }).catch(() => undefined)
        return
      }
      if (action === 'select-all') {
        event.preventDefault()
        pane.terminal.selectAll()
      }
    }

    container.addEventListener('keydown', onKeyPaste, { capture: true })
    container.addEventListener('paste', onPaste, { capture: true })
    window.addEventListener(APP_MENU_PASTE_EVENT, onAppMenuPaste)
    window.addEventListener(APP_MENU_SELECTION_ACTION_EVENT, onAppMenuSelectionAction)
    return () => {
      if (pasteSuppressionTimerId !== null) {
        window.clearTimeout(pasteSuppressionTimerId)
      }
      container.removeEventListener('keydown', onKeyPaste, { capture: true })
      container.removeEventListener('paste', onPaste, { capture: true })
      window.removeEventListener(APP_MENU_PASTE_EVENT, onAppMenuPaste)
      window.removeEventListener(APP_MENU_SELECTION_ACTION_EVENT, onAppMenuSelectionAction)
    }
  }, [
    isActive,
    worktreeId,
    keybindings,
    forceBracketedMultilineTextPaste,
    tabId,
    containerRef,
    managerRef,
    paneTransportsRef,
    setTerminalError
  ])
}
