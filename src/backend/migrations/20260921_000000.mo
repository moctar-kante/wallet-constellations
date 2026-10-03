import Map "mo:core/Map";
import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // Inline every project type a stable field references; the chain must not import project files.
  type Favorite = {
    address : Text;
    pinnedAt : Int;
  };

  type CustomToken = {
    ledgerCanisterId : Text;
    indexCanisterId : ?Text;
    symbol : Text;
    decimals : Nat8;
    addedAt : Int;
  };

  // Legacy stable shape. Must match the deployed baseline
  // (.old/src/backend/dist/backend.most, Version 1.0.0) EXACTLY: both fields are
  // required (non-optional) Map records. Declaring them optional changes the
  // stable signature and triggers M0170.
  type OldActor = {
    labelStore : Map.Map<Principal, Map.Map<Text, Text>>;
    favoriteStore : Map.Map<Principal, List.List<Favorite>>;
  };

  type NewActor = {
    labelStore : Map.Map<Principal, Map.Map<Text, Text>>;
    favoriteStore : Map.Map<Principal, List.List<Favorite>>;
    customTokenStore : Map.Map<Principal, Map.Map<Text, CustomToken>>;
  };

  public func migration(old : OldActor) : NewActor {
    {
      labelStore = old.labelStore;
      favoriteStore = old.favoriteStore;
      customTokenStore = Map.empty();
    };
  };
};
