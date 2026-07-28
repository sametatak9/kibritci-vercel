import { useEffect, useMemo, useState } from 'react';
import { CatalogKind, mergeCatalogOptions } from '../lib/catalogFieldUtils';
import { subscribeProgramCatalog } from '../lib/programKatalog';

export function useProgramCatalog(kind: CatalogKind, extraOptions: string[] = []) {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeProgramCatalog(
      kind,
      (list) => {
        setItems(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [kind]);

  const options = useMemo(
    () => mergeCatalogOptions(items, extraOptions),
    [items, extraOptions]
  );

  return { options, loading };
}
