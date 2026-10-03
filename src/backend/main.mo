import UserDataLib "lib/userData";
import UserDataApi "mixins/userData-api";
import CustomTokenLib "lib/customToken";
import CustomTokenApi "mixins/customToken-api";
import OqlApi "mixins/oql-api";
import ApiDocMixin "mixins/api-doc";

actor {
  // State: per-user label maps (address -> label)
  let labelStore : UserDataLib.LabelStore;
  // State: per-user favorite lists
  let favoriteStore : UserDataLib.FavoriteStore;
  // State: per-user custom-token maps (ledger canister ID -> token)
  let customTokenStore : CustomTokenLib.CustomTokenStore;

  include UserDataApi(labelStore, favoriteStore);
  include CustomTokenApi(customTokenStore);
  include OqlApi(labelStore, favoriteStore, customTokenStore);
  include ApiDocMixin();

  public query ({ caller }) func ping() : async { status : Text } {
    { status = "ok" };
  };
};
