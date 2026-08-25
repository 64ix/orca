import { translate } from '@/i18n/i18n'
import { translateSearchKeyword } from './settings-search-keywords'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export const getSyncDevicesPaneSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate('auto.components.settings.sync.search.a1b2c3d4e5', 'Sync Devices'),
    description: translate(
      'auto.components.settings.sync.search.b2c3d4e5f6',
      'Pair machines for self-hosted multi-device sync.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.sync.search.c3d4e5f6a1', 'sync'),
      ...translateSearchKeyword('auto.components.settings.sync.search.d4e5f6a1b2', 'devices'),
      ...translateSearchKeyword('auto.components.settings.sync.search.e5f6a1b2c3', 'pairing'),
      ...translateSearchKeyword('auto.components.settings.sync.search.f6a1b2c3d4', 'relay'),
      ...translateSearchKeyword('auto.components.settings.sync.search.a2b3c4d5e6', 'qr code')
    ]
  },
  {
    title: translate('auto.components.settings.sync.search.b3c4d5e6f7', 'Invite a Device'),
    description: translate(
      'auto.components.settings.sync.search.c4d5e6f7a2',
      'Pair another machine with a QR code and a pairing code.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.sync.search.d5e6f7a2b3', 'invite'),
      ...translateSearchKeyword('auto.components.settings.sync.search.e6f7a2b3c4', 'pair'),
      ...translateSearchKeyword('auto.components.settings.sync.search.f7a2b3c4d5', 'qr'),
      ...translateSearchKeyword('auto.components.settings.sync.search.a3b4c5d6e7', 'join')
    ]
  },
  {
    title: translate('auto.components.settings.sync.search.b4c5d6e7f8', 'Revoke a Device'),
    description: translate(
      'auto.components.settings.sync.search.c5d6e7f8a3',
      'Cut off a paired device immediately.'
    ),
    keywords: [
      ...translateSearchKeyword('auto.components.settings.sync.search.d6e7f8a3b4', 'revoke'),
      ...translateSearchKeyword('auto.components.settings.sync.search.e7f8a3b4c5', 'remove'),
      ...translateSearchKeyword('auto.components.settings.sync.search.f8a3b4c5d6', 'disconnect')
    ]
  }
])
