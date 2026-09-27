import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Lets a deep link (the ⌘K "Create" commands, or a link from another page
// like "convert this requisition to a PO") open a list page's create panel
// via a `?new=1` query param, now that creation happens in-page instead of
// on a separate /new route. The param is stripped from the URL once read so
// it doesn't linger or reopen the panel on a later refresh.
export function useOpenNewFromQuery(setOpen: (open: boolean) => void) {
  const router = useRouter();
  const shouldOpen = router.query.new === '1';

  useEffect(() => {
    if (!shouldOpen) return;
    setOpen(true);
    const { new: _new, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldOpen]);
}
