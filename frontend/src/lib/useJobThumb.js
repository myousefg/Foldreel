import { useEffect, useRef, useState } from 'react';
import { jobsApi } from '@/lib/api';

// job id -> first file's path, or null when it has none. Kept for the session so
// scrolling a long list back and forth doesn't ask the backend again.
const cache = new Map();

// The first image or video a finished job produced, fetched only once its row
// scrolls into view (a library can hold hundreds of jobs).
export function useJobThumb(job) {
  const ref = useRef(null);
  const wanted = job.status === 'done' && (job.files_ok > 0 || job.files_skipped > 0);
  const [path, setPath] = useState(() => (cache.has(job.id) ? cache.get(job.id) : undefined));

  useEffect(() => {
    if (!wanted || path !== undefined) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    let cancelled = false;
    const load = async () => {
      let found = null;
      try {
        const { files } = await jobsApi.files(job.id, 1);
        found = files?.[0]?.path || null;
      } catch { /* leave as null: the row just shows its avatar */ }
      cache.set(job.id, found);
      if (!cancelled) setPath(found);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: '120px' });
    io.observe(node);
    return () => { cancelled = true; io.disconnect(); };
  }, [wanted, path, job.id]);

  return { ref, path: wanted ? path : null };
}
