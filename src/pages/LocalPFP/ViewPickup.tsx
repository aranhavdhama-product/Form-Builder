/**
 * View Pickup Request — the right-side drawer a pickup row opens.
 *
 * Built to be the SAME SURFACE as View Consignment, not a cousin of it: the same
 * `.pfp-overlay` shell, the same header, the same left rail of tabs, the same
 * `Section` → four-column grid inside the pane. A reader moving between a
 * consignment row and a pickup row should not have to re-learn where anything
 * is; only the tab names and the field inventory change, because the underlying
 * things genuinely differ.
 *
 * Where it differs is where a booking differs from a parcel — and those are the
 * tabs a consignment has no use for:
 *
 *  - **Orders** — what the booking covers, each marked picked or not.
 *  - **Reconciliation** — booked against actually collected. This is the tab
 *    that exists because `pickedOrderIds` may contain ids that are NOT in
 *    `orderIds`: a parcel booked under another request can be handed over here,
 *    which is precisely the fact a parent/child tree could not express.
 *  - **Overages** — barcodes scanned at the handover that matched no order in
 *    the system. Each one is a missing record, so they are listed, not counted.
 *
 * A Reserved booking's weight and piece count are the merchant's ESTIMATE, made
 * before any order existed. They render with a `~` and say so in words.
 */
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { PR_STATUSES } from '../../growOrders/tabs'
import type { GrowPickupRequest, PickupRequestStatus } from '../../growOrders/types'
import {
  ArrowLeft, ClipboardList, Close, ListTree, MapPin,
} from './icons'
import { EmptyState, StatusPill } from '../../nueva/components'
import { useGrowOrders } from '../../growOrders/store'
import { cancelReasonLabel, failureReasonLabel } from '../../growOrders/pickupReasons'
import { packageNumbersOf, palletSpacesOf, toPickupRow } from './adapter'
import {
  actualQty, categoriesOfPr, plannedQty, prTypeLabel, statusLabel,
} from '../LocalPickup/prModel'
import type { Pair } from './overlayBits'
import { fmtDateTime, pickupSummary, prOrders, prOutcomeWords } from '../GrowOrders/utils'
import { ArrowRight } from './icons'
import { Section } from './overlayBits'
import { dash, stamp } from './overlayFormat'
import { cssVars } from './stagingTokens'
import './pfpChrome.css'

/**
 * THREE tabs, not six.
 *
 * Summary and Booking described one thing from two angles, and Orders /
 * Reconciliation / Overages were three views of the same handover — what was
 * booked, what actually came, and what turned up with no record. Splitting them
 * made a reader visit three tabs to answer one question. The merchant portal
 * keeps them together on one card for the same reason; so does this.
 */
const TABS = ['Summary', 'Orders', 'Events']

/** the handover scan mode, in the settings page's own words */
const HANDOVER_MODE: Record<GrowPickupRequest['handover']['mode'], string> = {
  driver: 'Driver scan', hub: 'Hub scan', both: 'Driver + hub scan',
}
const TAB_ICONS = [ClipboardList, ListTree, MapPin]

/**
 * `basePath` = the list the drawer sits over (Pending For Planning by default;
 * the Pickup page passes `/local/pickup`). Outside the PFP tree the drawer
 * carries the PFP token variables itself, so it renders identically there.
 */
export default function ViewPickup({ basePath = '/local/pending-for-planning' }: { basePath?: string } = {}) {
  /* both PFP variants (current + `-replica`) already carry the token vars */
  const inPfp = basePath.startsWith('/local/pending-for-planning')
  return inPfp ? <ViewPickupBody basePath={basePath} /> : (
    <div className="fe-nueva" style={cssVars}><ViewPickupBody basePath={basePath} /></div>
  )
}

function ViewPickupBody({ basePath }: { basePath: string }) {
  const { prId } = useParams()
  const nav = useNavigate()
  const { search } = useLocation()
  const db = useGrowOrders()
  const [tab, setTab] = useState(0)

  /* back to the list on the tab it was opened from (`?tab=` rides along) */
  const back = () => nav(`${basePath}${search}`)

  const pr = db.pickupRequests.find((p) => p.id === prId)
  const row = useMemo(() => (pr ? toPickupRow(pr, db) : null), [pr, db])
  const byId = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders])
  /* owner, 2026-09-25: on Pending for Planning a booked order opens its
     consignment overlay; pushed (not replaced), so Back returns here */
  const inPfp = basePath.startsWith('/local/pending-for-planning')
  const orderLink = (id: string, number: string) => (inPfp ? (
    <button type="button" className="pfp-order pfp-orderlist-num" title={`View ${number}`}
      onClick={() => nav(`${basePath}/${id}${search}`, { state: { fromPickup: true } })}>
      <ArrowRight size={16} />{number}
    </button>
  ) : <span className="pfp-orderlist-num">{number}</span>)

  if (!pr || !row) {
    return (
      <>
        <div className="pfp-overlay-scrim" onClick={back} />
        <aside className="pfp-overlay" role="dialog" aria-label="Pickup request">
          <header className="pfp-overlay-head">
            <button type="button" className="pfp-iconbtn" aria-label="Back" onClick={back}><ArrowLeft size={16} /></button>
            <span className="pfp-overlay-title">Pickup request</span>
          </header>
          <div className="pfp-overlay-body" style={{ padding: 24 }}>
            <EmptyState title="This pickup request no longer exists." />
          </div>
        </aside>
      </>
    )
  }

  const summary = pickupSummary(pr)
  const booked = prOrders(pr, byId)
  const bookedIds = new Set(pr.orderIds)
  /* collected here but booked elsewhere — the fact a tree cannot show */
  const extra = pr.pickedOrderIds.filter((id) => !bookedIds.has(id))
  const reserved = row.rowType === 'Reserved Pickup'
  const ftl = row.rowType === 'FTL Pickup'

  const weight = row.weightKnown
    ? `${row.weightApprox ? '~ ' : ''}${row.weightKg.toFixed(1)} KG`
    : '—'
  /* owner, 2026-10-22: the details are at the PICKUP level — its consignments and their packages, when it was made and last changed */
  const status = statusLabel(pr)
  const consignmentNos = booked.map((o) => o.orderNumber)
  const packageNos = booked.flatMap(packageNumbersOf)
  const updatedAt = pr.statusHistory.reduce((t, e) => (e.at > t ? e.at : t), pr.createdAt)
  const planned = plannedQty(pr, byId), actual = actualQty(pr, byId)
  const pallets = booked.reduce((n, o) => n + palletSpacesOf(o), 0)
  const services = [...new Set(booked.map((o) => o.serviceType).filter(Boolean))]
  const categories = categoriesOfPr(pr, byId)
  /* a list of numbers: chips, the first 12, then "+n more" opens the Orders tab */
  const numbers = (xs: string[]) => (xs.length ? (
    <span className="pfp-numchips">
      {xs.slice(0, 12).map((x) => <span key={x} className="pfp-numchip">{x}</span>)}
      {xs.length > 12 && <button type="button" className="pfp-numchip" data-more onClick={() => setTab(1)}>+{xs.length - 12} more</button>}
    </span>
  ) : '—')
  /* optional rows show only when they say something */
  const keep = (pairs: (Pair | false | null | undefined | '' | 0)[]): Pair[] => pairs.filter((x): x is Pair => !!x)
  const loadPairs = keep([
    row.sizeClass && ['Size Class', row.sizeClass],
    row.vehicleType && ['Vehicle Type', row.vehicleType],
    row.vehicleUnit != null && ['Number of Vehicles', String(row.vehicleUnit)],
    pr.expectedPieces != null && ['Expected Pieces', String(pr.expectedPieces)],
    pr.expectedWeightKg != null && ['Expected Weight', `${pr.expectedWeightKg} KG`],
  ])

  return (
    <>
      <div className="pfp-overlay-scrim" onClick={back} />
      <aside className="pfp-overlay" role="dialog" aria-label={`Pickup request ${row.reference}`}>
        <header className="pfp-overlay-head">
          <button type="button" className="pfp-iconbtn" aria-label="Back" onClick={back}>
            <ArrowLeft size={16} />
          </button>
          <span className="pfp-overlay-title">{row.reference}</span>
          <StatusPill label={status.label} tone={status.tone} />
          {row.overdue && <span className="pfp-kindtag" data-tone="danger">Overdue</span>}
          {/* from the Pickup page the full request page (actions, handover) is one click away */}
          {basePath === '/local/pickup' && (
            <button type="button" className="pfp-btn" style={{ marginLeft: 'auto' }} onClick={() => nav(`/local/pickup/${pr.id}`)}>
              Open full page
            </button>
          )}
          <button type="button" className="pfp-iconbtn" aria-label="Close" style={basePath === '/local/pickup' ? undefined : { marginLeft: 'auto' }} onClick={back}>
            <Close size={16} />
          </button>
        </header>

        <div className="pfp-overlay-body">
          <nav className="pfp-overlay-rail" aria-label="Pickup request sections">
            {TABS.map((t, i) => {
              const Icon = TAB_ICONS[i]
              /* the count rides the tab, so you can see there is something to
                 look at before you open it */
              const badge = t === 'Orders' ? booked.length + pr.overages.length : undefined
              return (
                <button key={t} type="button" className="pfp-overlay-tab"
                  aria-selected={tab === i} onClick={() => setTab(i)}>
                  <Icon size={16} />{t}
                  {badge !== undefined && badge > 0 && (
                    <span className="pfp-tab-badge">{badge}</span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="pfp-overlay-pane">
            <div className="flex flex-col gap-3">

              {TABS[tab] === 'Summary' && (
                <>
                  {reserved && (
                    <p className="pfp-note">
                      Reserved booking — made before any order existed. The weight and piece count
                      are the merchant&rsquo;s estimate, not a sum over real orders.
                    </p>
                  )}
                  {/* the numbers a planner reads first */}
                  <div className="pfp-kpis">
                    <div><span>Planned Quantity</span><b>{reserved && !booked.length ? `~ ${planned}` : planned}</b></div>
                    <div><span>Actual Quantity</span><b>{actual ?? '—'}</b></div>
                    <button type="button" onClick={() => setTab(1)} disabled={!pr.overages.length}
                      title={pr.overages.length ? 'View the overage scans' : 'No overage scans'}>
                      <span>Shipment Overage</span><b>{pr.overages.length || '—'}</b>
                    </button>
                    <div><span>Weight</span><b>{weight}</b></div>
                    <div><span>Pallet Spaces</span><b>{pallets || '—'}</b></div>
                  </div>
                  <Section title="Details" pairs={[
                    ['Request Number', row.reference],
                    ['Status', <StatusPill key="s" label={status.label} tone={status.tone} />],
                    ['Type', prTypeLabel(pr)],
                    ['Merchant', row.merchant],
                    ['Service Type', services.join(', ') || '—'],
                    ['Shipment Category', categories.join(', ') || '—'],
                    ['Created At', stamp(pr.createdAt)],
                    ['Updated At', stamp(updatedAt)],
                    [`Consignment Number${consignmentNos.length === 1 ? '' : 's'} (${consignmentNos.length})`, numbers(consignmentNos), { wide: true }],
                    [`Package Number${packageNos.length === 1 ? '' : 's'} (${packageNos.length})`, numbers(packageNos), { wide: true }],
                  ]} />
                  <Section title="Collection" pairs={keep([
                    ['Pickup Point', row.shipFromName],
                    ['Pickup Window', `${stamp(row.pickupWindow.start)} – ${row.sameDayWindow ? stamp(row.pickupWindow.end).replace(/^.*?, \d{4}, /, '') : stamp(row.pickupWindow.end)}`],
                    ['Address', row.shipFromAddress, { wide: true }],
                    (pr.contactName || pr.contactNumber) && ['Contact', [pr.contactName, pr.contactNumber].filter(Boolean).join(' · ')],
                    row.instructions && ['Driver Instructions', row.instructions],
                  ])} />
                  <Section title="Execution" pairs={keep([
                    ['Carrier', pr.carrierName
                      ? `${pr.carrierName}${pr.carrierMode ? ` (${pr.carrierMode === 'CARRIER' ? '3PL' : 'Fleet'})` : ''}`
                      : '—'],
                    ['Assigned To Driver', dash(pr.driverName)],
                    ['Trip', pr.tripId
                      ? (
                        <button key="trip" type="button" className="pfp-order"
                          onClick={() => nav(`/local/control-tower/trips/${pr.tripId}`)}>
                          {pr.tripId}
                        </button>
                      )
                      : 'Not on a route'],
                    ['Attempt', `${pr.attempt} / ${pr.maxAttempts}`],
                    ['Handover', `${HANDOVER_MODE[pr.handover.mode]} · driver ${pr.handover.driverScanned.length}`
                      + ` · hub ${pr.handover.hubScanned.length}${pr.handover.closedAt ? ' · closed' : ''}`],
                    pr.handover.manifestRef && ['Manifest Ref', pr.handover.manifestRef],
                    pr.failureReason && ['Failure Reason', failureReasonLabel(pr.failureReason)],
                    pr.cancelReason && ['Cancel Reason', cancelReasonLabel(pr.cancelReason)],
                  ])} />
                  <Section title={ftl ? 'Ship To' : 'Destination'} pairs={keep([
                    [ftl ? 'Consignee' : 'Inbound Hub', row.shipToName],
                    pr.destinationCode && ['Facility Code', pr.destinationCode],
                    row.shipToAddress && ['Address', row.shipToAddress, { wide: true }],
                  ])} />
                  {loadPairs.length > 0 && <Section title="Load" pairs={loadPairs} />}
                </>
              )}

              {/* ONE handover, read end to end: what was booked, how it
                  reconciled, and what arrived with no record behind it */}
              {TABS[tab] === 'Orders' && (
                <>
                  {row.pickedVsBooked && (
                    <Section title="Reconciliation" pairs={[
                      ['Booked', String(summary.booked)],
                      ['Picked', String(summary.picked)],
                      ['Left behind', String(Math.max(0, summary.booked - summary.picked))],
                      ['Collected here only', String(extra.length)],
                      ['Overage scans', pr.overages.length > 0 ? String(pr.overages.length) : '—'],
                      ['Outcome', dash(prOutcomeWords(pr) || row.state)],
                    ]} />
                  )}

                  <div>
                    <h3 className="pfp-section-title">Booked orders ({booked.length})</h3>
                    {booked.length === 0 ? (
                      <p className="pfp-empty-note">
                        {reserved
                          ? 'Nothing attached yet — this booking was made before the orders existed.'
                          : 'Nothing is booked into this collection.'}
                      </p>
                    ) : (
                      <ul className="pfp-orderlist">
                        {booked.map((o) => {
                          const picked = pr.pickedOrderIds.includes(o.id)
                          return (
                            <li key={o.id}>
                              {orderLink(o.id, o.orderNumber)}
                              <span className="pfp-orderlist-to">{o.receiver.name}</span>
                              <span className="pfp-kindtag" data-tone={picked ? 'ok' : undefined}>
                                {picked ? 'Picked' : 'Not picked'}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  {extra.length > 0 && (
                    <div>
                      <h3 className="pfp-section-title">Collected here only ({extra.length})</h3>
                      <p className="pfp-empty-note">
                        Booked under another request and handed over here. An order can have two
                        parents — which is exactly why the list is flat and not a tree.
                      </p>
                      <ul className="pfp-orderlist">
                        {extra.map((id) => {
                          const o = byId.get(id)
                          return (
                            <li key={id}>
                              {o ? orderLink(o.id, o.orderNumber) : <span className="pfp-orderlist-num">{id}</span>}
                              <span className="pfp-orderlist-to">{o?.receiver.name ?? ''}</span>
                              <span className="pfp-kindtag" data-tone="warn">Picked here</span>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="pfp-section-title">Overages ({pr.overages.length})</h3>
                    {pr.overages.length === 0 ? (
                      <p className="pfp-empty-note">
                        Every barcode scanned at the handover matched an order in the system.
                      </p>
                    ) : (
                      <>
                        <p className="pfp-empty-note">
                          Scanned and matched no order. Each is a missing record, not a number — it
                          stays here until someone creates the order it belongs to.
                        </p>
                        <ul className="pfp-orderlist">
                          {pr.overages.map((ov) => (
                            <li key={ov.id}>
                              <span className="pfp-orderlist-num">{ov.barcode}</span>
                              <span className="pfp-orderlist-to">
                                {ov.note || (ov.weightKg != null ? `${ov.weightKg} kg` : '—')}
                              </span>
                              <span className="pfp-kindtag" data-tone={ov.orderId ? 'ok' : 'danger'}>
                                {ov.orderId ? 'Resolved' : 'Unresolved'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </>
              )}

              {TABS[tab] === 'Events' && <Events pr={pr} />}
            </div>
          </div>
        </div>
      </aside>

    </>
  )
}

/* ------------------------------------------------------------------ bits --- */

/**
 * The booking's progress, drawn as the merchant portal draws it: the WHOLE
 * status flow as a stepper, reached steps filled and joined, the rest waiting.
 *
 * A flat log of what happened cannot show what has NOT happened yet, which on a
 * collection is usually the thing you opened the drawer to find out. Several
 * events can share one status — attaching, removing and rescheduling all stamp
 * the state the request is already in — so a step keeps the FIRST time it was
 * reached and gathers every note written against it.
 *
 * The two terminal exits, Pickup Failed and Cancelled, are hidden unless the
 * booking actually reached one; showing them as pending steps would read as a
 * plan to fail.
 */
function Events({ pr }: { pr: GrowPickupRequest }) {
  const seen = new Map<PickupRequestStatus, { at: string; notes: string[] }>()
  pr.statusHistory.forEach((e: { status: PickupRequestStatus; at: string; note?: string }) => {
    const row = seen.get(e.status)
    if (row) { if (e.note) row.notes.push(e.note) } else seen.set(e.status, { at: e.at, notes: e.note ? [e.note] : [] })
  })
  const isExit = (s: PickupRequestStatus) => s === 'Pickup Failed' || s === 'Cancelled'
  const steps = PR_STATUSES.filter((s) => !isExit(s) || seen.has(s))
  const reached = steps.reduce((n, s, i) => (seen.has(s) ? i : n), -1)

  return (
    <ol className="pfp-events">
      {steps.map((label, i) => {
        const at = seen.get(label)
        const last = i === steps.length - 1
        return (
          <li key={label}>
            <span className="pfp-events-rail">
              <span className="pfp-events-dot" data-done={!!at || undefined} />
              {!last && <span className="pfp-events-line" data-done={i < reached || undefined} />}
            </span>
            <span className="pfp-events-body" data-last={last || undefined}>
              <span className="pfp-events-label" data-done={!!at || undefined}>{label}</span>
              {at && <span className="pfp-events-at">{fmtDateTime(at.at)}</span>}
              {at?.notes.map((n, k) => <span key={k} className="pfp-events-note">{n}</span>)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
