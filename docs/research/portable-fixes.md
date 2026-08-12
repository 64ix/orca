# Fixes portables emdash → Orca — audit des 5 candidats

Recherche uniquement (aucun changement de code). Source : fixes du fork emdash (`/home/dev/emdash`, branche `fork-main`), vérifiés contre le worktree Orca actuel (`initial-exploration`).

Contexte de structure : les deux codebases ont divergé profondément. emdash est un fork d'Orca réorganisé en « tasks » avec worktrees + specs (stages dérivés des PR) ; Orca attache les PR aux worktrees par **lookup de branche** et n'a ni « task », ni dérivation de stage depuis une PR.

---

## 1. emdash #146 (8974ad19c) — les PR sans rapport ne doivent pas prouver le stage/PR d'une task

**Verdict : `different` — le bogue n'existe pas côté Orca (pas de matching PR↔issue par body ; attribution PR strictement par branche de worktree).**

Le fix emdash corrige `findSpecMatchingPrs` (shared/core/pull-requests/pr-workflow-derivation.ts) : (a) le body matching doit respecter le qualifier owner/repo (`owner/repo#N`, `/issues/N` URL) au lieu du regex nu `(?:#|/issues/)N`, et (b) `getTaskPrBranch` ne traite que les branches de worktrees comme « la branche de la task », jamais la branche partagée d'un workspace project-root.

Côté Orca, aucune des deux machines n'existe :

- **Pas de matching par body.** Aucun équivalent de `bodyReferencesIssueNumber`/`findSpecMatchingPrs` (grep `findSpecMatchingPrs|bodyReferencesIssueNumber|branchReferencesIssueNumber|getTaskPrBranch` → 0 hit). `src/main/source-control/pull-request-linked-issue.ts:47-79` ne fait que **charger** l'issue déjà attachée (meta `linkedIssue` stockée à la création du worktree) pour les prompts de génération de PR ; il ne matche jamais de PR vers une issue.
- **L'attribution PR est purement par branche**, et chaque worktree Orca possède sa propre branche :
  - `gh:prForBranch` IPC : `src/main/ipc/github.ts:263-319` → `getPRForBranch`/`getPRForBranchOutcome` (`src/main/github/client.ts:3202-3234`) : lookup scoped aux candidats du repo (`resolveGitHubApiRepositoryCandidates`) avec filtre `--head` par nom de branche.
  - Les workspaces « folder » (équivalent le plus proche d'un project-root partagé) ne peuvent pas recevoir de PR : `folderWorkspaceToWorktree` met `linkedPR: null` et `branch: ''` (`src/shared/folder-workspace-worktree.ts:21,45`), et les candidats de refresh sont filtrés sur `row.worktree.branch` non vide (`src/renderer/src/components/sidebar/WorktreeList.tsx:3786`).
- Les gardes existantes couvrent déjà les faux positifs de branche proches : masquage des PR non-ouvertes sur la branche par défaut (`src/main/github/client.ts:3449-3465`), appartenance du HEAD à la PR mergée (`merged-pr-commit-membership.ts`).

**Note de portage :** rien à porter. Si un jour Orca matche une PR à une issue par body, reprendre la leçon emdash (références repo-qualifiées, `.git` strip, frontière de token sur `#N` nu).

---

## 2. emdash #83 (901e2516b) — Node ne peut pas spawner les shims Windows .cmd/.bat directement

**Verdict : `present` — mécanisme équivalent déjà en place (deux implémentations, plus de sites d'appel que chez emdash).**

Le fix emdash (`packages/runtime/src/acp-agents/node/child-process-host.ts`) route les `.cmd`/`.bat` via `%ComSpec%` avec `/d /s /c` + quoting explicite par token (`quoteForCmdExe`, `wrapCmdExeCommandLine`), sans `shell: true`.

Orca a déjà la même posture, sous deux formes :

1. **`getSpawnArgsForWindows`** — `src/shared/windows-batch-spawn.ts:55-89` (ré-exporté par `src/main/win32-utils.ts`) : route `.cmd`/`.bat` via `getCmdExePath()` (honore `ComSpec`, `windows-batch-spawn.ts:4-9`) en `['/d', '/c', command, ...args]`, plus variante `detachedGui` (`start "" /B`, lignes 68-85). Utilisé par : git runner (`src/main/git/runner.ts:728`), codex accounts (`src/main/codex-accounts/service.ts:1646-1647`), rate-limits (`src/main/rate-limits/codex-fetcher.ts:638-641`), codex trust-grant/session-heal (`src/main/codex/codex-trust-grant-host.ts:62`, `codex-session-index-heal.ts:266`), génération de texte (`src/main/text-generation/commit-message-text-generation.ts:366,658`), skills (`src/main/skills/skill-update-run.ts:100`), éditeurs externes (`src/main/external-editor-launch.ts:257,272`), CLI (`src/cli/handlers/account.ts:96`, `skills.ts:126`).
2. **`buildWindowsCommandInvocation`** — `src/main/claude-accounts/windows-command-invocation.ts:19-29` : `cmd.exe /d /v:off /s /c` + quoting par token + `windowsVerbatimArguments: true` (très proche du `quoteForCmdExe` emdash, avec échappement `%`), utilisé par `src/main/claude-accounts/service.ts:1066-1074`.

Différence de politique : Orca **rejette** les args contenant `& | < > ^ " % !` (`UnsafeWindowsBatchArgumentsError`, `windows-batch-spawn.ts:15-40`) là où emdash les échappe ; et Orca ajoute `/s` seulement dans la variante claude. Pas de `shell: true` sur les chemins d'agents (les commentaires DEP0190 citent explicitement la même motivation : `codex-accounts/service.ts:1646`, `codex-fetcher.ts:638`).

Sites `shell: true` restants — tous délibérés, hors périmètre du fix :
- `src/cli/runtime/launch.ts:26` et `:264` : lancement de l'app via `ORCA_OPEN_COMMAND`/`ORCA_APP_EXECUTABLE` (chemin de dev/override, `.cmd`/`.bat` via `{ shell: true }`).
- `src/shared/ephemeral-vm-recipe-process.ts:46` : les recettes VM sont du texte shell (documenté).
- `src/main/automations/precheck-runner.ts:134` : la commande precheck est une chaîne shell configurée par l'utilisateur.
- La doc `docs/reference/windows-setup-shell.md` documente la convention `.cmd` du setup-runner (et le launcher PowerShell `ProcessStartInfo` pour les panes Git Bash).

**Note de portage :** rien à porter ; le seul « gap » éventuel est `launch.ts:264` (shim `.cmd` du CLI de dev), qui pourrait réutiliser `getSpawnArgsForWindows`.

---

## 3. emdash #75 (a944c8ae2) — posture de confiance explicite du renderer markdown (default-deny sur clics d'ancre)

**Verdict : `present` — le default-deny existe déjà dans le renderer principal, avec défense en profondeur.**

Le fix emdash fait `preventDefault()` **avant** tout dispatch dans `handleAnchorClick` (plus exemption `#fragment`), et ajoute un prop `trust` qui bloque images/HTML non fiables.

Côté Orca, `MarkdownPreview` (`src/renderer/src/components/editor/MarkdownPreview.tsx`) applique déjà exactement ce pattern :

- `event.preventDefault()` inconditionnel en tête du handler : `MarkdownPreview.tsx:1379` (default-deny avant dispatch).
- `#fragment` → scroll intra-document : `MarkdownPreview.tsx:1381-1384`.
- `http(s)` → routage via `openHttpLink` (honore « open links in Orca », escape hatch Cmd/Ctrl+Shift) : `MarkdownPreview.tsx:1459-1471` + `markdown-preview-links.ts:102-130`.
- `file:` → résolution workspace (`resolveMarkdownLinkTarget`) : `MarkdownPreview.tsx:1473-1489`.
- Toute autre destination : rien ne s'ouvre (le default a été prévenu).
- Détail notable : un href relatif non réclamé ne navigue nulle part — même garantie que le fix emdash.

Défense en profondeur au niveau de la fenêtre : `src/main/window/privileged-window-navigation.ts:6-33` — `setWindowOpenHandler` deny + `shell.openExternal`, `will-navigate` preventDefault — une ancre qui échapperait au handler ne pourrait pas naviguer le renderer entier.

Autres renderers : l'éditeur riche (tiptap) n'ouvre les liens que sur clic Cmd/Ctrl (modifier requis : `rich-markdown-editor-click-routing.ts:76-91`, `useModifierHeldClass.ts`), le markdown de commentaires (sidebar/dialogues) utilise `target="_blank"` + stopPropagation/preventDefault sur `file:` (`src/renderer/src/components/sidebar/comment-markdown-element-renderers.tsx:27-39`), et bloque les images distantes (`isTrustedCompactImageSrc`, lignes 17-25, 145-161). La « posture de confiance » Orca est par-composant (trust posture distribué) plutôt que par prop explicite comme emdash.

**Note de portage :** rien à porter ; si une future surface réutilise react-markdown sans ce pattern, copier la séquence préventDefault → dispatch d'`MarkdownPreview.tsx:1374-1489`.

---

## 4. emdash #144 (d45c68b6b) — DnD sidebar : narrowing TypeScript (`Extract<…>`, `DragEndEvent['over']` nullable)

**Verdict : `different` — aucune implémentation équivalente côté Orca ; la seule zone @dnd-kit d'Orca garde déjà `over`.**

Le fix emdash (`renderer/features/sidebar/sidebar-card-list.tsx`) corrige des erreurs tsgo : handlers typés `Extract<SidebarDndId, {kind:'task'}>` non-narrowisables, lecture de `over.rect` sur `DragEndEvent['over']` (nullable), plus un trou latent de drop mixte.

Côté Orca :

- La sidebar (`WorktreeList`, kanban workspace) n'utilise **pas** @dnd-kit : c'est un drag&drop DOM pointeur maison (`workspace-kanban-card-pointer-drag-dom.ts`, `workspace-kanban-sidebar-drop.ts`, `worktree-lineage-drag-drop.ts`, `worktree-manual-order.ts`), sans union discriminée `Extract<…>` dans les params de handlers ni lecture de `DragEndEvent['over']`.
- Le seul @dnd-kit d'Orca est l'onglet drag (`tab-group/`, `tab-bar/`) : `tab-insertion.ts:29-43` lit `event.over.rect` **après** le garde `if (!event.over || !isTabDragData(activeData) || !isTabDragData(overData)) return` (lignes 31-43) — le même pattern `!over` guard que le fix emdash ; `useTabDragSplit.ts:421` re-garde `if (!event.over)`.
- Le problème tsgo (non-narrowing d'un discriminant dans un type de param) ne se pose pas : aucun handler n'est typé `Extract<…>`.

**Note de portage :** non applicable. Si Orca introduisait des handlers @dnd-kit typés par `Extract`, préférer des alias de membres explicites et des params `NonNullable` avec garde à l'appel — la leçon emdash est déjà intégrée aux conventions du code tab-drag.

---

## 5. emdash #139 (b59249377) — viewStateCache.get peut renvoyer null → restoreSnapshot(null) crash

**Verdict : `different` — la chaîne de restore Orca ne peut pas recevoir de snapshot null (défaut à la source + merge tolérant).**

Le fix emdash normalise `null` → `{}` dans `restoreSnapshot` (workspace-view-model.tsx) car `viewStateCache.get` renvoie `null` (pas `undefined`) et le `= {}` par défaut ne couvrait pas le crash.

Côté Orca, il n'y a pas de `viewStateCache` renderer ; la persistance de session suit un chemin où le null est éliminé en amont :

- Côté main : `getWorkspaceSession` ne renvoie jamais null — `?? getDefaultWorkspaceSession()` pour la partition locale comme pour les partitions host (`src/main/persistence.ts:6301-6307`, défaut : `src/shared/constants.ts:531-548`) ; les partitions corrompues sont zod-validées et remplacées par le défaut côté main (« Corrupt partitions never reach here », `src/renderer/src/lib/workspace-session-host-persistence.ts:300-301`).
- IPC : `session:get` renvoie ce session toujours non-null (`src/main/ipc/session.ts:9-11`).
- Merge multi-host : tolère les slices null/undefined (`if (!slice) continue`, `src/renderer/src/lib/workspace-session-host-split.ts:279-282` ; test explicite : `workspace-session-host-split.test.ts:295`).
- Les hydrators (`hydrateWorkspaceSession`/`hydrateTabsSession`/`hydrateEditorSession`/`hydrateBrowserSession`, appelés à `src/renderer/src/App.tsx:998-1004`) reçoivent donc un `WorkspaceSessionState` non-null.

**Note de portage :** le bogue ne peut pas se produire aujourd'hui. Si un futur stockage de view-state par-worktree (type cache clé→snapshot) est ajouté, appliquer la normalisation emdash (`savedSnapshot ?? {}`) dès le getter — `null` et `undefined` y sont sémantiquement différents.

---

## Résumé (verdicts)

1. **#146 PR↔issue** — `different` : Orca n'a pas de matching PR↔issue par body, ni de branche partagée de workspace project-root ; l'attribution PR est par branche de worktree avec gardes déjà en place. Rien à porter.
2. **#83 shims Windows .cmd** — `present` : `getSpawnArgsForWindows` (`windows-batch-spawn.ts`) et `buildWindowsCommandInvocation` routent déjà via cmd.exe/ComSpec sur tous les sites d'agents (codex, claude, git), sans `shell: true` ; seule différence : Orca rejette les chars dangereux au lieu de les échapper.
3. **#75 markdown default-deny** — `present` : `MarkdownPreview.tsx:1379` fait déjà preventDefault inconditionnel avant dispatch, fragments `#` → scroll intra-doc, plus `will-navigate`/`setWindowOpenHandler` en défense en profondeur ; l'éditeur tiptap exige un clic modificateur.
4. **#144 DnD narrowing TS** — `different` : la sidebar Orca est en drag pointeur DOM maison (pas de @dnd-kit, pas de `Extract`), et l'unique usage @dnd-kit (tab-drag) garde déjà `!over` avant de lire `over.rect`.
5. **#139 viewStateCache null** — `different` (protégé) : `getWorkspaceSession` défaut à `getDefaultWorkspaceSession()` côté main et le merge multi-host tolère les slices null ; aucun restore ne peut recevoir null. À garder en tête pour tout futur cache de view-state.

Conclusion : aucun des 5 fixes n'a besoin d'être porté tel quel ; les équivalents présents côté Orca couvrent 3 cas (#83, #75, et en amont #139), et les 2 autres (#146, #144) ne s'appliquent pas à l'architecture Orca.
