import type { ConnectionKind } from '@prisma/client';

import type { ConnectionOptions } from '@/lib/connections';

// What Settings → Integrations offers in this app: the app it can connect to,
// and that connection's switches. (The same page ships in Inventory with its
// own config.)
export type ToggleOption = { key: keyof ConnectionOptions; label: string; description: string; default: boolean; requires?: keyof ConnectionOptions };

export const integrationsConfig: {
  thisApp: string;
  target: Extract<ConnectionKind, 'INVENTORY' | 'PROCUREMENT'>;
  targetName: string;
  keyPrefix: string;
  keyHelp: string;
  toggles: ToggleOption[];
} = {
  thisApp: 'Humlens Procurement',
  target: 'INVENTORY',
  targetName: 'Humlens Inventory',
  keyPrefix: 'hinv_',
  keyHelp: 'Create one in Humlens Inventory under Settings → API keys, as an admin or owner.',
  toggles: [
    {
      key: 'pushReceipts',
      label: 'Add received goods to Inventory stock',
      description:
        'Each goods receipt goes straight into Inventory (lines need a SKU), so the warehouse sees deliveries even without a store in between. A store forwarding the same receipt is recognised and not counted twice.',
      default: true,
    },
    {
      key: 'pushCosts',
      label: 'Update item costs from approved invoices',
      description: 'When an invoice is approved, what was actually paid per unit updates each item’s cost in Inventory (moving average), so margins and stock value stay real.',
      default: true,
    },
  ],
};
