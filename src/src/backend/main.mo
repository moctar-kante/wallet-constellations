actor {
  public query ({ caller }) func ping() : async { status : Text } {
    { status = "ok" };
  };
};
