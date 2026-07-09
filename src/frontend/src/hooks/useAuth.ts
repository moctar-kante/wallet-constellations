import { AuthClient } from "@dfinity/auth-client";
import { HttpAgent } from "@icp-sdk/core/agent";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalBlob, createActor } from "../backend";
import type { backendInterface } from "../backend.d";

const II_URL =
  (import.meta as { env?: Record<string, string> }).env?.II_URL ??
  "https://identity.internetcomputer.org/";

const BACKEND_CANISTER_ID =
  (import.meta as { env?: Record<string, string> }).env?.CANISTER_ID_BACKEND ??
  "aaaaa-aa";

const STORAGE_KEY = "icpath_auth_principal";

function noopUpload(_file: ExternalBlob): Promise<Uint8Array<ArrayBuffer>> {
  return Promise.resolve(new Uint8Array() as Uint8Array<ArrayBuffer>);
}
function noopDownload(_file: Uint8Array): Promise<ExternalBlob> {
  return Promise.resolve(ExternalBlob.fromURL(""));
}

export interface UseAuthResult {
  isLoggedIn: boolean;
  principal: string | null;
  actor: backendInterface | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

export function useAuth(): UseAuthResult {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [actor, setActor] = useState<backendInterface | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const authClientRef = useRef<AuthClient | null>(null);

  const buildActor = useCallback((client: AuthClient): backendInterface => {
    const identity = client.getIdentity();
    const agent = new HttpAgent({ identity });
    return createActor(BACKEND_CANISTER_ID, noopUpload, noopDownload, {
      agent,
    });
  }, []);

  // Initialize: restore session if previously authenticated
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const client = await AuthClient.create();
        if (cancelled) return;
        authClientRef.current = client;

        if (await client.isAuthenticated()) {
          const id = client.getIdentity();
          const p = id.getPrincipal().toText();
          if (!cancelled) {
            const act = buildActor(client);
            setActor(act);
            setPrincipal(p);
            setIsLoggedIn(true);
            try {
              localStorage.setItem(STORAGE_KEY, p);
            } catch {}
          }
        }
      } catch (err) {
        console.warn("[Auth] Failed to restore session:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildActor]);

  const login = useCallback(async () => {
    setIsLoading(true);
    try {
      let client = authClientRef.current;
      if (!client) {
        client = await AuthClient.create();
        authClientRef.current = client;
      }

      await new Promise<void>((resolve, reject) => {
        client!.login({
          identityProvider: II_URL,
          maxTimeToLive: BigInt(7 * 24 * 3600) * BigInt(1_000_000_000),
          onSuccess: resolve,
          onError: (err) => reject(new Error(err ?? "Login failed")),
        });
      });

      const id = client.getIdentity();
      const p = id.getPrincipal().toText();
      const act = buildActor(client);
      setActor(act);
      setPrincipal(p);
      setIsLoggedIn(true);
      try {
        localStorage.setItem(STORAGE_KEY, p);
      } catch {}
    } catch (err) {
      console.warn("[Auth] Login failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [buildActor]);

  const logout = useCallback(async () => {
    try {
      if (authClientRef.current) {
        await authClientRef.current.logout();
      }
    } catch {}
    setIsLoggedIn(false);
    setPrincipal(null);
    setActor(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return { isLoggedIn, principal, actor, login, logout, isLoading };
}
