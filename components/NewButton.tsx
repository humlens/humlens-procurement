import { Plus } from 'lucide-react';

// Pairs with lib/useNewHotkey.ts — every list page's primary "create" action
// shares this so the "n" shortcut and its visible hint never drift apart.
// Opens the create panel in place (see SidebarModal) rather than navigating.
export default function NewButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="btn-primary">
      <Plus size={15} />
      {label}
      <kbd className="ml-1 rounded border border-white/30 bg-white/10 px-1 py-0.5 font-sans text-[10px] font-medium">
        N
      </kbd>
    </button>
  );
}
