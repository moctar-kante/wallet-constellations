import Principal "mo:core/Principal";
import OQL "mo:caffeineai-oql";
import Expose "mo:caffeineai-oql/Expose";
import Entity "mo:caffeineai-oql/Entity";
import RecordValue "mo:caffeineai-oql/RecordValue";
import PrincipalValue "mo:caffeineai-oql/PrincipalValue";
import TextValue "mo:caffeineai-oql/TextValue";
import IntValue "mo:caffeineai-oql/IntValue";
import Nat8Value "mo:caffeineai-oql/Nat8Value";
import UserDataLib "../lib/userData";
import CustomTokenLib "../lib/customToken";
import OqlLib "../lib/oql";

mixin (
  labelStore : UserDataLib.LabelStore,
  favoriteStore : UserDataLib.FavoriteStore,
  customTokenStore : CustomTokenLib.CustomTokenStore,
) {
  // Sample owner for schema seeding; the value is ignored.
  transient let sampleOwner = Principal.fromText("aaaaa-aa");

  include Expose({
    entities = [
      // Wallet labels: strictly private per-user data.
      // Manual mode starts with no columns, so every field — including the
      // `owner` column `.ownedBy` scopes on — must be declared with `.payload`.
      OQL.Entity.manual<OqlLib.LabelRow>(
        "walletLabel",
        func () = OqlLib.labelRows(labelStore),
        "WalletLabel",
        "owner",
      )
        .sample({ owner = sampleOwner; address = ""; walletLabel = "" })
        .payload("owner", func r = r.owner)
        .payload("address", func r = r.address)
        .payload("walletLabel", func r = r.walletLabel)
        .ownedBy("owner")
        .scopedPerUser()
        .build(),

      // Favorites: per-user data the agent may still aggregate over.
      OQL.Entity.manual<OqlLib.FavoriteRow>(
        "favorite",
        func () = OqlLib.favoriteRows(favoriteStore),
        "Favorite",
        "owner",
      )
        .sample({ owner = sampleOwner; address = ""; pinnedAt = 0 })
        .payload("owner", func r = r.owner)
        .payload("address", func r = r.address)
        .payload("pinnedAt", func r = r.pinnedAt)
        .ownedBy("owner")
        .controllerOrScoped()
        .build(),

      // Custom tokens: per-user data the agent may still aggregate over.
      OQL.Entity.manual<OqlLib.CustomTokenRow>(
        "customToken",
        func () = OqlLib.customTokenRows(customTokenStore),
        "CustomToken",
        "owner",
      )
        .sample({
          owner = sampleOwner;
          ledgerCanisterId = "";
          indexCanisterId = null : ?Text;
          symbol = "";
          decimals = 0 : Nat8;
          addedAt = 0 : Int;
        })
        .payload("owner", func r = r.owner)
        .payload("ledgerCanisterId", func r = r.ledgerCanisterId)
        // `?Text` has no built-in `_toRow`; collapse null to the empty-string
        // sentinel so the column stays a single, queryable `#text` type.
        .payload("indexCanisterId", func r = r.indexCanisterId ?? "")
        .payload("symbol", func r = r.symbol)
        .payload("decimals", func r = r.decimals)
        .payload("addedAt", func r = r.addedAt)
        .ownedBy("owner")
        .controllerOrScoped()
        .build(),
    ];
  });
};
