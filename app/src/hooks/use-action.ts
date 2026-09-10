import { useRef, useState } from 'react';
import { friendlyError } from '@/lib/errors';

export function useAction() {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    if (locked.current) return false;
    locked.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(friendlyError(cause));
      return false;
    } finally {
      locked.current = false;
      setPending(false);
    }
  }
  return { pending, error, run, setError };
}
