import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Cell {
    value: Value;
    name: string;
}
export interface CustomToken {
    decimals: number;
    ledgerCanisterId: string;
    indexCanisterId?: string;
    addedAt: bigint;
    symbol: string;
}
export interface Favorite {
    address: string;
    pinnedAt: bigint;
}
export interface Result {
    hasMore: boolean;
    rows: Array<Array<Cell>>;
}
export type Value = {
    __kind__: "int";
    int: bigint;
} | {
    __kind__: "nat";
    nat: bigint;
} | {
    __kind__: "float";
    float: number;
} | {
    __kind__: "bool";
    bool: boolean;
} | {
    __kind__: "null";
    null: null;
} | {
    __kind__: "text";
    text: string;
};
export interface WalletLabel {
    address: string;
    walletLabel: string;
}
export interface backendInterface {
    /**
     * / Add or upsert a custom token for the calling user, deduplicated by ledger canister ID.
     */
    addCustomToken(ledgerCanisterId: string, indexCanisterId: string | null, symbol_: string, decimals: number): Promise<CustomToken>;
    /**
     * / Add or update a wallet as a favorite for the calling user.
     */
    addFavorite(address: string): Promise<void>;
    execute(qJson: string): Promise<Result>;
    /**
     * / Get all wallet labels for the calling user.
     */
    getAllLabels(): Promise<Array<WalletLabel>>;
    /**
     * / Static Markdown documentation of this canister's public API.
     */
    getApiDoc(): Promise<string>;
    /**
     * / Get all favorite wallets for the calling user.
     */
    getFavorites(): Promise<Array<Favorite>>;
    /**
     * / Get the label for a specific wallet address, or null if not set.
     */
    getLabel(address: string): Promise<string | null>;
    /**
     * / Get all custom tokens tracked by the calling user.
     */
    listCustomTokens(): Promise<Array<CustomToken>>;
    ping(): Promise<{
        status: string;
    }>;
    /**
     * / Remove a custom token by ledger canister ID. Returns true when an entry was removed.
     */
    removeCustomToken(ledgerCanisterId: string): Promise<boolean>;
    /**
     * / Remove a wallet from the calling user's favorites.
     */
    removeFavorite(address: string): Promise<void>;
    /**
     * / Remove the label for a specific wallet address.
     */
    removeLabel(address: string): Promise<void>;
    schema(): Promise<string>;
    /**
     * / Set or overwrite a wallet label for the calling user. Label is max 6 chars.
     */
    setLabel(address: string, lbl: string): Promise<void>;
}
