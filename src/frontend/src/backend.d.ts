import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface WalletLabel {
    address: string;
    walletLabel: string;
}
export interface Favorite {
    address: string;
    pinnedAt: bigint;
}
export interface backendInterface {
    addFavorite(address: string): Promise<void>;
    getAllLabels(): Promise<Array<WalletLabel>>;
    getFavorites(): Promise<Array<Favorite>>;
    getLabel(address: string): Promise<string | null>;
    ping(): Promise<{
        status: string;
    }>;
    removeFavorite(address: string): Promise<void>;
    removeLabel(address: string): Promise<void>;
    setLabel(address: string, lbl: string): Promise<void>;
}
