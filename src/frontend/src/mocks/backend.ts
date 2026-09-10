import type { backendInterface } from "../backend.d";

export const mockBackend: backendInterface = {
  addFavorite: async () => undefined,
  getAllLabels: async () => [],
  getFavorites: async () => [],
  getLabel: async () => null,
  ping: async () => ({ status: "ok" }),
  removeFavorite: async () => undefined,
  removeLabel: async () => undefined,
  setLabel: async () => undefined,
};
