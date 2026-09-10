import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { friendlyError } from '@/lib/errors';

// Keys keep old household/meal data off-screen during a selection change.
// Sequence checks prevent slower requests from overwriting newer results.
export function useResource<T>(key: string, fetcher: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key },
  );
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const data = await fetcher();
      if (request === sequence.current) setState({ key, data });
    } catch (error) {
      if (request === sequence.current)
        setState((previous) => ({
          key,
          data: previous.key === key ? previous.data : undefined,
          error: friendlyError(error),
        }));
    }
  }, [key, fetcher]);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      if (AppState.currentState !== 'background') void reload();
    }, 60000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    // The ref is a request counter, not a DOM node; invalidate in-flight requests on cleanup.
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate the request counter, not a DOM ref
      sequence.current++;
      clearInterval(timer);
      subscription.remove();
    };
  }, [reload]);
  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : undefined,
    reload,
  };
}
