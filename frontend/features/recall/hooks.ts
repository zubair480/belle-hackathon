"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientError, ClientResult } from "./api/types";

export type AsyncState<T> = { status: "idle" | "loading" | "ready" | "error"; data: T | null; error: ClientError | null };

/** Loads data from a client call; re-runs when `deps` change. Exposes `reload` for explicit refetch. */
export function useAsync<T>(load: () => Promise<ClientResult<T>>, deps: unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: "idle", data: null, error: null });
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: "loading", error: null }));
    load().then((r) => {
      if (cancelled || !alive.current) return;
      if (r.ok) setState({ status: "ready", data: r.data, error: null });
      else setState((s) => ({ status: "error", data: s.data, error: r.error }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Guards a mutation: one in flight at a time, keeps the last error, never double-submits. */
export function useMutation<A extends unknown[], T>(fn: (...args: A) => Promise<ClientResult<T>>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ClientError | null>(null);
  const inflight = useRef(false);
  const run = useCallback(
    async (...args: A): Promise<ClientResult<T> | null> => {
      if (inflight.current) return null;
      inflight.current = true;
      setPending(true);
      setError(null);
      try {
        const r = await fn(...args);
        if (!r.ok) setError(r.error);
        return r;
      } finally {
        inflight.current = false;
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, clearError: () => setError(null) };
}
