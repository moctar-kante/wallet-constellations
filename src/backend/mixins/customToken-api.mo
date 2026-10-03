import CustomTokenLib "../lib/customToken";
import Types "../types/customToken";

mixin (customTokenStore : CustomTokenLib.CustomTokenStore) {
  // ── Custom tokens ───────────────────────────────────────────────────────

  /// Get all custom tokens tracked by the calling user.
  public shared query ({ caller }) func listCustomTokens() : async [Types.CustomToken] {
    CustomTokenLib.listCustomTokens(customTokenStore, caller);
  };

  /// Add or upsert a custom token for the calling user, deduplicated by ledger canister ID.
  public shared ({ caller }) func addCustomToken(
    ledgerCanisterId : Text,
    indexCanisterId : ?Text,
    symbol : Text,
    decimals : Nat8,
  ) : async Types.CustomToken {
    CustomTokenLib.addCustomToken(
      customTokenStore,
      caller,
      ledgerCanisterId,
      indexCanisterId,
      symbol,
      decimals,
    );
  };

  /// Remove a custom token by ledger canister ID. Returns true when an entry was removed.
  public shared ({ caller }) func removeCustomToken(ledgerCanisterId : Text) : async Bool {
    CustomTokenLib.removeCustomToken(customTokenStore, caller, ledgerCanisterId);
  };
};
