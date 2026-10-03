# Project Guidance

## User Preferences

- User-facing help text must be clear, intuitive, and simple
- Include only useful, non-obvious information in help content — no filler
- Place user-facing documentation at the bottom of the page, above the footer
- The User Manual should be available upfront on the home view, not only after a wallet search

## Verified Commands

- **typecheck**: `pnpm typecheck`
- **fix**: `pnpm fix`
- **build**: `pnpm build`

## Learnings

- ConstellationGraph reads colors via cssVar('--token') at render time; audit token usage with exact-name matching because '--graph-edge' is a prefix of '--graph-edge-icp'.
- The graph legend is owned by ConstellationGraph.tsx and absolutely positioned bottom-left, so zoom controls must stay bottom-right to avoid overlap.
- The User Manual and Manage Added Tokens sections are gated on hasData and render above the footer at page bottom.
- Local visual QA of this app always logs CANISTER_ID_BACKEND errors and a ledger-api 404; these are environment artifacts, not app defects.
- Verified commands from src/frontend/: pnpm typecheck, pnpm fix, pnpm build.
- UserManual renders unconditionally in the non-comparison main (no hasData gate) and is collapsed by default via the ui/collapsible primitive; ManageTokensSection keeps its hasData gate.
- CollapsibleTrigger from ui/collapsible renders a real button, so aria-expanded plus a rotating chevron gives keyboard and screen-reader support without extra ARIA roles.
- UserManual.tsx is self-contained: a collapsible Card rendering an inline SECTIONS array of {id,title,body} objects; there is no external content/config file.
- UserManual SECTIONS entries render in array order, so a new section placed last appears in the final grid cell; data-ocid derives automatically as manual.item.<id>.
- The full check sequence (pnpm typecheck && pnpm fix && pnpm build) passes for this app with no diagnostics; biome reports 'No fixes applied'.
- Summary stats (Total Txs/In/Out, Counterparties, Daily Activity, token holdings, highlights) are computed from the full time-filtered transaction list; graph top-N cuts and depth caps only affect what is drawn. Network Breakdown is the one panel fed from the trimmed graph.
- Stats are bounded by DEFAULT_TX_LIMIT = 100 per address and the UI shows '100+' when the cap is reached.
