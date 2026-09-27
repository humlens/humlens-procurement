import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';

// The shared shell for every create/edit form in the app: a panel that
// slides in from the right over the current list/detail page, instead of
// navigating to a separate /new or /edit route. Staying on the same page
// means the list underneath never has to re-fetch just to show a form, and
// closing the panel (Escape, backdrop click, or the X) always leaves you
// exactly where you were.
export default function SidebarModal({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: 'md' | 'lg';
}) {
  useHotkeys('escape', () => onClose(), { enabled: open, enableOnFormTags: true });

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          aria-hidden
          className="fixed inset-0 z-50 bg-gray-900/30 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fixed inset-y-0 right-0 z-50 flex w-full ${
          width === 'lg' ? 'max-w-2xl' : 'max-w-md'
        } flex-col border-l border-gray-200 bg-white shadow-popover transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
      >
        {open && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">{title}</h2>
                {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          </>
        )}
      </div>
    </>
  );
}
