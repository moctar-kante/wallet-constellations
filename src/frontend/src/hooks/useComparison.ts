import { useCallback, useState } from "react";
import { compareWallets } from "../services/comparisonService";
import { DEFAULT_TX_LIMIT } from "../services/explorerService";
import type { ComparisonData, SharedCounterparty, TimeRange } from "../types";

interface ComparisonState {
  loading1: boolean;
  loading2: boolean;
  error1: string | null;
  error2: string | null;
  data: ComparisonData | null;
  sharedCounterparties: SharedCounterparty[];
  timeRange: TimeRange;
  address1: string;
  address2: string;
}

const INITIAL_STATE: ComparisonState = {
  loading1: false,
  loading2: false,
  error1: null,
  error2: null,
  data: null,
  sharedCounterparties: [],
  timeRange: "all",
  address1: "",
  address2: "",
};

export function useComparison() {
  const [state, setState] = useState<ComparisonState>(INITIAL_STATE);

  const startComparison = useCallback(async (addr1: string, addr2: string) => {
    const trimmed1 = addr1.trim();
    const trimmed2 = addr2.trim();

    if (!trimmed1 || !trimmed2) return;

    setState((prev) => ({
      ...prev,
      loading1: true,
      loading2: true,
      error1: null,
      error2: null,
      data: null,
      sharedCounterparties: [],
      address1: trimmed1,
      address2: trimmed2,
    }));

    try {
      const { comparison, shared } = await compareWallets(
        trimmed1,
        trimmed2,
        DEFAULT_TX_LIMIT,
      );

      setState((prev) => ({
        ...prev,
        loading1: false,
        loading2: false,
        data: comparison,
        sharedCounterparties: shared,
      }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch wallet data";
      setState((prev) => ({
        ...prev,
        loading1: false,
        loading2: false,
        error1: message,
        error2: message,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const setTimeRange = useCallback((timeRange: TimeRange) => {
    setState((prev) => ({ ...prev, timeRange }));
  }, []);

  return {
    ...state,
    isLoading: state.loading1 || state.loading2,
    startComparison,
    reset,
    setTimeRange,
  };
}
