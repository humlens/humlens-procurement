# Humlens Procurement

From request to payment: requisitions with approvals, RFQs, vendors, contracts, purchase orders, receiving and invoice matching.

This app runs on its own. It can also connect to Humlens Commerce and Inventory: see
[CONTRACT.md](CONTRACT.md) for how the apps talk to each other.

## Accounting, ERP and PunchOut

- **Accounting and ERP** (Settings → Integrations): QuickBooks Online, Xero,
  Sage Accounting and NetSuite. Issued POs, approved invoices (as bills) and
  paid payments are sent as they happen, through the same retrying outbox as
  the other connections; vendors are created on first use; bills paid there
  are marked paid here every 30 minutes. QuickBooks, Xero and Sage connect
  with OAuth (register an app and its redirect URI, shown in Settings); NetSuite
  uses token-based authentication. Sage's API has no purchase orders, so only
  its bills and payments sync. Code: `lib/accounting/`.
- **PunchOut** (a vendor's page): cXML or SAP OCI catalogs. Requesters shop the
  supplier's own site from Requisitions, and the cart comes back as lines on a
  draft requisition. With cXML, issued POs can also be sent to the supplier as
  an OrderRequest. Code: `lib/punchout/`.

## Develop

```bash
cp .env.example .env          # fill in NEXTAUTH_SECRET at least
docker compose up -d          # Postgres on localhost:5433
npm install
npx prisma migrate deploy
npm run seed                  # optional sample data
npm run dev                   # http://localhost:4100
```

`npm run check-types`, `npm run check-lint` and `npm test` run the checks.

## Self-host

```bash
cp .env.selfhost.example .env # set NEXTAUTH_SECRET, the URLs and POSTGRES_PASSWORD
docker compose -f docker-compose.selfhost.yml up -d --build
```

This builds the image, applies database migrations in a one-off `migrate`
container, then starts the app on port 4100, with Postgres alongside. Put a
reverse proxy in front of it for TLS. `GET /api/health` returns 200 when the app
and its database are up.

Background jobs (delivering messages to connected apps) run
inside the server process. On serverless hosting set `DISABLE_SCHEDULER=1` and
trigger them from a cron instead.

`NEXT_PUBLIC_*` values are baked in when the image is built, so rebuild with
`--build` after changing them.
