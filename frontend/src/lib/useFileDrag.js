import { useEffect, useRef, useState } from 'react';

// True while files from outside the app are dragged over the window. Drags that
// start inside the page (reordering a list) carry no files and are ignored.
export function useFileDrag() {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const enter = (e) => { if (hasFiles(e)) { depth.current += 1; setActive(true); } };
    const leave = (e) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const end = () => { depth.current = 0; setActive(false); };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', end);
    window.addEventListener('dragend', end);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', end);
      window.removeEventListener('dragend', end);
    };
  }, []);
  return active;
}
