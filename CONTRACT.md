# Humlens app contract (v1)

Humlens Commerce, Inventory and Procurement are separate apps with separate
databases. They only talk to each other over HTTP, using what this document
describes. Each app ships a copy of this file: when you change anything here,
change it in all three repos and keep old fields working until every app has
been upgraded.

Every app runs on its own. With nothing connected, each one works as a
standalone product; each connection below is optional.

## Connecting apps

| From | To | Set up in | Credential |
|---|---|---|---|
| Commerce | Inventory | Commerce admin → Integrations | Inventory API key |
| Commerce | Procurement | Commerce admin → Integrations | Procurement API key |
| Inventory | Procurement | Inventory → Settings → Integrations | Procurement API key |
| Procurement | Inventory | Procurement → Settings → Integrations | Inventory API key |

When Commerce connects to Inventory or Procurement, it also registers a
webhook with `PUT /api/v1/webhook` so that app can tell the store about changes.

Shared environment (same value in every app that should link up):

| Variable | Purpose |
|---|---|
| `HUMLENS_SSO_SECRET` | Signs single sign-on tickets. 32+ random characters. |
| `NEXT_PUBLIC_HUMLENS_COMMERCE_URL` | Base URL of Commerce, for the app switcher and SSO. |
| `NEXT_PUBLIC_HUMLENS_INVENTORY_URL` | Base URL of Inventory. |
| `NEXT_PUBLIC_HUMLENS_PROCUREMENT_URL` | Base URL of Procurement. |

An app whose URL isn't set is left out of the switcher; nothing else breaks.

## 1. REST API calls: `/api/v1`

Calls go to `<app base URL>/api/v1<path>` with:

```
Authorization: Bearer <API key created in the receiving app>
Content-Type: application/json
```

Errors come back as `{ "error": { "message": "..." } }`. The caller retries
network errors, `5xx`, `408` and `429`; any other `4xx` isn't retried, because
the request itself is wrong.

Every write carries a `reference` that identifies the change it reports.
Receivers must treat a repeated reference as already done, so that retries
never apply a change twice.

### Inventory endpoints

| Method and path | Called by | What it does |
|---|---|---|
| `GET /team` | Commerce, Procurement | Checks the key and names the team. |
| `GET /items`, `GET /stock` | Commerce | Reads items and stock levels by SKU for the stock sync. |
| `POST /reservations` | Commerce | Holds stock for a checkout. Reference `store:txn:<id>`. Fails with the lines that are short when stock is insufficient. |
| `POST /reservations/release` | Commerce | `{ reference }`: releases a hold when payment fails or the checkout is abandoned. Holds also expire on their own. |
| `POST /stock-movements` | Commerce, Procurement | Records a movement. Commerce sends `type: "issue"` for a paid order, naming its hold in `reservation`, which consumes it. Procurement sends `type: "receipt"` with reference `procurement:receipt:<id>` when goods are received. |
| `POST /item-costs` | Procurement | Sends `{ reference, lines: [{ sku, quantity, unitCost }] }` from an approved invoice. Inventory updates each item's moving-average cost. Reference `procurement:invoice:<id>`. |
| `PUT /webhook`, `DELETE /webhook` | Commerce | Registers or removes the store's webhook: `{ url, secret }`, where the secret is at least 32 characters. |

### Procurement endpoints

| Method and path | Called by | What it does |
|---|---|---|
| `GET /team` | Commerce, Inventory | Checks the key and names the team. |
| `POST /requisitions` | Inventory, Commerce | Raises a purchase request: `{ title, justification, externalReference, submit, lines: [{ sku, description, quantity, unit }] }`. Inventory's reorder uses reference `inventory:reorder:<day>:<hash>`; the store's use `store:...`. |
| `GET /requisitions`, `GET /goods-receipts` | Commerce | Reads status for the store's sync. |
| `PUT /webhook`, `DELETE /webhook` | Commerce | As in Inventory. |

## 2. Webhooks to Commerce

Inventory and Procurement tell a connected store about changes by POSTing to
the URL it registered (Commerce's `/api/operations/notify`).

Headers:

```
Content-Type: application/json
X-Humlens-Event: <event name>
X-Humlens-Timestamp: <unix seconds>
X-Humlens-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<raw body>" with the registered secret>
```

Body:

```json
{ "event": "stock.changed", "reference": "stock.changed:<uuid>", "data": { }, "sentAt": "2026-09-27T10:00:00.000Z" }
```

Commerce rejects a signature that doesn't match, or a timestamp more than 300
seconds from its own clock. Any `2xx` response counts as delivered.

| Event | Sent by | `data` |
|---|---|---|
| `stock.changed` | Inventory | `{ skus: string[] }`. Changes still waiting to be sent are merged into one message. The store then re-reads stock for those SKUs. |
| `receipt.created` | Procurement | `{ receiptId, poNumber }` |
| `requisition.updated` | Procurement | `{ requisitionId, externalReference, status, ... }`, only for requests the store raised (`externalReference` starts with `store:`). |

## 3. Delivery guarantees

Senders store each message in their own outbox table before sending it. If the
other app is down, the message is retried with backoff (30 seconds, doubling,
capped at an hour) for up to 8 attempts. After that it shows as failed under
Settings → Integrations, where it can be retried by hand. So receivers must be
idempotent on `reference`.

Checkout doesn't depend on Inventory being up: if a hold can't be placed
because Inventory is unreachable, the order goes through without one and the
next stock sync catches up.

## 4. Single sign-on handoff

To move a signed-in user to another app, the current app redirects to the
target app's receive path with a ticket:

| Target | Receive path |
|---|---|
| Inventory | `/api/auth/sso?ticket=...` |
| Procurement | `/api/auth/sso?ticket=...` |
| Commerce | `/api/sso/receive?ticket=...` |

`ticket` is `<base64url(JSON)>.<base64url(HMAC-SHA256(base64url(JSON), HUMLENS_SSO_SECRET))>`,
where the JSON is:

```json
{ "email": "a@b.com", "name": "A B", "iss": "inventory", "aud": "commerce", "exp": 1790000000, "nonce": "...", "next": "/admin" }
```

The receiving app checks the signature, that `aud` is itself, that `exp`
hasn't passed (tickets last 60 seconds) and that the nonce hasn't been used.
It then signs in its own account with the same email; it never creates
accounts or grants roles. `next` must be a same-site path.

## Changing this contract

- Add fields; don't rename or remove them. Receivers ignore fields they don't know.
- A breaking change needs a new path (`/api/v2/...`) or event name, and the old
  one kept until every app has been upgraded.
- Update this file in all three repos in the same release.
