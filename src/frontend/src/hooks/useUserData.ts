/**
 * useUserData — unified labels and favorites CRUD.
 *
 * When logged in  → reads/writes from the backend canister, mirrors to localStorage.
 * When logged out → reads/writes from localStorage only.
 *
 * All existing localStorage keys are preserved:
 *   - 'wallet-labels'        (Record<string, string>)
 *   - 'icpath_saved_wallets' (SavedWallet[])
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { backendInterface } from "../backend.d";
import type { SavedWallet } from "../types";

const LABELS_KEY = "wallet-labels";
const SAVED_WALLETS_KEY = "icpath_saved_wallets";
const MAX_PINS = 20;

function safeGetJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export interface UseUserDataResult {
  labels: Record<string, string>;
  savedWallets: SavedWallet[];
  syncing: boolean;
  migrated: boolean;
  setLabel: (address: string, label: string) => Promise<void>;
  removeLabel: (address: string) => Promise<void>;
  toggleFavorite: (address: string, label?: string) => Promise<void>;
  isFavorite: (address: string) => boolean;
  /** Force a refresh from backend (called after login) */
  refresh: () => Promise<void>;
}

export function useUserData(
  isLoggedIn: boolean,
  actor: backendInterface | null,
): UseUserDataResult {
  const [labels, setLabels] = useState<Record<string, string>>(() =>
    safeGetJSON<Record<string, string>>(LABELS_KEY, {}),
  );
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>(() =>
    safeGetJSON<SavedWallet[]>(SAVED_WALLETS_KEY, []),
  );
  const [syncing, setSyncing] = useState(false);
  const [migrated, setMigrated] = useState(false);
  const migratedRef = useRef(false);

  // When user logs in: load from backend and migrate local data if needed
  const refresh = useCallback(async () => {
    if (!actor) return;
    setSyncing(true);
    try {
      const [backendLabels, backendFavs] = await Promise.all([
        actor.getAllLabels().catch(() => []),
        actor.getFavorites().catch(() => []),
      ]);

      // Build merged labels: backend takes precedence
      const mergedLabels: Record<string, string> = {
        ...safeGetJSON<Record<string, string>>(LABELS_KEY, {}),
      };
      for (const { address, walletLabel } of backendLabels) {
        mergedLabels[address.toLowerCase()] = walletLabel;
      }

      // Build merged wallets: backend takes precedence for pinned time
      const localWallets = safeGetJSON<SavedWallet[]>(SAVED_WALLETS_KEY, []);
      const backendAddrs = new Set(
        backendFavs.map((f) => f.address.toLowerCase()),
      );
      const mergedWallets: SavedWallet[] = [
        ...backendFavs.map((f) => ({
          address: f.address,
          label: mergedLabels[f.address.toLowerCase()],
          pinnedAt: Number(f.pinnedAt) / 1_000_000, // ns → ms
        })),
        ...localWallets.filter(
          (w) => !backendAddrs.has(w.address.toLowerCase()),
        ),
      ];

      setLabels(mergedLabels);
      setSavedWallets(mergedWallets);
      safeSetJSON(LABELS_KEY, mergedLabels);
      safeSetJSON(SAVED_WALLETS_KEY, mergedWallets);

      // First-time migration: push local data to backend
      if (!migratedRef.current) {
        migratedRef.current = true;
        const localLabels = safeGetJSON<Record<string, string>>(LABELS_KEY, {});
        const labelsToMigrate = Object.entries(localLabels).filter(
          ([addr]) => !backendLabels.some((b) => b.address === addr),
        );
        const walletsTomigrate = localWallets.filter(
          (w) => !backendAddrs.has(w.address.toLowerCase()),
        );

        if (labelsToMigrate.length > 0 || walletsTomigrate.length > 0) {
          const migrationCalls: Promise<void>[] = [
            ...labelsToMigrate.map(([addr, lbl]) =>
              actor.setLabel(addr, lbl).catch(() => {}),
            ),
            ...walletsTomigrate.map((w) =>
              actor.addFavorite(w.address).catch(() => {}),
            ),
          ];
          await Promise.all(migrationCalls);
          setMigrated(true);
          setTimeout(() => setMigrated(false), 3000);
        }
      }
    } catch (err) {
      console.warn("[UserData] refresh failed:", err);
    } finally {
      setSyncing(false);
    }
  }, [actor]);

  // Trigger refresh whenever actor changes (login event)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    if (isLoggedIn && actor) {
      refresh();
    }
  }, [isLoggedIn, actor]);

  const setLabel = useCallback(
    async (address: string, label: string) => {
      const trimmed = label.trim().slice(0, 6);
      const key = address.toLowerCase();
      setLabels((prev) => {
        const next = { ...prev };
        if (trimmed) next[key] = trimmed;
        else delete next[key];
        safeSetJSON(LABELS_KEY, next);
        return next;
      });
      if (isLoggedIn && actor) {
        try {
          if (trimmed) {
            await actor.setLabel(address, trimmed);
          } else {
            await actor.removeLabel(address);
          }
        } catch (err) {
          console.warn("[UserData] setLabel backend failed:", err);
        }
      }
    },
    [isLoggedIn, actor],
  );

  const removeLabel = useCallback(
    async (address: string) => {
      const key = address.toLowerCase();
      setLabels((prev) => {
        const next = { ...prev };
        delete next[key];
        safeSetJSON(LABELS_KEY, next);
        return next;
      });
      if (isLoggedIn && actor) {
        try {
          await actor.removeLabel(address);
        } catch (err) {
          console.warn("[UserData] removeLabel backend failed:", err);
        }
      }
    },
    [isLoggedIn, actor],
  );

  const toggleFavorite = useCallback(
    async (address: string, walletLabel?: string) => {
      const isCurrentlyPinned = savedWallets.some(
        (w) => w.address.toLowerCase() === address.toLowerCase(),
      );

      let updated: SavedWallet[];
      if (isCurrentlyPinned) {
        updated = savedWallets.filter(
          (w) => w.address.toLowerCase() !== address.toLowerCase(),
        );
      } else {
        const resolvedLabel = walletLabel ?? labels[address.toLowerCase()];
        const newPin: SavedWallet = {
          address,
          label: resolvedLabel,
          pinnedAt: Date.now(),
        };
        updated = [newPin, ...savedWallets].slice(0, MAX_PINS);
      }
      setSavedWallets(updated);
      safeSetJSON(SAVED_WALLETS_KEY, updated);

      if (isLoggedIn && actor) {
        try {
          if (isCurrentlyPinned) {
            await actor.removeFavorite(address);
          } else {
            await actor.addFavorite(address);
          }
        } catch (err) {
          console.warn("[UserData] toggleFavorite backend failed:", err);
        }
      }
    },
    [savedWallets, labels, isLoggedIn, actor],
  );

  const isFavorite = useCallback(
    (address: string): boolean => {
      return savedWallets.some(
        (w) => w.address.toLowerCase() === address.toLowerCase(),
      );
    },
    [savedWallets],
  );

  return {
    labels,
    savedWallets,
    syncing,
    migrated,
    setLabel,
    removeLabel,
    toggleFavorite,
    isFavorite,
    refresh,
  };
}
