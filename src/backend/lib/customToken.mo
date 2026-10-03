import Map "mo:core/Map";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Runtime "mo:core/Runtime";
import Types "../types/customToken";

module {
  // Per-user custom-token store: Principal -> Map<ledgerCanisterId, CustomToken>
  public type CustomTokenStore = Map.Map<Principal, Map.Map<Text, Types.CustomToken>>;

  /// List the calling user's custom tokens.
  public func listCustomTokens(
    store : CustomTokenStore,
    caller : Principal,
  ) : [Types.CustomToken] {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    switch (store.get(caller)) {
      case (?userMap) {
        let result = List.empty<Types.CustomToken>();
        for ((_, token) in userMap.entries()) {
          result.add(token);
        };
        result.toArray();
      };
      case null [];
    };
  };

  /// Add or upsert a custom token for the calling user, deduplicated by ledger canister ID.
  public func addCustomToken(
    store : CustomTokenStore,
    caller : Principal,
    ledgerCanisterId : Text,
    indexCanisterId : ?Text,
    symbol : Text,
    decimals : Nat8,
  ) : Types.CustomToken {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    let userMap = switch (store.get(caller)) {
      case (?m) m;
      case null {
        let m = Map.empty<Text, Types.CustomToken>();
        store.add(caller, m);
        m;
      };
    };
    let token : Types.CustomToken = {
      ledgerCanisterId;
      indexCanisterId;
      symbol;
      decimals;
      addedAt = Time.now();
    };
    userMap.add(ledgerCanisterId, token);
    token;
  };

  /// Remove a custom token by ledger canister ID. Returns true when an entry was removed.
  public func removeCustomToken(
    store : CustomTokenStore,
    caller : Principal,
    ledgerCanisterId : Text,
  ) : Bool {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    switch (store.get(caller)) {
      case (?userMap) {
        let existed = userMap.get(ledgerCanisterId) != null;
        userMap.remove(ledgerCanisterId);
        existed;
      };
      case null false;
    };
  };
};
