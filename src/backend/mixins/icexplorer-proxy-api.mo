import Blob "mo:core/Blob";
import Nat64 "mo:core/Nat64";
import Text "mo:core/Text";
import IC "mo:ic/Types";
import Call "mo:ic/Call";
import ProxyLib "../lib/icexplorer-proxy";
import Types "../types/icexplorer-proxy";

mixin () {
  /// Shared query transform that strips response headers so all replicas see
  /// the same response for consensus. The body is kept intact (the frontend
  /// parses the JSON body, which includes IC Explorer's success code 600).
  ///
  /// Uses the IC management canister's canonical `HttpRequestResult` type
  /// (status : Nat) rather than the local `Types.HttpResponse` (status : Nat64),
  /// because the transform callback referenced from `IC.HttpRequestArgs.transform`
  /// must match the management canister's expected `shared query` function type
  /// exactly. The transform is an internal consensus callback, not a frontend
  /// entry point, so this type alignment is required for the outcall to compile.
  public query func icexplorer_transform({
    context : Blob;
    response : IC.HttpRequestResult;
  }) : async IC.HttpRequestResult {
    ignore context;
    { response with headers = [] };
  };

  /// Method 1: fetch a wallet's ICRC token portfolio from IC Explorer.
  /// POSTs to https://open-api.icexplorer.io/api/holder/user with a JSON body
  /// containing the wallet address, and returns the raw response body as Text.
  public func icexplorer_portfolio(address : Text) : async Text {
    let url = "https://open-api.icexplorer.io/api/holder/user";
    let jsonBody = ProxyLib.portfolioRequestBody(address);
    let request : IC.HttpRequestArgs = {
      url = url;
      max_response_bytes = ?(Types.maxResponseBytes : Nat64);
      headers = [{ name = "Content-Type"; value = "application/json" }];
      body = ?jsonBody.encodeUtf8();
      method = #post;
      transform = ?{
        function = icexplorer_transform;
        context = Blob.empty();
      };
      is_replicated = null;
    };
    let response = await Call.httpRequest(request);
    ProxyLib.decodeBody(response.body);
  };

  /// Method 2: fetch ICRC transaction history from IC Explorer.
  /// POSTs to https://open-api.icexplorer.io/api/tx/list with the given JSON
  /// payload (Text) as the request body, and returns the raw response body as Text.
  public func icexplorer_txlist(payload : Text) : async Text {
    let url = "https://open-api.icexplorer.io/api/tx/list";
    let request : IC.HttpRequestArgs = {
      url = url;
      max_response_bytes = ?(Types.maxResponseBytes : Nat64);
      headers = [{ name = "Content-Type"; value = "application/json" }];
      body = ?payload.encodeUtf8();
      method = #post;
      transform = ?{
        function = icexplorer_transform;
        context = Blob.empty();
      };
      is_replicated = null;
    };
    let response = await Call.httpRequest(request);
    ProxyLib.decodeBody(response.body);
  };
};
