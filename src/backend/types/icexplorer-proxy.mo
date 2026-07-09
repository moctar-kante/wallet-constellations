module {
  /// IC management canister HTTP request argument types (mirrors ic:aaaaa-aa).
  /// Defined here so the proxy domain is self-contained; the real IC actor
  /// provides the canonical types at the call site.
  public type HttpMethod = {
    #get;
    #post;
    #head;
  };

  public type HttpHeader = {
    name : Text;
    value : Text;
  };

  public type HttpRequestArgs = {
    url : Text;
    max_response_bytes : ?Nat64;
    headers : [HttpHeader];
    body : ?Blob;
    method : HttpMethod;
    transform : ?TransformArgs;
    is_replicated : ?Bool;
  };

  public type TransformArgs = {
    function : shared TransformContext -> async HttpResponse;
    context : Blob;
  };

  public type TransformContext = {
    context : Blob;
    response : HttpResponse;
  };

  public type HttpResponse = {
    status : Nat64;
    headers : [HttpHeader];
    body : Blob;
  };

  /// Cap on response size for IC Explorer portfolio + tx list calls.
  /// These responses can be large (token portfolios, paginated tx history).
  public let maxResponseBytes : Nat64 = 2_000_000;
};
