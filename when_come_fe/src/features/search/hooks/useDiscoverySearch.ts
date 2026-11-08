import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/lib/errorToast';

/** One cancelable search session per input; IME and stale response guards share the same generation. */
export function useDiscoverySearch<T>(search: (query: string, signal?: AbortSignal) => Promise<T[]>, limit: number, initialQuery = '', enabled = true) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [resultsKey, setResultsKey] = useState('');
  const generation = useRef(0);
  const controllerRef = useRef<AbortController>();

  function changeQuery(text: string) {
    generation.current += 1;
    controllerRef.current?.abort();
    setQuery(text);
    setResults([]);
    setError(null);
    setIsLoading(false);
  }
  function handleCompositionStart() {
    generation.current += 1;
    controllerRef.current?.abort();
    setIsComposing(true);
    setIsLoading(false);
  }
  function handleCompositionEnd(text: string) { changeQuery(text); setIsComposing(false); }

  useEffect(() => {
    const term = query.trim();
    if (!enabled || isComposing || !term) { setResults([]); setIsLoading(false); return; }
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await search(term, controller.signal);
        if (controller.signal.aborted || currentGeneration !== generation.current) return;
        setResults(data.slice(0, limit));
        setResultsKey(`${term}:${currentGeneration}`);
      } catch (reason) {
        if (controller.signal.aborted || currentGeneration !== generation.current) return;
        setResults([]);
        setError(getErrorMessage(reason, '검색 결과를 불러오지 못했어요. 다시 시도해 주세요.'));
      } finally {
        if (!controller.signal.aborted && currentGeneration === generation.current) setIsLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, isComposing, enabled, retry, search, limit]);

  useEffect(() => {
    if (!(import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === 'true')) return;
    function handleRegionChange() { changeQuery(''); }
    window.addEventListener('when-come-demo-region', handleRegionChange);
    return () => window.removeEventListener('when-come-demo-region', handleRegionChange);
  }, []);

  return { query, results, isLoading, error, resultsKey, changeQuery, handleCompositionStart, handleCompositionEnd, retry: () => setRetry(value => value + 1) };
}
