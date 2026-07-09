module {
  /// A wallet address label: maps an address (hex account ID or principal text) to a short display label.
  public type WalletLabel = {
    address : Text;
    walletLabel : Text; // max 6 chars enforced in lib
  };

  /// A pinned/favorite wallet entry.
  public type Favorite = {
    address : Text;
    pinnedAt : Int; // nanoseconds timestamp (Time.now())
  };
};
