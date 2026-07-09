import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface Favorite {
    address: string;
    pinnedAt: bigint;
}
export interface WalletLabel {
    address: string;
    walletLabel: string;
}
export interface HttpRequestResult {
    status: bigint;
    body: Uint8Array;
    headers: Array<HttpHeader>;
}
export interface HttpHeader {
    value: string;
    name: string;
}
export interface backendInterface {
    addFavorite(address: string): Promise<void>;
    getAllLabels(): Promise<Array<WalletLabel>>;
    getFavorites(): Promise<Array<Favorite>>;
    getLabel(address: string): Promise<string | null>;
    icexplorer_portfolio(address: string): Promise<string>;
    icexplorer_transform(arg0: {
        context: Uint8Array;
        response: HttpRequestResult;
    }): Promise<HttpRequestResult>;
    icexplorer_txlist(payload: string): Promise<string>;
    ping(): Promise<{
        status: string;
    }>;
    removeFavorite(address: string): Promise<void>;
    removeLabel(address: string): Promise<void>;
    setLabel(address: string, lbl: string): Promise<void>;
}
