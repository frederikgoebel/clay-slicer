import { useEffect, useState } from 'react';

/** Returns `value` after it has stopped changing for `ms` (compared by JSON, so objects are fine). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
    // `key` represents `value`; depending on `value` itself would restart on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return debounced;
}
