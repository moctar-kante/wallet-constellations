import Map "mo:core/Map";
import List "mo:core/List";
import Principal "mo:core/Principal";
import UserDataLib "lib/userData";
import UserDataTypes "types/userData";
import UserDataApi "mixins/userData-api";

actor {
  // State: per-user label maps (address -> label)
  let labelStore : UserDataLib.LabelStore = Map.empty();
  // State: per-user favorite lists
  let favoriteStore : UserDataLib.FavoriteStore = Map.empty();

  include UserDataApi(labelStore, favoriteStore);

  public query ({ caller }) func ping() : async { status : Text } {
    { status = "ok" };
  };
};
