import Map "mo:core/Map";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Runtime "mo:core/Runtime";
import Types "../types/userData";

module {
  // Per-user label store: Principal -> Map<address, label>
  public type LabelStore = Map.Map<Principal, Map.Map<Text, Text>>;
  // Per-user favorites store: Principal -> List<Favorite>
  public type FavoriteStore = Map.Map<Principal, List.List<Types.Favorite>>;

  // ── Labels ──────────────────────────────────────────────────────────────

  public func setLabel(
    store : LabelStore,
    caller : Principal,
    address : Text,
    lbl : Text,
  ) {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    if (lbl.size() > 6) Runtime.trap("Label must be 6 characters or fewer");
    let userMap = switch (store.get(caller)) {
      case (?m) m;
      case null {
        let m = Map.empty<Text, Text>();
        store.add(caller, m);
        m;
      };
    };
    userMap.add(address, lbl);
  };

  public func getLabel(
    store : LabelStore,
    caller : Principal,
    address : Text,
  ) : ?Text {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    switch (store.get(caller)) {
      case (?userMap) userMap.get(address);
      case null null;
    };
  };

  public func removeLabel(
    store : LabelStore,
    caller : Principal,
    address : Text,
  ) {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    switch (store.get(caller)) {
      case (?userMap) userMap.remove(address);
      case null {};
    };
  };

  public func getAllLabels(
    store : LabelStore,
    caller : Principal,
  ) : [Types.WalletLabel] {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    switch (store.get(caller)) {
      case (?userMap) {
        let result = List.empty<Types.WalletLabel>();
        for ((addr, lbl) in userMap.entries()) {
          result.add({ address = addr; walletLabel = lbl });
        };
        result.toArray();
      };
      case null [];
    };
  };

  // ── Favorites ───────────────────────────────────────────────────────────

  public func addFavorite(
    store : FavoriteStore,
    caller : Principal,
    address : Text,
  ) {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    let userList = switch (store.get(caller)) {
      case (?l) l;
      case null {
        let l = List.empty<Types.Favorite>();
        store.add(caller, l);
        l;
      };
    };
    // Upsert: remove any existing entry for this address, then add fresh
    let kept = userList.filter(func(f : Types.Favorite) : Bool { f.address != address });
    userList.clear();
    userList.append(kept);
    userList.add({ address; pinnedAt = Time.now() });
  };

  public func removeFavorite(
    store : FavoriteStore,
    caller : Principal,
    address : Text,
  ) {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    switch (store.get(caller)) {
      case (?userList) {
        let kept = userList.filter(func(f : Types.Favorite) : Bool { f.address != address });
        userList.clear();
        userList.append(kept);
      };
      case null {};
    };
  };

  public func getFavorites(
    store : FavoriteStore,
    caller : Principal,
  ) : [Types.Favorite] {
    if (caller.isAnonymous()) Runtime.trap("Anonymous callers not allowed");
    switch (store.get(caller)) {
      case (?userList) userList.toArray();
      case null [];
    };
  };
};
