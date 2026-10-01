# Humlens business loops

The business loops that Humlens Commerce, Inventory and Procurement run between them: what each
step does, which app does it, what passes to the next step without anyone typing it, and where an
AI agent or assistant helps. How the apps talk is in `CONTRACT.md`; this file is about what that
adds up to for the business.

Each app ships a copy of this file. When you change a loop, update it in all three repos.

Status as of 30 September 2026. "Verified" means the loop was run against the three apps with real
data, not just read in the code. Screens added in this release compile and are behind sign-in, but
haven't been clicked through in a browser yet (see the last section).

**Legend.** Apps: **P** Procurement · **I** Inventory · **C** Commerce.
AI: **Agent** works in the background under the team's policy and asks a person where money or
stock moves; **Assistant** is one a person talks to. Every AI change is recorded in the app's agent
inbox and can be undone there, unless it says otherwise.

## Loops that work end to end

### 1. Supplier to customer

The main loop: buying, stocking and selling one item, and buying it again.

| # | Step | App | What passes on by itself | AI |
|---|---|---|---|---|
| 1 | Supplier | P | Preferred supplier and agreed prices, ready for the next purchase | Agent drafts RFQ outreach emails |
| 2 | Purchase request | P | One request per item, whichever app noticed low stock first (7-day cooldown) | Assistant drafts a request from plain words; agent approves within policy |
| 3 | Purchase order | P | Promised delivery date; PunchOut suppliers receive the PO as cXML (with the date); the PO syncs to accounting (Xero also gets the date) | — |
| 4 | Goods receipt | P → I | Good-condition units become stock (`procurement:receipt:<id>`); damaged or wrong units go to a return to vendor (loop 4) | Agent drafts the return to vendor; agent runs the three-way invoice match |
| 5 | Stock in | I → C | The store re-reads stock and item cost within seconds (`stock.changed`) | Assistant turns "received 50 units…" into a movement to approve |
| 6 | Online store | C | Available stock and cost (margin) come from Inventory | Shopping assistant for customers |
| 7 | Customer order | C → I | Checkout holds the units (`store:txn:<id>`); the hold is kept until the order ships | Assistant answers "where's my order" |
| 8 | Pick, pack, ship | I, C → I | Orders waiting to ship are on Inventory's **To pick & ship** list with pick totals per SKU; shipping takes the held stock off hand (`store:order:<id>`) | — |
| 9 | Stock updated | I → P | Below the reorder point, a purchase request goes back to step 2 | Agent requests restocks before best sellers run out |

- Digital-only orders, and orders whose checkout couldn't hold stock, are taken off hand when placed.
- Cancelling before shipping releases the hold; cancelling after shipping puts the stock back.
- Code: `commerce/src/ecommerce/operations/{sync,reservations,hooks}.ts`,
  `inventory/models/{reservation,storeSync}.ts`, `inventory/pages/teams/[slug]/pick-list/`,
  `procurement/lib/operations.ts`.
- **Verified**: held on order (on hand 2, reserved 1) → shipped (on hand 1) → cancel before
  shipping released the hold → cancel after shipping put the stock back. The pick list returned
  only committed holds, with names and units, and left out checkouts in progress.

### 2. Returns: customer returns and courier returns

| Step | App | What happens | AI |
|---|---|---|---|
| Customer asks to return a delivered order | C | Refund or exchange, within the store's return rules | — |
| Return approved; pickup booked | C | Shiprocket, Delhivery or manual | — |
| Parcel received | C → I | The return is marked received; stock goes back in the store and in Inventory (`store:return:<id>`) | — |
| Refund | C | Through Razorpay or Stripe, or recorded as a manual refund (UPI, bank transfer) | — |
| Courier can't deliver; parcel back at the warehouse (RTO) | C → I | The order is cancelled and its stock put back | — |
| Refund after RTO (prepaid orders) | C | An `order.refund` proposal waits in the inbox; a person approves (amount editable, up to the order total); it refunds through the original provider or records a manual refund | Agent proposes; never refunds on its own; can't be undone |

- Code: `commerce/src/ecommerce/logistics/{returns,service}.ts`, `commerce/src/ecommerce/agents/storeActions.ts#refundOrder`.
- **Verified**: prepaid order shipped (on hand 1 → 0) → RTO delivered → order cancelled, stock back
  (0 → 1). Refund proposal approved at an edited amount → recorded as a manual refund, payment
  "refunded", a second refund refused.

### 3. Paying suppliers

| Step | App | What happens | AI |
|---|---|---|---|
| Request → approval | P | Approval workflow by amount, category and budget | Approval agent within policy; budget forecast |
| PO → goods receipt | P | Lines received against the PO, each with a condition (blank means good) | — |
| Invoice → three-way match | P | PO × receipt × invoice. Only good-condition units count as delivered: billing for damaged units fails the match and states the credit due, unless a replacement arrives | Invoice-match agent |
| Invoice approved | P → I | Unit prices become each item's moving-average cost in Inventory (`procurement:invoice:<id>`), and from there the store's margin; the bill syncs to accounting | — |
| Payment | P | Recorded, synced to accounting; bills paid in the accounting system are read back every 30 minutes | Spend-anomaly agent flags unusual vendor spend |

- Code: `procurement/models/{invoice,payment}.ts`, `procurement/lib/accounting/`.
- **Verified**: an invoice billing damaged units → mismatched, with "credit due"; billing only the
  good units → matched, with notes on the damaged units and the credit.

### 4. Supplier quality: returns to vendor and scorecards

| Step | App | What happens | AI |
|---|---|---|---|
| Damaged or wrong goods received | P | Kept out of stock | — |
| Return to vendor drafted | P | A draft `RTV-00001` for those lines, with the reason and the PO price | Agent drafts it; a person reviews it; undo cancels a draft |
| Sent → credited | P | A person marks it sent to the vendor and records the credit note (amount, reference); nothing is emailed | — |
| Scorecard | P | After every receipt and invoice approval: units delivered against ordered, share in good condition, on-time delivery against the promised date, invoices that matched, returns and credits. One automatic review per vendor per month, counted in the vendor's rating | — |

- On time means the receipt that completed the order arrived by the end of the promised day (UTC);
  an order still open after that day counts as late. Weights: fill 30%, quality 30%, on time 25%,
  invoice match 15%, spread over whichever measures exist.
- Code: `procurement/models/{vendorReturn,vendor}.ts`, `procurement/lib/ai/agents/vendorReturnAgent.ts`.
- **Verified**: 3 good + 2 damaged received → draft RTV with the 2 damaged → sent → credited;
  one PO on time and one late → on-time rate 50%, score 4.1.

### 5. Reorder levels that follow demand

| Step | App | What happens | AI |
|---|---|---|---|
| Sales and supplier lead times | I | Units issued over 90 days, days to deliver | — |
| Suggestion | I | New reorder point and quantity per item | Reorder-tuning agent (daily) |
| Approval | I | A person approves; the item is updated | — |
| Next low stock | I → P | Requests fire at the tuned level | — |

The store's own low-stock agent watches best sellers' rate of sale and asks for a restock before
they run out (Commerce → Procurement).

### 6. Stock accuracy

| Step | App | What happens | AI |
|---|---|---|---|
| Cycle count | I | Counted against expected | — |
| Variance | I | Lines over tolerance are flagged with where to look first | Cycle-count anomaly agent |
| Adjustment | I → C | Posted as a stock movement; the store re-reads stock | Assistant drafts adjustments from plain words |

Every movement (receipts, issues, transfers, adjustments, counts) goes through
`inventory/models/stock.ts#applyStockMovement`, which tells the store. If the store doesn't track
stock, the store's sync lists the products Inventory is missing in one inbox note, repeated only
when that list changes.

### 7. Cash on delivery

| Step | App | What happens | AI |
|---|---|---|---|
| COD order placed | C | Payment "Awaiting payment", with pincode checks for COD | — |
| Shipped | C → I | Stock taken off hand | — |
| Delivered | C | The order is marked paid, reference `cod:<AWB>` | — |
| Courier pays out | C | The courier's remittance report (CSV or rows: AWB, amount, UTR, date) is imported through `POST /api/logistics/cod-remittance`; matching orders are marked remitted, with unmatched rows and amount differences reported | — |
| Not paid out | C | Delivered COD orders not remitted after 10 days are listed in one inbox note with the total outstanding (repeated when the list changes, or weekly) | COD remittance agent (daily) |
| Not delivered (RTO) | C → I | Order cancelled, stock back (loop 2) | — |

- **Verified**: COD order delivered → "paid"; remittance import marked it (and reported a ₹1
  difference and an unknown AWB); the agent's note appeared once and cleared after the import.

### 8. Slow stock to clearance

| Step | App | What happens | AI |
|---|---|---|---|
| No sales past the threshold | I | Items on hand with no issue for N days | Dead-stock agent |
| Store told | I → C | `stock.idle` with the SKUs, on hand and idle days | — |
| Markdown proposed | C | One proposal per SKU the store sells: 15% by default (at most 20%), lowered so the price stays above cost; if even 1% would sell at a loss, a note instead. Not repeated for 30 days | Clearance agent |
| Approval | C | A person approves (can change the % and how many days it lasts, 1–90, default 30) or rejects | — |
| Markdown ends | C | The old price comes back when the markdown ends, or earlier with undo. If someone changed the price meanwhile, it's left and noted | Markdown agent (hourly) |

- Code: `inventory/lib/ai/agents/deadStockAgent.ts`,
  `commerce/src/ecommerce/agents/storeAgents/{clearance,markdowns}.ts`,
  `commerce/src/ecommerce/agents/storeActions.ts#markDownPrice`.
- **Verified** from the store's side: proposal → approved → price restored when it ended; a markdown
  below cost refused, and the proposal trimmed to 10% to stay above cost. Inventory sending
  `stock.idle` is typechecked but hasn't fired yet: no item has been idle past the threshold.

### 9. Getting shoppers back (Commerce)

Abandoned cart → one reminder with the discount the policy allows (agent) → purchase → review →
review moderation (agent publishes genuine reviews, negative ones included, and holds back spam).
Coupons can now be limited to products or categories, so offers can target what needs to move.

## Changed in this release

| Change | Apps | Why |
|---|---|---|
| Stock leaves Inventory when an order ships, not when it's placed; `POST /reservations/commit` | C, I | Promised stock stays off sale; the shelf count matches the shelf |
| **To pick & ship** list and "Orders waiting to ship" dashboard card; `GET /reservations?purpose=orders` | I | Warehouse staff had no list of what to pick |
| Store products missing in Inventory are created there with the store's stock as opening stock (Track stock on), or listed in one inbox note (Track stock off) | C → I | Sales of those products were rejected by Inventory |
| Cancelling an order only puts back what Inventory actually took off | C | Rejected sales were being added back as stock that never existed |
| Courier returns (RTO) cancel the order and restock it; refunds are proposed for approval | C | Returned parcels stayed "shipped"; refunds were forgotten |
| COD orders marked paid on delivery; courier remittances imported and chased | C | COD orders stayed "Awaiting payment"; payouts weren't checked |
| Item cost from Inventory on products and variants, with margin in the admin | I → C | Nobody could see margin in the store |
| Idle stock → markdown proposal (`stock.idle`), never below cost, ending on its own | I → C | Dead-stock findings led nowhere; markdowns never ended |
| Coupons limited to products or categories | C | Offers could only apply to the whole cart |
| Damaged or wrong goods aren't stocked; returns to vendor; invoices can't bill damaged units | P, C | Damaged units became sellable stock and were paid for |
| Promised delivery date on POs; automatic vendor scorecards with on-time rate | P | Vendor ratings were typed in by hand; lateness wasn't measured |

## Gaps that remain

| Gap | Effect today | What closing it takes |
|---|---|---|
| No screen to import a COD remittance report | Someone technical posts the report to `POST /api/logistics/cod-remittance`; the inbox note uses that wording | An upload form on the orders or logistics admin |
| Replacements for returned goods can only be booked through the API | Damaged units count in the PO's received quantity, so the PO can show "received" and the receiving page won't take a replacement | Receive replacements against a return to vendor |
| Coupons don't check cost | A coupon can take an item below cost (markdowns can't) | The same cost check as markdowns, as a warning when saving the coupon |
| QuickBooks, NetSuite and Sage don't get the promised delivery date; a changed date isn't re-sent | Those systems show POs without it | Map each system's delivery-date field; re-sync the PO when the date changes |
| Markdowns approved before this release don't end on their own | Their lower price stays until someone undoes it | Undo them, or set an end on them by hand |
| Procurement's local database has three migrations that aren't in the repo (`20260928160000_operations_agents`, `20260928180000_invoice_documents_and_email`, `20260928200000_performance_indexes`) | A fresh setup from the repo won't match; the new migration was written to only add | Commit those three migrations to the Procurement repo |
| "Track stock" off in the store | Products missing in Inventory aren't created there; the inbox lists them | Turn "Track stock" on, or add those items in Inventory |
| Procurement isn't connected straight to Inventory in some setups | Receipts reach Inventory only through Commerce | Connect under Procurement → Settings → Integrations (configuration, not code) |
| New screens not yet checked in a browser | To pick & ship; Returns to vendor; PO promised date; condition on receiving; margin panel; refund amount in the inbox | Click through each once signed in |
