import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, ShoppingCart } from 'lucide-react';

import { apiFetch, apiPost } from '@/lib/fetcher';

type Catalog = { id: string; vendorName: string; protocol: 'CXML' | 'OCI' };

// "Shop a supplier catalog": opens a vendor's PunchOut site. Whatever the
// requester checks out there comes back as lines on this draft (or a new
// draft requisition when started from the list). Hidden when no catalogs exist.
export default function ShopCatalogButton({ slug, requisitionId, className = 'btn-secondary' }: { slug: string; requisitionId?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const { data: catalogs } = useQuery({
    queryKey: ['punchout-catalogs', slug],
    queryFn: () => apiFetch<Catalog[]>(`/api/teams/${slug}/punchout`),
    enabled: !!slug,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!catalogs?.length) return null;

  const shop = async (catalog: Catalog) => {
    setOpening(catalog.id);
    try {
      const { url } = await apiPost<{ url: string }>(`/api/teams/${slug}/punchout/${catalog.id}/start`, { requisitionId });
      toast.success(`Opening ${catalog.vendorName}…`);
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The catalog couldn’t be opened.');
      setOpening(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" className={className} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <ShoppingCart size={15} />
        Shop a supplier catalog
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          <p className="px-3 pb-1.5 pt-2 text-xs text-gray-500">
            {requisitionId ? 'Items you check out are added to this requisition.' : 'Items you check out become a new draft requisition.'}
          </p>
          {catalogs.map((catalog) => (
            <button
              key={catalog.id}
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-60"
              onClick={() => shop(catalog)}
              disabled={opening !== null}
            >
              <span className="truncate font-medium text-gray-800">{catalog.vendorName}</span>
              <span className="shrink-0 text-xs text-gray-400">{opening === catalog.id ? 'Opening…' : catalog.protocol === 'OCI' ? 'OCI' : 'cXML'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
