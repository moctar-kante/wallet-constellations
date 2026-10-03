mixin () {
  /// Static Markdown documentation of this canister's public API.
  public query func getApiDoc() : async Text {
    "# Wallet Tracker Backend API\n\n" #
    "This canister stores per-user wallet metadata for the wallet tracker app: short\n" #
    "display labels for wallet addresses, a list of pinned favorite wallets, and a\n" #
    "registry of custom ICRC-1/ICRC-2 tokens the user tracks. All state is keyed by\n" #
    "the caller's principal; there is no cross-user sharing.\n\n" #
    "## Public methods\n\n" #
    "### Labels\n\n" #
    "- `setLabel(address : text, lbl : text) : async ()` — set or overwrite the label\n" #
    "  for `address`. `lbl` must be 6 characters or fewer; a longer label traps with\n" #
    "  `Label must be 6 characters or fewer`.\n" #
    "- `getLabel(address : text) : async ?text` — the label for `address`, or `null`\n" #
    "  when none is set.\n" #
    "- `removeLabel(address : text) : async ()` — remove the label for `address`.\n" #
    "  Removing an address that has no label is a no-op.\n" #
    "- `getAllLabels() : async [WalletLabel]` — every label for the caller, where\n" #
    "  `WalletLabel = { address : text; walletLabel : text }`.\n\n" #
    "### Favorites\n\n" #
    "- `addFavorite(address : text) : async ()` — pin a wallet. Adding an address\n" #
    "  that is already pinned replaces the existing entry and refreshes its\n" #
    "  `pinnedAt` timestamp.\n" #
    "- `removeFavorite(address : text) : async ()` — unpin a wallet. Removing an\n" #
    "  address that is not pinned is a no-op.\n" #
    "- `getFavorites() : async [Favorite]` — every pinned wallet for the caller,\n" #
    "  where `Favorite = { address : text; pinnedAt : int }`.\n\n" #
    "### Custom tokens\n\n" #
    "- `listCustomTokens() : async [CustomToken]` — every custom token tracked by\n" #
    "  the caller.\n" #
    "- `addCustomToken(ledgerCanisterId : text, indexCanisterId : ?text, symbol : text, decimals : nat8) : async CustomToken`\n" #
    "  — add or upsert a token. `ledgerCanisterId` is the dedup key: adding the same\n" #
    "  ledger again overwrites the stored entry and refreshes `addedAt`.\n" #
    "- `removeCustomToken(ledgerCanisterId : text) : async bool` — remove a token,\n" #
    "  returning `true` when an entry existed and was removed, `false` otherwise.\n\n" #
    "### Diagnostics\n\n" #
    "- `ping() : async { status : text }` — liveness probe, always returns\n" #
    "  `{ status = \"ok\" }`.\n\n" #
    "### Data Intelligence (OQL)\n\n" #
    "- `schema() : async text` — the queryable schema of this canister's data.\n" #
    "- `execute(query : text) : async text` — run a JSON query against that schema.\n\n" #
    "## Authentication and authorization\n\n" #
    "Every label, favorite, and custom-token method requires a signed (non-anonymous)\n" #
    "caller. An anonymous caller traps with `Anonymous callers not allowed`.\n\n" #
    "There is no registration step and no role system: the caller's principal *is*\n" #
    "the data partition. A caller can only read and write its own labels, favorites,\n" #
    "and custom tokens, and no method accepts another user's principal as an argument.\n\n" #
    "The app's frontend pins an Internet Identity derivation origin, published at\n" #
    "`/.well-known/ii-derivation-origin` when available. An agent already holding the\n" #
    "user's Internet Identity authorization derives the correct per-app principal\n" #
    "against that origin (for example `icp identity link web <name> --app <host>`).\n" #
    "Such a delegation acts with the user's full authority in this app until it\n" #
    "expires. A principal derived against a different origin is a different principal\n" #
    "and therefore sees a different, empty data partition.\n\n" #
    "`ping`, `getApiDoc`, `schema`, and `execute` are the only methods callable\n" #
    "without a signed-in identity. `schema` and `execute` are additionally\n" #
    "authorization-scoped per entity: the wallet-label table is scoped strictly to\n" #
    "the caller's own rows, while the favorite and custom-token tables are readable\n" #
    "by the caller's own rows and in full by the platform controller.\n\n" #
    "## Units and encodings\n\n" #
    "- `address` is an opaque text identifier: a hex account ID or a principal text,\n" #
    "  stored exactly as supplied.\n" #
    "- `ledgerCanisterId` and `indexCanisterId` are principal texts of the token's\n" #
    "  ledger and index canisters. `indexCanisterId` is optional and `null` when the\n" #
    "  token has no known index canister.\n" #
    "- `decimals` is a `nat8` (0-255), matching the ICRC-1 ledger's own decimals.\n" #
    "- `pinnedAt` and `addedAt` are nanosecond timestamps (`Time.now()`), not\n" #
    "  seconds or milliseconds.\n" #
    "- `symbol` is stored as supplied and is not normalized or validated.\n\n" #
    "## Lifecycle and polling\n\n" #
    "All methods are synchronous request/response calls; there are no background jobs,\n" #
    "timers, or asynchronous state transitions. A write is durable as soon as the call\n" #
    "resolves, so a client can re-read with `getAllLabels`, `getFavorites`, or\n" #
    "`listCustomTokens` immediately after a successful write. There is no completion\n" #
    "state to poll.\n\n" #
    "## Mutation retry safety\n\n" #
    "Every mutation is idempotent by key, so retrying a call after a timeout is safe:\n\n" #
    "- `setLabel` is an upsert keyed by `address`.\n" #
    "- `addFavorite` is an upsert keyed by `address`; a retry refreshes `pinnedAt`\n" #
    "  rather than creating a duplicate.\n" #
    "- `addCustomToken` is an upsert keyed by `ledgerCanisterId`; a retry refreshes\n" #
    "  `addedAt` rather than creating a duplicate.\n" #
    "- `removeLabel`, `removeFavorite`, and `removeCustomToken` are idempotent\n" #
    "  deletes; deleting an absent entry is a no-op.\n\n" #
    "The only destructive effects are the three remove methods, and each removes only\n" #
    "the caller's own entry for the given key.\n\n" #
    "## Errors, traps, and gotchas\n\n" #
    "- Anonymous callers trap with `Anonymous callers not allowed` on every label,\n" #
    "  favorite, and custom-token method.\n" #
    "- `setLabel` traps with `Label must be 6 characters or fewer` when `lbl` is\n" #
    "  longer than 6 characters. The limit is on the label, not the address.\n" #
    "- `addCustomToken` does not verify that `ledgerCanisterId` is a real ledger\n" #
    "  canister, and does not validate `symbol` or `decimals`; the caller is\n" #
    "  responsible for supplying correct values.\n" #
    "- `getLabel` returns `null` both when the address has no label and when the\n" #
    "  caller has never written any label; the two cases are indistinguishable.\n" #
    "- `getFavorites` and `listCustomTokens` return an empty array for a caller with\n" #
    "  no data rather than an error.\n" #
    "- Timestamps are assigned by the canister at write time, not by the client, so\n" #
    "  they reflect the canister's clock.";
  };
};
