import { useEffect, useRef, useState } from 'react';
import { OnDemandCache } from './onDemandCache';

export function useOnDemandSummary<T>(key: string, load: () => Promise<T>, enabled = true) {
  const cache = useRef(new OnDemandCache<T>());
  const loader = useRef(load); loader.current = load;
  const [record, setRecord] = useState<{ key: string; data: T } | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled || !key) return;
    let live = true;
    const saved = cache.current.get(key);
    if (saved !== undefined) { setRecord({ key, data: saved }); setBusy(false); return; }
    setBusy(true); setError('');
    cache.current.read(key, loader.current).then((data) => { if (live) setRecord({ key, data }); })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : 'Could not load this summary.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [key, enabled, version]);
  const refresh = () => { if (!key || busy) return; cache.current.invalidate(key); setVersion((current) => current + 1); };
  return { data: record?.key === key ? record.data : cache.current.get(key) ?? null, busy, error, refresh };
}
