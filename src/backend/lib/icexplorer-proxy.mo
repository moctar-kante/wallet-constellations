import Text "mo:core/Text";

module {
  /// Build the JSON request body for the IC Explorer portfolio endpoint
  /// (POST https://open-api.icexplorer.io/api/holder/user) from a wallet address.
  ///
  /// Per the IC Explorer API docs, /api/holder/user requires `page` and `size`
  /// and accepts the wallet identifier as `principal`, `accountId`, or
  /// `accountTextual` (NOT `address`). We send the caller's address under
  /// `accountTextual` because it is the most permissive form (accepts both
  /// principal-text and account-id textual forms), and include the required
  /// pagination fields with sensible defaults so the call returns real data.
  /// The address is alphanumeric, so no JSON escaping is required.
  public func portfolioRequestBody(address : Text) : Text {
    "{\"page\":1,\"size\":100,\"accountTextual\":\"" # address # "\"}";
  };

  /// Decode an HTTP response body to UTF-8 Text, returning "" on non-UTF-8.
  public func decodeBody(body : Blob) : Text {
    switch (body.decodeUtf8()) {
      case (?text) text;
      case null "";
    };
  };
};
