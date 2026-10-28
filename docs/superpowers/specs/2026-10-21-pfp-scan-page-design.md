# Pending For Planning · Scan — design (SED-14605, RCBC)

**Ticket:** [SED-14605](https://fareye.atlassian.net/browse/SED-14605), "Scanning Enhancement for Carrier Allocation – Pending for
Planning". RCBC · CFT · PFP · High · customer commit date **23 Oct 2026**.
**Prototype:** `/local/pending-for-planning-scan`, sidebar **Scan & Allocate**. Screens are in `2026-10-21-pfp-scan/`.
**Figma:** https://www.figma.com/design/spXL2TFSn1mllVcvoazo4i?node-id=1-7 (the five screens, captions and open questions; pushed 2026-10-21).

## The job
At the hub, the user picks up consignments one by one, scans each label, and then gives the scanned set a carrier. The page is a
**separate copy of Pending For Planning**: the same table, filters, columns, selection actions and consignment view. The search box
becomes a scanner, and the table shows **only what was scanned, appended in scan order**.

## Layout (top to bottom) — production's Pending For Planning (owner, 2026-10-21: "exactly like this production one")
1. **Filter row**, as production: Date range · State/Secondary State · funnel (Merchant and Order Type sit inside it, as on
   production) · Clear Filters · **Quick Filter** on the right.
2. **Carriers / Categories cards**, as production. They work as filters.
3. **List toolbar**, as production with the search box replaced: a **scan field** in production's search grammar (owner,
   2026-10-21, "this is existing design"): the last code stays in the box, **selected**, so the scanner's next code replaces it;
   the box turns brand-red while a scan is on; and **✕ Clear (n)** — clear and count as ONE control — sits inside its right end
   behind a hairline, only while something is scanned (grey, red on hover, so it never reads as a second Clear Filters). Then
   **Exceptions**, then production's readouts on one line (Total Consignments · Weight · Volume · Pallet Spaces,
   counting the **scanned** rows), then Download and Table settings.
4. **Scan line** (the one addition): `(k hidden by the filters)`, the last scan's result as a tinted pill
   (green / amber / red), and on the right **More actions (n)** (the usual selection panel, kept shut while scanning) and the
   primary **Allocate carrier (n)**.
5. **Table**, production's grid: category icons · **Consignment Number** · Reference Number · Ship By Date · State · Carrier ·
   Secondary State · … (no Active Leg / Pickup No). Only the scanned consignments appear, flat, in scan order. Each new scan is
   added at the end and ticked, the page jumps to it, and the row flashes. A column sort still works.
6. **Footer**, as production: `20 / Page` · pager · **Refresh**. Refresh re-checks the scanned list, and a consignment planned or
   moved on since its scan drops out.

Empty state: "Scan a consignment barcode or number to start — each scan is added here."

## Scanning rules
- A scanner types the code and sends **Enter**. The field empties and keeps focus. A pasted column (lines / commas) is one scan per
  code.
- Matching is **exact** (trimmed, upper-cased) on Order Number, Reference Number or Tracking Number. A **package barcode**
  (`<order>-P<n>`) resolves to its consignment.
- A scan is checked against **the listing**: every consignment in the Pending For Planning queue, on both legs, that passes the
  filters on the line.

| Scan | Result pill | Effect |
|---|---|---|
| In the listing, new | green · `SEKO1-F-345 added` (Clear (n) goes up) | appended, ticked, flashed |
| Already scanned | amber · `SEKO1-F-345 is already scanned (#1)` | the row flashes, nothing is added |
| In the queue but filtered out | red · `… is not in this listing — check the filters` | not added |
| Exists but not pending for planning | red · `… is not pending for planning (Delivered)` | not added |
| A pickup request number | red · `PR-000104 is a pickup request — a carrier is allocated per consignment` | not added |
| Unknown | red · `XYZ — not found` | not added |
| A pasted list | green / amber · `2 added · 1 already scanned · 1 not added — last: …` | each code handled as above |

**✕ Clear (n)** empties the box and the scanned list, disappears, unticks those rows, resets the totals and puts the focus back in the scan field. Clear Filters
stays separate.

## Allocate carrier
- **Allocate carrier (n)** opens a popup for the ticked scanned consignments. The same popup now backs **Modify Carrier** in the
  main page's selection menu, which used to say "Not available in the prototype".
- **Carrier** is a searchable list of the network's carriers, without "No Carrier". It is pre-filled when every row has the same
  carrier.
- Production's rule applies: a carrier can change only when the consignment is **At Facility or Ready For Last Mile Dispatch**.
  Other rows are listed under **Skipped (n)** with that reason, and nothing happens to them.
- **Allocate to n** writes the carrier onto the order and its consignment block, so View Consignment agrees with the list. A
  toast reads "n consignments allocated to Own Fleet".

## Open questions for the product owner
1. **Filtered-out scans:** a scan the current filters exclude is refused. Should it be kept instead, and shown with a warning?
2. **Eligibility:** is "At Facility or Ready For Last Mile Dispatch" right for RCBC's scanning step, or can a carrier be set
   earlier (Created / Ready To Ship)?
3. **Persistence:** the scanned list lives only on the page; a refresh or another page empties it. Should it survive a refresh or
   a shift change?
4. **Sound / haptics:** a beep for valid vs invalid scans (as on the Inbound scanner)?
5. **Package barcodes:** should a scanned package tick only its consignment (today), or also show which package was scanned?
