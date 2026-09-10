import { useEffect, useState } from 'react';

// A clock that re-renders its caller on an interval. Deliberately separate
// from use-resource.ts's timer: that one refetches data, this one only
// advances the current time so a countdown can redraw.
//
// Keep this mounted in the smallest component that shows the time —
// every tick re-renders that component's subtree.
//
// No re-sync when intervalMs changes, deliberately. A caller that speeds its
// cadence up does so in a render, and the render that notices the faster
// cadence is the one caused by the previous tick — so the value carried
// across the change is already only milliseconds old.
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
