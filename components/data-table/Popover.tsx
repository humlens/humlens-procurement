import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

// A small anchored menu rendered into <body>, so it isn't clipped by the
// table's scroll container or trapped by the sticky header's backdrop blur.
export default function Popover({
  anchorRef,
  open,
  onClose,
  align = 'start',
  width = 224,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  align?: 'start' | 'end';
  width?: number;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const left = align === 'end' ? rect.right - width : rect.left;
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    });
  }, [open, anchorRef, align, width]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    const onScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !position) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      style={{ position: 'fixed', top: position.top, left: position.left, width }}
      className="z-50 rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-lg"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  active,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-gray-100 ${
        active ? 'font-medium text-brand-700' : 'text-gray-700'
      }`}
    >
      {Icon && <Icon size={14} className="shrink-0 text-gray-400" />}
      {children}
    </button>
  );
}

export const MenuDivider = () => <div className="my-1 border-t border-gray-100" />;
