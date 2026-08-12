# Go/No-go — 3 features emdash optionnelles pour Orca

Recherche pure (aucune modification de code). Repo : worktree `orca-fork/initial-exploration`. Date : 2026-08-12.

---

## 1. Usage gauge dans la sidebar (emdash Spec #16)

### État Orca actuel

**Données (déjà complètes)**
- Type de données : `ProviderRateLimits` dans `src/shared/rate-limit-types.ts` — `session` (fenêtre 5 h), `weekly` (7 j), `fableWeekly` (Claude), `monthly` (30 j, OpenCode Go/Grok), `buckets` nommés (Gemini), `planType`, `status` (`idle|fetching|ok|error|unavailable`), reset credits Codex, `resetsAt` par fenêtre.
- Fetchers par provider dans `src/main/rate-limits/` (claude-fetcher.ts, codex-fetcher.ts, gemini-usage-fetcher.ts, grok-fetcher.ts, kimi-fetcher.ts, minimax-fetcher.ts, opencode-go-usage-fetcher.ts) + `service.ts` (polling). Les 8 providers (dont antigravity) alimentent l'état `rateLimits` du store renderer.

**Affichage actuel (où, comment)**
- **Status bar** (bandeau 24 px en bas de fenêtre, `App.tsx:2499`) : `src/renderer/src/components/status-bar/StatusBar.tsx` — un segment par provider : icône + MiniBar (barre 48×6 px) + % par fenêtre (mode verbose) ou % du plus tendu (mode compact) ; état sign-in / error / unavailable géré.
- Clic sur le roster → **popover `UsageRosterPanel`** (`src/renderer/src/components/status-bar/UsageRosterPanel.tsx`, 360 px) : une ligne par agent triée par consommation, barres par fenêtre (`UsageMetric` : label + barre + %), compte à rebours de reset live (`useResetCountdownClock`), toggle Detailed/Compact, bouton refresh, drill-in par provider (switcher de comptes Claude/Codex, reset Codex), footer « Usage details & history » → Settings. Composant **autonome, piloté par props** (`providers`, `display`, callbacks) — réutilisable hors status bar tel quel.
- **Stats & Usage** : Settings → `StatsPane` (`src/renderer/src/components/stats/StatsPane.tsx`, monté dans `src/renderer/src/components/settings/Settings.tsx:1702`) — historique de facturation agrégé par `src/main/usage/` (usage-rollup-records.ts, usage-rollup-merge.ts, usage-event-aggregation.ts), alimenté par `src/main/claude-usage/` et `src/main/opencode-usage/` (tokens post-hoc, pas des rate limits).

**Slot bas de sidebar**
- `src/renderer/src/components/sidebar/index.tsx:129-138` : zone basse **fixe** existante (`<div className="relative shrink-0">`) contenant `SetupScriptPromptCard` (souvent vide) + `SidebarToolbar` (settings/help, scroll-to-current, kanban). C'est là que la jauge se poserait — pas de nouvelle API nécessaire, juste un composant supplémentaire dans ce fragment.

### Analyse
- C'est **uniquement un nouveau placement d'un widget existant** : les données (rate-limits), le rendu compact (MiniBar/ProviderSegment), le popover de détails (UsageRosterPanel), le mode compact (UsageRow `compact`/`getTightestUsageSection`) existent tous. Zéro travail backend.
- Travail réel : monter un trigger compact + `UsageRosterPanel` dans le slot bas de la sidebar (réutilisation directe), + une option de mise en page (toggle) pour éviter le doublon visuel avec le status bar, qui affiche déjà les mêmes jauges compactes.
- Chevauchement réel avec le status bar (mêmes données, même granularité) : la valeur ajoutée est la **visibilité permanente multi-provider** dans la zone la plus regardée (le status bar peut être réduit en icônes-only ou masqué), pas une nouvelle donnée.

### Verdict : **GO** (conditionnel)
La valeur ajoutée est la permanence de l'aperçu multi-provider dans la zone la plus scrutée ; le travail est un placement UI pur (~1-2 j, réutilisation de UsageRosterPanel/ProviderSegment) — mais uniquement en option de mise en page activable, sinon doublon pur du status bar.

---

## 2. Catalogue de skills installable (skills.sh / ~/.agentskills)

### État Orca actuel
- **8 skills bundlés** dans `/skills` (computer-use, linear-tickets, orca-cli, orca-emulator, orca-emulator-android, orca-linear, orca-per-workspace-env, orchestration).
- **Discovery** : `src/main/skills/discovery.ts` + `skill-discovery-sources.ts` — racines scannées : homes agents (`~/.codex/skills`, `~/.agents/skills`, `~/.claude/skills`, `~/.grok/skills`, `~/.config/opencode/skills`, `~/.gemini/skills`, cursor, pi, omp…), repo (`.agents/skills`, `.claude/skills`), bundled, plugin (cache Claude, `claude-plugin-skill-sources.ts`). Une skill posée dans `~/.agents/skills` (donc installée via skills.sh/npx) **est déjà découverte et listée**.
- **Vue Skills** : `src/renderer/src/components/skills/SkillsPage.tsx` — recherche, filtres provider/source, cartes (`SkillCard.tsx`) avec badge « Installed/Available » et bouton « Reveal file ». **Le badge « Available » est un ornement mort** : `discovery.ts:213` met `installed: true` sur tout ; aucun chemin ne produit un skill non installé.
- **Installation** : **aucun mécanisme d'installation de skills externes depuis l'UI**. Les seuls « Install » (Settings : `AgentSkillSetupPanel.tsx`, `CliSection.tsx`, `ComputerUseSkillSetupPanel.tsx`, `LinearAgentSkillPane.tsx`…) exécutent une commande shell (`src/renderer/src/lib/agent-feature-install-commands.ts` : `ORCA_CLI_SKILL_UPDATE_COMMAND`…) pour les skills **d'Orca eux-mêmes**.
- **Update/freshness** : `src/main/skills/skill-update-run.ts` spawn `npx --yes skills update <names> --global -y` (le CLI officiel anthropic-ai/skills), avec inventaire (`skill-freshness-inventory.ts`), verrous git-tree (`skill-git-tree-identity.ts`), convergence (`skill-update-convergence.ts`), UI : `SkillFreshnessNudge`/`SkillFreshnessUpdateDialog`/`SkillUpdateStatusSegment`.
- **Précédent marketplace** : les **plugins** ont un vrai marketplace git + installer avec provenance (`src/main/plugins/plugin-marketplace-service.ts`, `plugin-marketplace-installer.ts`, `plugin-install-staging.ts`, marché officiel « Orca Plugins »). Rien d'équivalent pour les skills.

### Analyse
- Un catalogue externe (openai/anthropic/skills.sh) serait une vraie valeur ajoutée : la **découvrabilité** d'un écosystème tiers, que les 8 skills bundlés + la discovery passive ne couvrent pas aujourd'hui (installer suppose déjà de connaître skills.sh en ligne de commande).
- L'infrastructure est presque prête : la discovery scannera déjà `~/.agents/skills` (où skills.sh installe), le pattern spawn du CLI `npx --yes skills …` est déjà établi (`skill-update-run.ts` — `skills add` fonctionne sur le même rail, y compris Windows via `getSpawnArgsForWindows`), et le badge « Available » + la vue Skills existent mais ne sont jamais branchés.
- Travail : un panneau « catalogue » (listing distant ou git-clone de la lib) + IPC d'installation (`npx skills add`) + brancher le badge Available de SkillCard ; les invariants de fraîcheur/verrouillage du CLI restent côté `skills`, pas à porter.

### Verdict : **GO**
Valeur ajoutée réelle (découvrabilité d'un écosystème tiers, seul moyen aujourd'hui = shell manuel) ; le travail est un pipeline d'install calqué sur l'existant (`npx --yes skills add`, pattern de skill-update-run.ts) + un panneau UI ; la vue Skills et le badge « Available » inerte attendent déjà ce branchement.

---

## 3. Context usage donut (dépend du protocole ACP `usage_update`)

### État Orca actuel
- **Aucune mesure de contexte de session live.** Les tokens présents dans le code sont de la **facturation post-hoc** : `src/main/opencode-usage/` (scanner des DB opencode : inputTokens/cached/output/reasoning), `src/main/claude-usage/store.ts`, agrégés par `src/main/usage/` (usage-rollup) → Stats & Usage (tokens/jour, sessions récentes). Rien de temps réel, rien lié à une fenêtre de contexte.
- **AI Vault** (`src/shared/ai-vault-types.ts`, `src/renderer/src/components/right-sidebar/AiVault*`) : sessions avec modèle, statut, timestamps, sous-agents — **aucun token, aucun contexte**.
- **Composer** : il existe bien un composer de chat Claude (`src/renderer/src/components/native-chat/NativeChatComposer.tsx`), mais c'est un rendu PTY du TUI Claude ; aucun indicateur de contexte n'y est affiché. Recherche `context window`/`context usage`/`contextTokens` dans `src/` : **zéro occurrence**.
- ACP : confirmé out of scope pour le fork ; `usage_update` est le seul canal fiable de mesure de contexte.

### Analyse — un équivalent PTY est-il possible ?
- Le seul composant « composer » est un miroir PTY du TUI Claude/Codex ; mesurer le contexte exigerait de parser la sortie du TUI (pas de frame structurée, pas de JSON, pas d'API) → parsing fragile, aucune donnée de fenêtre (max tokens) exploitable, effort sans valeur à l'arrivée.

### Verdict : **NO-GO** (reste out)
Aucune donnée de contexte n'existe nulle part, le seul canal fiable (ACP `usage_update`) est out of scope, et un équivalent PTY serait du parsing fragile de sortie TUI sans contrat — à ne pas faire.

---

## Résumé

| # | Feature | Verdict | Raison |
|---|---------|---------|--------|
| 1 | Usage gauge sidebar | **GO** (option UI) | Placement pur d'un widget existant (UsageRosterPanel/ProviderSegment) dans le slot bas de sidebar déjà présent (`sidebar/index.tsx:129-138`) ; valeur = permanence de l'aperçu, pas nouvelle donnée |
| 2 | Catalogue de skills installable | **GO** | Vrai gap de découvrabilité ; pipeline `npx --yes skills add` calqué sur skill-update-run.ts déjà en place, vue Skills + badge « Available » inertes prêts à brancher |
| 3 | Context usage donut | **NO-GO** | Aucune mesure de contexte dans Orca ; ACP usage_update out of scope ; équivalent PTY = parsing fragile sans contrat |

**Résumé (5-8 lignes)** : Le gauge sidebar (1) est un GO léger : Orca a déjà les données (rate-limits multi-provider, `shared/rate-limit-types.ts`), le widget compact (MiniBar) et le popover de détails (UsageRosterPanel), et la sidebar possède un slot bas fixe (`sidebar/index.tsx`); ce n'est qu'un placement optionnel, à activer par toggle pour ne pas doubler le status bar. Le catalogue de skills (2) est un GO : l'installation externe n'existe pas (les « Install » de Settings ne concernent que les skills d'Orca), mais la discovery scanne déjà `~/.agents/skills`, le rail `npx --yes skills` est établi (skill-update-run.ts) et la vue Skills affiche un badge « Available » jamais branché. Le context donut (3) est un NO-GO : aucun comptage de contexte n'existe (les tokens présents sont de la facturation post-hoc pour Stats & Usage), le seul canal fiable est ACP usage_update, out of scope ; un parse PTY serait fragile et sans contrat.
