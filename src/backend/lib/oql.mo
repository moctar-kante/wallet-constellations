import Map "mo:core/Map";
import List "mo:core/List";
import Iter "mo:core/Iter";
import Principal "mo:core/Principal";
import Types "../types/userData";
import CustomTokenTypes "../types/customToken";
import UserDataLib "userData";
import CustomTokenLib "customToken";

module {
  // ── Flat projection row types ───────────────────────────────────────────
  // One row per (owner, entry) pair. The owner principal is promoted out of the
  // outer Map key so every row carries its own identity.

  /// One wallet label row: owner -> address -> label.
  public type LabelRow = {
    owner : Principal;
    address : Text;
    walletLabel : Text;
  };

  /// One favorite row: owner -> favorite entry.
  public type FavoriteRow = {
    owner : Principal;
    address : Text;
    pinnedAt : Int;
  };

  /// One custom-token row: owner -> ledger canister ID -> token.
  public type CustomTokenRow = {
    owner : Principal;
    ledgerCanisterId : Text;
    indexCanisterId : ?Text;
    symbol : Text;
    decimals : Nat8;
    addedAt : Int;
  };

  // ── Lazy iterator helpers ───────────────────────────────────────────────
  // Each helper flattens one nested per-user store into a lazy iterator of flat
  // rows. Nothing is materialized until the OQL engine pulls from the iterator.

  /// Flatten the label store into label rows.
  public func labelRows(store : UserDataLib.LabelStore) : Iter.Iter<LabelRow> {
    store.entries().flatMap(
      func((owner, userMap)) {
        userMap.entries().map(
          func((address, walletLabel)) {
            { owner; address; walletLabel };
          }
        );
      }
    );
  };

  /// Flatten the favorite store into favorite rows.
  public func favoriteRows(store : UserDataLib.FavoriteStore) : Iter.Iter<FavoriteRow> {
    store.entries().flatMap(
      func((owner, userList)) {
        userList.values().map(
          func(favorite) {
            { owner; address = favorite.address; pinnedAt = favorite.pinnedAt };
          }
        );
      }
    );
  };

  /// Flatten the custom-token store into custom-token rows.
  public func customTokenRows(store : CustomTokenLib.CustomTokenStore) : Iter.Iter<CustomTokenRow> {
    store.entries().flatMap(
      func((owner, userMap)) {
        userMap.entries().map(
          func((ledgerCanisterId, token)) {
            {
              owner;
              ledgerCanisterId;
              indexCanisterId = token.indexCanisterId;
              symbol = token.symbol;
              decimals = token.decimals;
              addedAt = token.addedAt;
            };
          }
        );
      }
    );
  };
};
