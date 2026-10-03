module {
  /// A custom ICRC-1/ICRC-2 token tracked by a user.
  /// `ledgerCanisterId` is the dedup key: one entry per ledger per user.
  public type CustomToken = {
    ledgerCanisterId : Text; // required — principal text of the token ledger canister
    indexCanisterId : ?Text; // optional — principal text of the token index canister
    symbol : Text;
    decimals : Nat8;
    addedAt : Int; // nanoseconds timestamp (Time.now())
  };
};
