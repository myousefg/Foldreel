import { AnimatePresence, motion } from 'motion/react';
import { ImagePlus } from 'lucide-react';
import { useI18n } from '@/context/I18nProvider';
import { useFileDrag } from '@/lib/useFileDrag';

// Full-window cue while files are dragged in: the page underneath still
// receives the drop, this only shows where it will land.
export default function DropOverlay({ label }) {
  const { t } = useI18n();
  const active = useFileDrag();
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
          className="pointer-events-none fixed inset-0 z-50 p-4" aria-hidden="true" data-testid="drop-overlay"
        >
          <div className="w-full h-full rounded-2xl border-2 border-dashed border-ring bg-background/90 flex flex-col items-center justify-center gap-3">
            <span className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <ImagePlus className="w-6 h-6 text-primary" />
            </span>
            <p className="text-base font-medium">{label || t('common.dropToAdd')}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
