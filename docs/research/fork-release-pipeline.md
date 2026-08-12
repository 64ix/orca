# Pipeline de release du fork emdash → portage vers Orca

Recherche uniquement (aucune modification de code). Comparaison entre le pipeline de
packaging d'Orca (worktree `initial-exploration`, fork `64ix/orca`) et les patterns de
release du fork emdash (`/home/dev/emdash`, `64ix/emdash`).

- Orca : `/home/dev/orca/.emdash/worktrees/orca-fork/initial-exploration`
- emdash : `/home/dev/emdash` (code concerné : `apps/emdash-desktop/`)

---

## 1. Pipeline de packaging Orca actuel

### 1.1 Scripts package/release (`package.json` racine)

| Script | Commande | Rôle |
| --- | --- | --- |
| `build:release` | `build:relay` + `build:native` + `verify:computer-native` + `build:cli` + `build:electron-vite` + `verify:built-skills-cli` + `build:web-from-renderer` | Build pré-packaging complet (CI release) |
| `build:unpack` | `electron-builder --config config/electron-builder.config.cjs --dir` | Build local non-packagé |
| `build:win` | `electron-builder ... --win` | Build Windows local |
| `build:mac` | `build:desktop` + helpers + `node config/scripts/build-mac-local.mjs` | Build macOS local (ad-hoc) |
| `build:mac:release` | `verify-macos-release-env.mjs` + `ORCA_MAC_RELEASE=1 electron-builder ... --mac` | Build macOS release (signé + notarisé) |
| `build:linux` | `electron-builder ... --linux AppImage deb` | Build Linux local |
| `postinstall` / `rebuild:electron` | `node config/scripts/rebuild-native-deps.mjs` | Rebuild natif Electron |
| `win-update-e2e` / `win-crash-survival-e2e` | `tests/tools/win-update-e2e/run.mjs` | E2E mise à jour Windows |

### 1.2 Config electron-builder

**`config/electron-builder.config.cjs`** (CJS, 640 lignes) — pas de `*.config.ts` :

- `publish`: provider `github`, owner `stablyai`, repo `orca` (`releaseType: 'release'`),
  ou `orca-hourly` / `orca-daily` / `orca-adhoc` (`prerelease`) selon les env
  `ORCA_MAC_HOURLY/DAILY/ADHOC`. Les dev-channels ont leur propre repo car le feed atom
  de GitHub n'expose que les 10 dernières entrées.
- `beforeBuild`: `config/scripts/electron-builder-native-rebuild.cjs` (hook natif).
- `afterPack` (~80 lignes de vérifications) : `verifyLinuxGlibcFloor`, écriture de
  `mac-build-compatibility`, `prunePackagedRuntimeNodeModules`,
  `verifyPackagedMainRuntimeDeps`, `verifySkillsCliRuntime`, boot du daemon packagé,
  `verifyPackagedPluginResources`, chmod des launchers, signature des helpers
  computer-use / notification-status.
- `files`: liste d'exclusions large ; `asarUnpack`: CLI, daemon, workers
  (ELECTRON_RUN_AS_NODE), sherpa-onnx, ws/tweetnacl/zod/yaml, `resources/**`.
- `win`: `signtoolOptions.publisherName: 'SignPath Foundation'` (électron-builder écrit
  ce publisherName dans `app-update.yml` embarqué, l'updater NSIS vérifie donc les
  signatures), NSIS + daemon uninstall hook.
- `mac`: `hardenedRuntime` / `notarize` / `forceCodeSigning` = `isMacRelease`
  (ORCA_MAC_RELEASE=1), cibles dmg+zip x64/arm64.
- `linux`: AppImage deb rpm, glibc floor, after-install symlink du CLI.
- `npmRebuild: true` + `beforeBuild` qui rebuild et renvoie `false` pour éviter le
  rebuild de `cpu-features` par electron-builder.

### 1.3 Scripts de release (`config/scripts/`)

- `rebuild-native-deps.mjs` — rebuild natif via API `@electron/rebuild` :
  `onlyModules` (node-pty, cpu-features, windows-native-registry) + `force: true`,
  contourne le store pnpm `.pnpm/`, restaure les fichiers ConPTY Windows, sonde les
  modules **dans l'exécutable Electron** (`ELECTRON_RUN_AS_NODE=1`, voir §2.2).
- `electron-builder-native-rebuild.cjs` — hook `beforeBuild`, forward vers
  `rebuild-native-deps.mjs` avec `--platform/--arch` cibles.
- `electron-builder-config.test.mjs`, `electron-builder-native-rebuild.test.mjs`,
  `electron-builder-mac-channel-config.test.mjs` — tests des configs.
- `create-draft-release.mjs` / `publish-complete-draft-releases.mjs` — création /
  finalisation des drafts GitHub (notes générées, récupération de drafts orphelins).
- `verify-release-required-assets.mjs` — gate de publication : liste d'assets
  obligatoires + cross-check des manifests `latest*.yml` uploadés (chaque `url`/`path`
  référencé doit exister sur la release).
- `verify-macos-release-env.mjs` — exige APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/
  APPLE_TEAM_ID/CSC_LINK/CSC_KEY_PASSWORD avant une release macOS.
- `build-mac-local.mjs` — build macOS local ad-hoc avec version `local.<ts>.<sha>`
  (pas de keychain dédiée, pas d'identité de fork).
- `latest-stable-release.mjs`, `release-rc-history.mjs`, `release-title-timestamp.mjs`
  — versioning / calcul de la prochaine version.
- `generate-windows-blockmap.mjs`, `verify-windows-inner-signature.mjs`,
  `resolve-7za-path.mjs` — re-génération blockmap après signature SignPath + gate
  d'évidence des signatures internes.
- `verify-telemetry-constants.mjs` — gate post-publish sur `app.asar`
  (BUILD_IDENTITY non null).
- `setup-hourly-release-token.sh`, `setup-daily-release-repo.sh`,
  `setup-adhoc-release-repo.sh` — provisionnement des repos/credential des dev-channels.
- `packaged-runtime-node-modules.cjs` — **collection BFS du closure de dépendances
  runtime** → extraResources `Resources/node_modules/<pkg>` (voir §2.6), pruning par
  plateforme/arch, `verifyPackagedMainRuntimeDeps` (scanne les `require()` du bundle
  principal dans app.asar et vérifie chaque package copié).

### 1.4 Update feed (`app-update.yml`, electron-updater)

- **Pas de `app-update.yml` embarqué vérifié** : aucun script Orca n'assere le feed
  écrit dans le bundle packagé (grep `app-update.yml` dans config/scripts/ : zéro).
  `config/dev-app-update.yml` ne sert qu'en dev (`provider: github, owner: stablyai,
  repo: orca`).
- `electron-updater` (^6.8.9) est chargé paresseusement
  (`src/main/electron-updater-loader.ts`, defer après first paint), branché sur
  `updater-events.ts`, avec fallback serve + récupération d'install Linux
  (`updater-fallback.ts`, `updater-linux-package-recovery-actions.ts`). Pas de
  `setFeedURL` : le feed est celui d'`app-update.yml` embarqué.
- La vérification du côté feed (pas du côté embarqué) existe :
  `verify-release-required-assets.mjs` + step « Verify update manifest published »
  dans `hourly-mac-build.yml` / `daily-mac-build.yml`.

### 1.5 Signing

- **macOS** : certificats base64 (`CSC_LINK`/`CSC_KEY_PASSWORD`) + notarisation
  `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` (notarytool via
  electron-builder), `hardenedRuntime` + `forceCodeSigning` sur le path release.
  Signature des 2 helpers signés **avant** scellement du .app
  (`afterPack`, `signMacComputerUseHelper`/`signMacNotificationStatusHelper`).
- **Windows** : installers NON signés au moment du packaging → envoi à **SignPath**
  (2 flux : inner binaries .exe/.dll/.node puis installer), rebuild NSIS à partir de
  l'arbre signé (`--prepackaged`), re-génération du blockmap + rewrite `latest.yml`
  (sha512/taille), gate d'évidence des signatures internes (fail-open, extrait
  l'installer avec 7za). Workflow : `release-cut.yml` + rehearsal dédié
  `windows-signing-rehearsal.yml`.
- Pas de keychain dédiée dans le repo (le p12 passe par electron-builder).

### 1.6 CI release (`.github/workflows/`)

- **`release-cut.yml`** (1972 lignes, le cœur) : dispatch manuel (kind rc/patch/minor/
  major, ref, dry_run, version_suffix, version explicite) ou schedule. Job `cut`
  (bump package.json + provenance skills + tag `vX.Y.Z`, fast-forward main) →
  `create-release` (draft via `create-draft-release.mjs`) → jobs `build` (linux-x64,
  linux-arm64 sur ubuntu-24.04-arm, win sur windows-2022 — `--publish always` ou
  `never` + upload gh pour win) → `build-mac` (dispatch `release-mac-build.yml` sur
  Blacksmith macOS) → `publish-release` (vérifie le draft + `verify-release-required-assets.mjs`
  + `gh release edit --draft=false --prerelease=<dérivé du tag>`) →
  `post-release-e2e` + `homebrew-bump`.
- **`release-mac-build.yml`** : build isolé macOS (runner Blacksmith), même séquence
  (verify env → build:release → gates → `--publish always`), vérifie que la release
  reste draft après upload.
- **`hourly-mac-build.yml` / `daily-mac-build.yml` / `adhoc-mac-build.yml`** :
  dev-channels signés + notarisés publiés vers `stablyai/orca-hourly` etc. via un
  GitHub App token (setup-hourly-release-token.sh), rétention 72 builds, vérif
  `latest-mac.yml` avant publication du draft.
- **`win-update-e2e.yml` / `win-crash-survival-e2e.yml`** : E2E de mise à jour.
- Autres : `homebrew-bump.yml` (Casks/), `release-policy.yml`,
  `windows-signing-rehearsal.yml`.

### 1.7 Résumé « comment une release Orca est produite aujourd'hui »

Dispatch (ou schedule) → `release-cut.yml` calcule la version (ancrée sur latest
stable + gardes semver rigoureux), bump + commit `release: vX.Y.Z` + tag, draft GitHub
créé **avant** tout build → matrix build (linux x64/arm64 AppImage+deb+rpm publiés par
electron-builder `--publish always`, Windows packagé puis signé SignPath en 2 temps
avec blockmap/latest.yml réécrits, macOS isolé sur Blacksmith signé Developer ID +
notarisé) → `publish-release` vérifie la complétude des assets + les manifests puis
passe le draft en published (prerelease dérivé du tag) → E2E post-release + bump
Homebrew. Gates de qualité natifs tout au long : rebuild ABI Electron en beforeBuild,
probes `ELECTRON_RUN_AS_NODE` pré-packaging, boot daemon post-pack, glibc floor, gates
de signature Windows.

---

## 2. Patterns emdash (source `/home/dev/emdash`)

Les scripts de release vivent dans **`apps/emdash-desktop/scripts/`** (`release/` pour
le pipeline CI, `fork/` pour le fork local) ; configs : `apps/emdash-desktop/` ;
workflow : `.github/workflows/release-fork.yml`. Repo : workspace pnpm
(`pnpm-workspace.yaml` : `apps/*`, `packages/**`) avec **`node-linker=hoisted`**
(`/home/dev/emdash/.npmrc`).

### 2.1 `scripts/release/rebuild-native.ts` (flag `--project-root`)

Sous node-linker=hoisted, `@electron/rebuild` a besoin de deux choses qu'aucun
répertoire ne fournit seul : le package.json de l'app (pour « quels modules ») et la
racine du workspace (pour « où ils sont physiquement » — hoistés hors de l'app).
`rebuild-native.ts --arch arm64|x64 [--deploy-dir] [--project-root]` passe
`buildPath` + `projectRootPath` à `rebuild()`. Sans `--project-root`, le rebuild
échoue **silencieusement** (exit 0, rien ne rebuild) : la release fork v1.2.8 a shippé
des modules compilés pour le Node système (ABI 137 vs 143 pour Electron 40). Le
workflow CI passe `--project-root "$GITHUB_WORKSPACE"` ; l'upstream CI, lui, passe par
`pnpm deploy --legacy --prod` (`build.ts`) pour obtenir un arbre auto-suffisant.

### 2.2 `scripts/release/verify-native-abi.ts`

Vérification **post-packaging** : exécute le binaire Electron packagé en
`ELECTRON_RUN_AS_NODE=1` (rapporte `process.versions.modules` de l'Electron packagé,
pas de l'hôte) et `process.dlopen()` chaque `.node` packagé (`app.asar.unpacked/...`).
Path absolu exigé (hardened runtime rejette les paths relatifs en dlopen). C'est le
gardefou qui manquait à v1.2.8 : `verify-mac.ts` et `codesign --verify` ne détectent
pas un .node compilé pour la mauvaise ABI.

### 2.3 `scripts/release/verify-fork-feed.ts` + `lib/update-feed.ts`

Asserte le **`app-update.yml` embarqué** du bundle packagé (darwin :
`release/mac-arm64/<App>.app/Contents/Resources/app-update.yml`, win :
`release/win-unpacked/resources/app-update.yml`). `findUpdateFeedProblems()` exige
`owner: 64ix`, `repo: emdash`, interdit les marqueurs upstream (`generalaction`,
`releases.emdash.sh`), et interdit `publisherName` (installers de fork non signés :
NsisUpdater ferait `verifySignature` et refuserait chaque mise à jour). Raison : pas de
`setFeedURL` dans l'app → un fork packagé avec la config upstream **remplacerait
l'installation par la release upstream sans aucune erreur**.

### 2.4 Séquence prepare-release (draft) → build → finalize

- `prepare-release.ts` : version résolue (`lib/version.ts`, `--version` ou calcul),
  refuse une version ≤ latest published, **crée/réutilise une release DRAFT unique**
  avant tout build (idempotent, refuse les drafts multiples, vérifie
  `target_commitish`), émet `release_id` en output.
- `build.ts` (upstream CI) : `pnpm deploy --legacy --prod` → arbre auto-suffisant,
  rebuild natif par arch, `electronBuild()` avec `npmRebuild: false`, `publish: 'always'`,
  config clonée par itération d'arch (mutation `normalizeFiles`), duplication des
  manifests de canal.
- `finalize-release.ts` : retrouve le draft, **vérifie la liste `--required-assets`**
  (explicite, fournie par le workflow), puis `draft: false` + `prerelease`.
- Le workflow `release-fork.yml` : `validate` (repo 64ix/emdash + branch fork-main +
  secrets p12) → `prepare-release` → `release-mac` (keychain dédiée, rebuild
  `--project-root`, `--config electron-builder.fork.config.ts`, verify-mac,
  verify-native-abi, verify-fork-feed) + `release-win` (config fork.windows, vérif
  « artifacts non signés », verify-native-abi, verify-fork-feed) → `finalize-release`.

### 2.5 `scripts/fork/build-fork.sh`

Build macOS local du fork **signé avec une identité auto-signée** pour que
Squirrel.Mac accepte les mises à jour in-place, feed branché sur 64ix/emdash. Keychain
dédiée (`~/.emdash-fork-signing/fork-signing.keychain-db`) créée/ajoutée à la search
list, `unlock-keychain`, identité `Emdash Fork Signing`, export `CSC_KEYCHAIN`/
`CSC_NAME`/`CSC_IDENTITY_AUTO_DISCOVERY`. Version injectée via `extraMetadata` (jamais
committée → rebases upstream sans conflit). `--publish` : draft créé **avant** le
packaging (le `gh release create --draft` évite le 422 « Published releases must have
a valid tag » des publishers concurrents et l'état le pire : release publiée sans
`latest-mac.yml`), finalize manuel : exige `latest-mac.yml` présent sinon laisse le
draft, puis `--draft=false --latest`. L'équivalent CI (`release-fork.yml`) suit le même
montage keychain mais écrit la confiance dans le **domaine admin** (sudo, `add-trusted-cert -d`)
car les runners headless ne passent pas la GUI authd.

### 2.6 `electron-builder.fork.config.ts`

Config de fork = base upstream + compensations **node-linker=hoisted** :

1. `electronVersion` résolu via `createRequire` (électron hoisté à la racine du
   workspace ; electron-builder ne peut pas l'inférer).
2. `publish` → `64ix/emdash`, `releaseType: 'release'` (electron-updater ne voit pas
   les drafts).
3. **Mapping BFS de `node_modules`** : marche le graphe de dépendances avec la
   résolution ascendante de Node et remappe chaque `node_modules` non-racine sous son
   chemin asar (`node_modules/<pkg>/node_modules`), dédupliqué par realpath
   (symlinks de workspace → chaînes infinies sans dédup).
4. **`MISSING_AT_ROOT`** : liste auditées de packages racines que le collecteur
   d'electron-builder ne ramasse pas sous layout hoisted (`@exodus/bytes`,
   `is-docker`, `is-wsl`, `minipass`, `path-scurry`, `punycode`) → extraResources
   explicites.
5. Correction d'ombrage de version : `glob` 7 (transitif racine) vs 13 (déclaré) →
   copies locales dans `out/main/node_modules/`.
6. Approximation du collecteur (« résolution depuis la racine ») pour mapper les
   packages racines que seul le walk réel atteint.
- `electron-builder.fork.windows.config.ts` : variante Windows **non signée** (voir 2.7).

### 2.7 `verifyUpdateCodeSignature: false` (Windows unsigned)

`electron-builder.fork.windows.config.ts` : `azureSignOptions: undefined`,
`signExecutable: false`, **`verifyUpdateCodeSignature: false`**. Supprimer le bloc
Azure ne suffit pas (le signtool manager peut dériver un publisherName de n'importe
quel `CSC_*` d'env) : sans publisherName dans `app-update.yml`, NsisUpdater saute la
vérification — seule façon pour un build non signé de se mettre à jour. Le workflow
assure par ailleurs que les artifacts sont réellement `NotSigned`
(`Get-AuthenticodeSignature`).

---

## 3. Verdict par pattern

### 3.0 Contexte : Orca est-il « pnpm hoisted » ? utilise-t-il electron-builder ?

- **electron-builder : oui** — `^26.15.3` (devDependencies racine), config unique
  `config/electron-builder.config.cjs` (CJS, pas de `*.config.ts`).
- **pnpm hoisted : oui, mais différemment d'emdash.** Orca `.npmrc` :
  `shamefully-hoist=true` (tout est hoisté à la racine `node_modules/`, par-dessus le
  layout isolé par défaut : store `.pnpm/` + symlinks). **Pas** de
  `node-linker=hoisted`, et **pas de workspace** : `pnpm-workspace.yaml` déclare
  `packages: []` (projet unique, mobile/ isolé). Orca est donc un install
  single-project avec racine hoistée : le problème « deux répertoires » d'emdash
  (package.json de l'app vs node_modules du workspace) n'existe pas à l'identique,
  mais le collecteur d'electron-builder rencontre le même genre de limites
  (packages non résolus, arbres profonds dans le store).

### 3.1 `rebuild-native.ts --project-root` — **Déjà couvert (équivalent)**

Orca : `config/scripts/rebuild-native-deps.mjs` + hook `beforeBuild`. Le problème de
rebuild silencieux est traité par d'autres moyens : projet unique (cwd = racine,
`buildPath` suffit), `onlyModules` explicites (contourne le walker défaillant dans le
store `.pnpm/`), `force: true`, et — surtout — un **probe de chargement dans
l'Electron cible** avant/après rebuild qui échoue si le module ne charge pas
(`probeElectronNativeModules`, §1.3). Le flag `--project-root` n'a pas de sens côté
Orca (pas de workspace). **À ignorer** (le mécanisme équivalent est déjà en place et
plus strict sur l'échec visible).

### 3.2 `verify-native-abi.ts` — **Pertinent, partiellement couvert → à porter**

Orca vérifie l'ABI **pré-packaging** (probe ELECTRON_RUN_AS_NODE sur le checkout dev,
`rebuild-native-deps.mjs:529`) et boote le daemon packagé **sous Node simple**
(`verify-packaged-daemon-entry.cjs` — qui charge node-pty et attrape donc les
incompatibilités grossières, mais Node simple ≠ ABI Electron, et rien ne couvre les
autres `.node` : sherpa-onnx, @parcel/watcher, windows-native-registry…). Il manque
exactement le contrôle d'emdash : **dlopen des `.node` packagés avec le binaire
Electron packagé**, dans `afterPack`. C'est peu coûteux et c'est le seul garde qui
prouve ce que l'utilisateur recevra.

### 3.3 `verify-fork-feed.ts` + `lib/update-feed.ts` — **Manquant, pertinent → à porter**

Aucun script Orca n'asserte l'`app-update.yml` embarqué (§1.4). Pour le fork
`64ix/orca` le scénario d'emdash s'applique à l'identique : un build de fork packagé
avec la config upstream (le `publish` actuel pointe `stablyai/orca`) s'offrirait les
releases stablyai et remplacerait les features du fork sans erreur — d'autant que
`electron-updater` est utilisé sans `setFeedURL`. La config Orca a en plus le cas des
dev-channels (`repo: orca-hourly/daily/adhoc`) : l'assertion doit accepter le repo de
fork prévu pour le canal, pas un seul repo fixe.

### 3.4 Séquence prepare (draft) → build → finalize (check assets → publish) — **Déjà couvert**

Orca fait exactement cela, en mieux : draft créé avant build (`create-draft-release.mjs`),
assets uploadés dans le draft (avec vérif « release reste draft » après upload),
`verify-release-required-assets.mjs` (liste d'assets + cross-check des manifests
`latest*.yml` — plus fort que la liste plate de `finalize-release.ts`), puis
`--draft=false --prerelease` dérivé du tag (avec garde anti-flip electron-builder). La
récupération de drafts orphelins existe aussi (`publish-complete-draft-releases.mjs`,
recover_unpublished_tag). **À ignorer** (déjà en place). Seul détail emdash absent :
refus des versions ≤ latest published côté script local — mais Orca fait ce contrôle
dans le workflow (`semver_gt`), donc équivalent.

### 3.5 `build-fork.sh` (macOS auto-signé, keychain dédiée) — **Pertinent pour le fork → à porter (adapté)**

Orca n'a pas d'équivalent : `build-mac-local.mjs` produit des builds ad-hoc (version
`local.*`, pas d'identité stable), et le path release CI dépend des secrets
`CSC_LINK`/Apple de stablyai. Pour publier des builds de fork update-ables, il faut un
canal de signé/notarisé propre (Developer ID du fork, ou self-signed pour un usage
personnel comme emdash). Deux pièces à transposer : (a) **keychain dédiée + identité
auto-signée** de `build-fork.sh` (et sa version CI dans `release-fork.yml` avec trust
admin sudo) ; (b) **draft créé avant packaging** + finalize exigeant `latest-mac.yml`
— déjà implémenté côté Orca pour les dev-channels (hourly-mac-build.yml), donc
l'infrastructure (repos séparés `64ix/orca-hourly`, token GitHub App) existe et peut
servir telle quelle au fork.

### 3.6 `electron-builder.fork.config.ts` (BFS node_modules + MISSING_AT_ROOT) — **Déjà couvert (équivalent)**

Orca possède déjà `config/packaged-runtime-node-modules.cjs` : collecte récursive du
closure de dépendances des racines runtime (`PACKAGED_RUNTIME_PACKAGE_ROOTS`) → mappings
extraResources vers `Resources/node_modules/`, déduplication par realpath, pruning par
plateforme/arch (node-pty, @parcel/watcher, sherpa, zod, .d.ts), et
`verifyPackagedMainRuntimeDeps` qui scanne les `require()` réels du bundle principal
dans app.asar et échoue si un package manque — une assertion plus directe que la liste
`MISSING_AT_ROOT` (auditée manuellement chez emdash). L'approche diffère (copie du
closure complet vs remapping des node_modules imbriqués) mais le problème couvert est
le même : le collecteur d'electron-builder est aveugle sous layout pnpm hoisté. Deux
améliorations d'emdash éventuellement récupérables : l'approximation du collecteur
(§2.6.6) et la gestion explicite de l'ombrage de versions (`glob` 13 vs 7) —
`verifyPackagedMainRuntimeDeps` ne couvre que le bundle main + agent-hooks, pas tous
les packages packagés.

### 3.7 `verifyUpdateCodeSignature: false` Windows unsigned — **Non applicable à l'upstream, pertinent pour le fork**

L'upstream Orca **signe** ses installers Windows (SignPath, publisherName
`SignPath Foundation` dans la config → app-update.yml) : la vérification de signature
est non seulement possible mais activée par `signtoolOptions.publisherName`. Le
pattern emdash ne s'applique qu'à un fork **sans certificat Windows** : dans ce cas,
la leçon (déclarer explicitement `verifyUpdateCodeSignature: false` + `signExecutable:
false` + vérifier que les artifacts sont `NotSigned`, plutôt que d'espérer l'absence
de config) doit être portée dans la config de fork Orca — sinon NsisUpdater refuse
chaque mise à jour. C'est aussi exactement le cas que le portage de §3.3 doit
verrouiller (publisherName interdit dans l'app-update.yml embarqué du fork).

---

## 4. Recommandation finale

### À porter côté Orca (chemins cibles suggérés)

| Pattern emdash | Verdict | Portage suggéré côté Orca |
| --- | --- | --- |
| **verify-native-abi** (dlopen des `.node` packagés via le binaire Electron packagé, ELECTRON_RUN_AS_NODE) | Manquant (probe pré-packaging seulement) | Nouveau `config/scripts/verify-packaged-native-abi.mjs` + test, appelé dans `afterPack` de `config/electron-builder.config.cjs` (à côté de `verifyPackagedDaemonEntryBoots`) ; cible `app.asar.unpacked/node_modules/**/*.node` (node-pty, sherpa-onnx, @parcel/watcher, windows-native-registry). Chemins absolus (hardened runtime). |
| **verify-fork-feed** (assertion `app-update.yml` embarqué) | Manquant | Nouveau `config/scripts/verify-fork-feed.mjs` + test, paramétré (owner/repo attendus par canal : `64ix/orca`, `64ix/orca-hourly`…) ; à brancher dans le workflow de release du fork et/ou dans l'`afterPack` quand `EMDASH`-like env de fork présent ; interdire `publisherName` sur les builds de fork non signés. |
| **build-fork.sh** (keychain dédiée + identité auto-signée + draft avant packaging + exigence `latest-mac.yml`) | Absent | `config/scripts/fork/build-fork.sh` (ou `scripts/fork/`) + section FORK.md ; réutiliser l'infra dev-channel existante (setup-hourly-release-token.sh, repos `64ix/orca-*`) ; la moitié « draft avant packaging / finalize » est déjà couverte par release-cut.yml/hourly-mac-build.yml. |
| **Config de fork** (publish → `64ix/orca` + `releaseType: 'release'` + `electronVersion` + compensations hoisted) | Absent en tant que fichier de fork | `config/electron-builder.fork.config.cjs` (étendre la config racine, comme `config/electron-builder.config.cjs`) ; pour Windows non signé : `win.verifyUpdateCodeSignature = false` + `signExecutable: false` + vérif `NotSigned` dans le workflow. |
| **Ombrage de versions** (glob 13 vs 7) | Non couvert par l'assertion actuelle | Étendre `verifyPackagedMainRuntimeDeps` (packaged-runtime-node-modules.cjs) à un audit « chaque package.json packagé résoluble depuis sa localisation asar » — l'équivalent automatisé de `MISSING_AT_ROOT`. |

### À ignorer

| Pattern | Raison |
| --- | --- |
| `rebuild-native.ts --project-root` | Problème workspace+hoisted inexistant côté Orca (projet unique) ; `onlyModules`+probe de chargement remplacent déjà le mécanisme et détectent l'échec. |
| Séquence prepare→build→finalize | Orca l'a déjà (release-cut.yml, create-draft-release, verify-release-required-assets) — avec des gardes plus forts (cross-check manifests, anti-flip draft, récupération de tags orphelins). |
| BFS node_modules + MISSING_AT_ROOT (tels quels) | `config/packaged-runtime-node-modules.cjs` couvre le même problème (closure BFS → extraResources + pruning + vérif des require réels) ; ne reprendre que l'extension d'audit suggérée ci-dessus. |
| `pnpm deploy --legacy --prod` (`build.ts`), duplication de manifests R2 (`lib/artifacts.ts`), notarisation manuelle via `@electron/notarize` | Spécifiques au pipeline upstream emdash ; Orca a déjà ses équivalents (extraResources du closure, dev-channels, notarisation electron-builder). |

### Ordre d'exécution suggéré

1. `verify-fork-feed` — le plus gros risque du fork (remplacement silencieux par l'upstream), indépendant de tout le reste.
2. `verify-native-abi` post-pack — garde de qualité packaging générique (profite aussi aux releases upstream).
3. Config de fork (`electron-builder.fork.config.cjs`) + workflow de release fork (calqué sur release-fork.yml, avec keychain CI + verifyUpdateCodeSignature pour Windows).
4. `build-fork.sh` local + doc FORK.md (peut s'appuyer sur 3).

Note : tout portage du fork doit rester derrière des gardes explicites (env/flag de
fork) pour ne pas altérer le pipeline upstream `stablyai/orca`, qui est intact et
considérablement plus riche que celui d'emdash.
