import UserDataLib "../lib/userData";
import Types "../types/userData";

mixin (
  labelStore : UserDataLib.LabelStore,
  favoriteStore : UserDataLib.FavoriteStore,
) {
  // ── Labels ──────────────────────────────────────────────────────────────

  /// Set or overwrite a wallet label for the calling user. Label is max 6 chars.
  public shared ({ caller }) func setLabel(address : Text, lbl : Text) : async () {
    UserDataLib.setLabel(labelStore, caller, address, lbl);
  };

  /// Get the label for a specific wallet address, or null if not set.
  public shared query ({ caller }) func getLabel(address : Text) : async ?Text {
    UserDataLib.getLabel(labelStore, caller, address);
  };

  /// Remove the label for a specific wallet address.
  public shared ({ caller }) func removeLabel(address : Text) : async () {
    UserDataLib.removeLabel(labelStore, caller, address);
  };

  /// Get all wallet labels for the calling user.
  public shared query ({ caller }) func getAllLabels() : async [Types.WalletLabel] {
    UserDataLib.getAllLabels(labelStore, caller);
  };

  // ── Favorites ───────────────────────────────────────────────────────────

  /// Add or update a wallet as a favorite for the calling user.
  public shared ({ caller }) func addFavorite(address : Text) : async () {
    UserDataLib.addFavorite(favoriteStore, caller, address);
  };

  /// Remove a wallet from the calling user's favorites.
  public shared ({ caller }) func removeFavorite(address : Text) : async () {
    UserDataLib.removeFavorite(favoriteStore, caller, address);
  };

  /// Get all favorite wallets for the calling user.
  public shared query ({ caller }) func getFavorites() : async [Types.Favorite] {
    UserDataLib.getFavorites(favoriteStore, caller);
  };
};
