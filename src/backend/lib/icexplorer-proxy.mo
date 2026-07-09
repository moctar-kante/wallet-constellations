import Text "mo:core/Text";

module {
  /// Build the JSON request body for the IC Explorer portfolio endpoint
  /// (POST https://open-api.icexplorer.io/api/holder/user) from a wallet address.
  /// ICP addresses are alphanumeric, so no JSON escaping is required.
  public func portfolioRequestBody(address : Text) : Text {
    "{\"address\":\"" # address # "\"}";
  };

  /// Decode an HTTP response body to UTF-8 Text, returning "" on non-UTF-8.
  public func decodeBody(body : Blob) : Text {
    switch (body.decodeUtf8()) {
      case (?text) text;
      case null "";
    };
  };
};
