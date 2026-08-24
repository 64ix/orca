import { useCallback, useRef } from 'react'
import type { RefObject } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { useLinkRoutingPreferenceDialog } from '@/components/link-routing-preference-dialog'

/**
 * One-time "open links in app or browser" preference prompt: resolves the user's choice and
 * persists it; concurrent requests share a single in-flight promise.
 */
export function useOpenLinksInAppPreference(options: {
  settingsRef: RefObject<GlobalSettings | null>
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>
}): (url: string) => Promise<boolean> | null {
  const { settingsRef, updateSettings } = options
  const requestLinkRoutingPreference = useLinkRoutingPreferenceDialog()
  const openLinksInAppPreferencePromiseRef = useRef<Promise<boolean> | null>(null)

  return useCallback(
    (url: string): Promise<boolean> | null => {
      if (settingsRef.current?.openLinksInAppPreferencePrompted === true) {
        return null
      }
      if (!settingsRef.current) {
        return null
      }
      if (openLinksInAppPreferencePromiseRef.current) {
        return openLinksInAppPreferencePromiseRef.current
      }
      const preferencePromise = (async () => {
        const openInOrca = await requestLinkRoutingPreference({
          openLinksInAppDefault: settingsRef.current?.openLinksInApp === true,
          url
        })
        await updateSettings({
          openLinksInApp: openInOrca,
          openLinksInAppPreferencePrompted: true
        })
        return openInOrca
      })()
      openLinksInAppPreferencePromiseRef.current = preferencePromise
      void preferencePromise.finally(() => {
        openLinksInAppPreferencePromiseRef.current = null
      })
      return preferencePromise
    },
    [requestLinkRoutingPreference, settingsRef, updateSettings]
  )
}
