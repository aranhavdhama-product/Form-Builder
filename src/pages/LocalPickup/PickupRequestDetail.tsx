/**
 * One pickup request — LOCAL console (`/local/pickup/:id`, spec §3.2).
 *
 * PageHeader (number + outcome-aware status + chips, back to the list) with a
 * kebab of status-aware actions, over Panels: Summary · Pickup outcome (Booked ·
 * Picked · Not picked · Overage scans, flat — a shipment has two parents) · Handover (the four reconciliation
 * buckets, Close handover, a dev-only driver-scan simulator) on the left; Trip ·
 * Related · Timeline on the right. Everything reads the live store, so an
 * action re-renders the page in place.
 *
 * With the module disabled the request stays READABLE (scenario 23) — only the
 * actions are withheld.
 */
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileText, History, Info, PackageCheck, Plus, ScanBarcode, Send, Trash2 } from 'lucide-react'
import {
  Button, EmptyState, KebabMenu, Panel, SimpleTable, SlideOver, SlideOverSections, StatusPill, type MenuItem, type SlideOverSection,
} from '../../nueva/components'
import { toast } from '../../nueva/toast'
import { growOrderActions, useGrowOrders } from '../../growOrders/store'
import type { GrowOrder, GrowPickupRequest } from '../../growOrders/types'
import { handoverReconciled, isDraftPr, isPartiallyPicked, isPickupEligible } from '../../growOrders/tabs'
import { prActionState, type PrAction } from '../../growOrders/prActions'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { PICKUP_OUTCOME_LABEL, pickupOutcomeFor } from '../../growOrders/reasonPolicy'
import { NO_ORDERS_REASON } from '../../growOrders/pickupReasons'
import { planningActions, usePlanning } from '../LocalPFP/planningStore'
import { toConsignmentRow } from '../LocalPFP/adapter'
import { piecesOf, type PieceView } from '../LocalConsignments/viewModel'
import {
  AddConsignmentsDialog, AssignCarrierDialog, CloseHandoverDialog, ManualPickupDialog, ReasonDialog, RescheduleDialog,
} from './dialogs'
import { AddToRouteDialog } from '../LocalControlTower/addToRouteDialog'
import { SplitPickupDialog } from './bookingCards'
import {
  consignmentsLabel, dropLabel, duplicateIds, earliestFor, fmtStamp, fmtWindow, merchantOfPr, pickupPointAddress,
  pickupPointName, prTypeLabel, reasonText, referenceChips, statusLabel, statusTags, weightLabel, windowTag,
} from './prModel'

type DialogKind = 'add' | 'split' | 'reschedule' | 'cancel' | 'fail' | 'manual' | 'route' | 'carrier' | 'close' | null

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/* ------------------------------------------------------------------ bits ---- */

function Pairs({ pairs }: { pairs: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-3 gap-x-6 gap-y-3 px-5 pb-5 pt-2">
      {pairs.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] font-bold text-ink-3">{k}</dt>
          <dd className="mt-0.5 break-words text-[13px] text-ink">{v === '' || v == null ? '—' : v}</dd>
        </div>
      ))}
    </dl>
  )
}


/* ------------------------------------------------------------- the page ---- */

/**
 * The request as a SLIDE-OVER over the Pickup list (owner, 2026-09-25: "do not
 * show pickup request as page — show as slide-over"). `/local/pickup/:id` mounts
 * the list, which hosts this; `onClose` returns to the list (its tab kept).
 */
export default function PickupRequestDetail({ id: idProp, onClose }: { id?: string; onClose?: () => void } = {}) {
  const params = useParams()
  const id = idProp ?? params.id
  const nav = useNavigate()
  const db = useGrowOrders()
  /* the record id is canonical; a PR number (`PR-000115`) resolves too, as a courtesy */
  const pr = db.pickupRequests.find((p) => p.id === id)
    ?? db.pickupRequests.find((p) => p.number.toLowerCase() === (id ?? '').toLowerCase())
  const back = onClose ?? (() => nav('/local/pickup'))

  if (!pr) {
    return (
      <SlideOver title="Pickup Request" onClose={back}>
        <div className="p-6"><Panel><EmptyState title="This pickup request does not exist" hint="It may have been removed, or the link is from another browser's data." /></Panel></div>
      </SlideOver>
    )
  }
  return <Detail key={pr.id} pr={pr} back={back} />
}

function Detail({ pr, back }: { pr: GrowPickupRequest; back: () => void }) {
  const nav = useNavigate()
  const db = useGrowOrders()
  usePlanning()   // re-render when its trip changes (the On route tag)
  const cfg = usePickupModuleConfig()
  const [dialog, setDialog] = useState<DialogKind>(null)
  const close = () => setDialog(null)

  const byId = new Map(db.orders.map((o) => [o.id, o]))
  const prById = new Map(db.pickupRequests.map((p) => [p.id, p]))
  const s = statusLabel(pr)
  const tags = statusTags(pr, duplicateIds(db.pickupRequests), new Date(), (i) => prById.get(i))
  const attempted = pr.status === 'Pickedup' || pr.status === 'Pickup Failed'
  const on = cfg.enabled

  /* scenario 13: a partial pickup released what it left behind — book exactly
     those (still waiting for a pickup) on a new request, at the earliest window */
  const remainder = isPartiallyPicked(pr)
    ? pr.orderIds.filter((i) => !pr.pickedOrderIds.includes(i)).filter((i) => { const o = byId.get(i); return !!o && isPickupEligible(o) })
    : []
  const reattemptRemainder = () => {
    const merchant = merchantOfPr(pr, db.stores)
    const w = earliestFor(merchant)
    const made = growOrderActions.createPickupRequest({
      storeCode: pr.storeCode, destinationCode: pr.destinationCode, orderIds: remainder, source: 'Console',
      merchantCode: merchant, instructions: `Remainder of ${pr.number}`, startAt: w.startAt, endAt: w.endAt,
    })
    if (!made) { toast.error('Nothing to re-attempt — the remaining shipments have validation errors.'); return }
    toast.success(made.merged
      ? `${plural(remainder.length, 'shipment')} added to ${made.number} (open request at this pickup point).`
      : `${plural(remainder.length, 'shipment')} booked on ${made.number} — ${fmtWindow(made)}.`)
    nav(`/local/pickup/${made.id}`)
  }

  /* ------------------------------------------------------------ actions -- */
  /* every action asks the ONE matrix (growOrders/prActions.ts) and shows DISABLED
     with its reason when the request's status does not allow it; only the items
     that do not apply to this kind of request at all (3PL-only, trip-only,
     partial-pick-only) are left out */
  const gate = (a: PrAction) => prActionState(a, pr, { cfg, role: 'ops', byId: (i: string) => prById.get(i) })
  const act = (a: PrAction, label: string, onClick: () => void, tone?: 'danger'): MenuItem => {
    const g = gate(a)
    return { label, onClick, tone, disabled: !g.enabled, reason: g.reason }
  }
  const threePl = pr.carrierMode === 'CARRIER'
  const raise = () => { if (growOrderActions.raisePickupRequest(pr.id)) toast.success(`${pr.number} raised — now Pickup Requested.`) }
  const maybe: (MenuItem | false | null | '')[] = !on ? [] : [
    isDraftPr(pr.status) && act('raise', 'Raise pickup request', raise),
    act('addConsignments', 'Add shipments', () => setDialog('add')),
    act('reschedule', 'Reschedule', () => setDialog('reschedule')),
    act('split', 'Split pickup request', () => setDialog('split')),
    !threePl && (pr.tripId
      ? act('moveRoute', 'Move to another route', () => setDialog('route'))
      : act('addToRoute', 'Add to route', () => setDialog('route'))),
    !!pr.tripId && act('removeFromRoute', 'Remove from route', () => {
      const stay = planningActions.removeStopFromTrip(pr.tripId!, pr.id)
      if (stay) { toast.error(stay); return }
      toast.success(`${pr.number} removed from ${pr.tripId}.`)
    }),
    threePl
      ? act('switchToFleet', 'Switch to fleet', () => {
        growOrderActions.clearCarrier(pr.id)
        toast.info(`${pr.number} taken back from the carrier — add it to a route.`)
      })
      : act('assignCarrier', 'Assign carrier', () => setDialog('carrier')),
    act('markPickedUp', 'Mark Manually Picked Up', () => setDialog('manual')),
    remainder.length > 0 && act('reattemptRemainder', `Re-attempt remainder (${remainder.length})`, reattemptRemainder),
    act('reattempt', 'Re-attempt now', () => {
      const clone = growOrderActions.reattemptPickupRequest(pr.id)
      if (clone) { toast.success(`Re-attempt ${clone.attempt} of ${clone.maxAttempts} raised as ${clone.number}.`); nav(`/local/pickup/${clone.id}`) }
      else toast.error('This pickup cannot be re-attempted.')
    }),
    threePl && act('printManifest', 'Print manifest', () => {
      /* H4 — a 3PL collection's manifest carries a reference the carrier accepts against */
      const ref = growOrderActions.printManifest(pr.id)
      if (ref) toast.success(`Manifest ${ref} printed for ${pr.number} (${plural(pr.orderIds.length, 'shipment')}).`)
    }),
    act('printLabel', 'Print consolidated label', () => toast.info(`Print Consolidated Label — ${pr.number} (demo)`)),
    threePl && act('carrierAccepted', 'Carrier accepted', () => {
      if (growOrderActions.carrierAccepted(pr.id)) toast.success(`${pr.carrierName ?? 'Carrier'} accepted the manifest — ${pr.number} handed over.`)
      else toast.error(`${pr.number} has nothing to hand over — it fails as "No orders to collect".`)
    }),
    act('closeHandover', 'Close handover', () => setDialog('close')),
    act('markFailed', 'Mark Pickup Failed', () => setDialog('fail'), 'danger'),
    act('cancel', 'Cancel pickup', () => setDialog('cancel'), 'danger'),
  ]
  const items = maybe.filter((x): x is MenuItem => !!x)

  /* ------------------------------------------------------- consignments -- */
  const booked = pr.orderIds.map((i) => byId.get(i)).filter((o): o is GrowOrder => !!o)
  const extras = db.orders.filter((o) => o.pickedInRequestId === pr.id && !pr.orderIds.includes(o.id))
  const picked = new Set(pr.pickedOrderIds)
  const pickedRows = [...booked.filter((o) => picked.has(o.id)), ...extras.filter((o) => picked.has(o.id))]
  const notPickedRows = attempted ? booked.filter((o) => !picked.has(o.id)) : []
  const numberOf = (id: string) => prById.get(id)?.number ?? id
  const dScan = new Set(pr.handover.driverScanned)
  const dev = import.meta.env.DEV
  const canScan = pr.status !== 'Cancelled' && pr.status !== 'Pickup Failed'

  /* the parent that is NOT this request, in words — "booked under" when it was
     booked elsewhere, "picked in →" when another request collected it */
  const markers = (o: GrowOrder): ReactNode[] => {
    const out: ReactNode[] = []
    if (o.pickupRequestId && o.pickupRequestId !== pr.id) out.push(<span key="b">booked under {numberOf(o.pickupRequestId)}</span>)
    if (o.pickedInRequestId && o.pickedInRequestId !== pr.id) {
      out.push(
        <Link key="p" to={`/local/pickup/${o.pickedInRequestId}`} onClick={(e) => e.stopPropagation()}
          className="font-bold text-brand-500 hover:text-brand-600">picked in {numberOf(o.pickedInRequestId)} →</Link>,
      )
    }
    return out
  }

  /* ONE table (owner, 2026-10-22: "make columns and status will come in it, no need for separate sections"): every
     consignment booked here, every one picked here though booked elsewhere, then the overage scans — the Status column
     says which */
  const outcomeRows = [...booked, ...extras.filter((o) => picked.has(o.id))]
  /* owner, 2026-10-23: a plain table, one row per PACKAGE with its consignment beside it — no nesting — and the package's
     own details, exactly as the consignment page lists them (LocalConsignments/viewModel.piecesOf). The consignment's
     remove / scan actions sit on its first package row only */
  type PkgRow = PieceView & { o: GrowOrder; first: boolean }
  const pkgRows: PkgRow[] = outcomeRows.flatMap((o) => piecesOf(toConsignmentRow(o, db), o).map((pc, i) => ({ ...pc, o, first: i === 0 })))
  const packageCount = pkgRows.length
  const nowrap = (v: ReactNode) => <span className="whitespace-nowrap">{v}</span>
  const outcomeTable = (rows: PkgRow[]) => (
    <SimpleTable<PkgRow> rows={rows} rowKey={(r) => r.id}
      onRowClick={(r) => nav(`/local/consignments/${r.o.id}`)}
      columns={[
        /* the PACKAGE's own number (`<consignment>-P<n>`) — a consignment's carrier tracking number is one for all its packages */
        /* headers wrap to at most TWO lines (owner, 2026-10-23): a non-breaking space binds the words that must stay together */
        { label: 'Package\u00a0Tracking Number', render: (r) => <span className="whitespace-nowrap font-mono text-[12px] font-bold text-ink">{r.id}</span> },
        { label: 'Consignment Number', render: ({ o }) => {
          const m = markers(o)
          return (
            <span className="flex flex-wrap items-baseline gap-x-2">
              <Link to={`/local/consignments/${o.id}`} onClick={(e) => e.stopPropagation()}
                className="whitespace-nowrap font-mono text-[12px] font-bold text-brand-500 hover:text-brand-600">{o.orderNumber}</Link>
              {m.length > 0 && <span className="text-[12px] text-ink-3">{m.map((x, i) => <span key={i}>{i > 0 && ' · '}{x}</span>)}</span>}
            </span>
          )
        } },
        { label: 'State', render: (r) => nowrap(r.state) },
        { label: 'Product Name', render: (r) => nowrap(r.productName) },
        { label: 'SKU Code', render: (r) => <span className="whitespace-nowrap font-mono text-[12px]">{r.skuCode}</span> },
        { label: 'SKU Description', render: (r) => <span className="block max-w-[220px] truncate" title={r.skuDescription}>{r.skuDescription}</span> },
        { label: 'SKU Quantity', align: 'right', render: (r) => r.skuQuantity },
        { label: 'Volume', align: 'right', render: (r) => nowrap(`${r.volumeMm3.toLocaleString()} mm³`) },
        { label: 'Weight', align: 'right', render: (r) => nowrap(`${r.weightKg} kg`) },
        { label: 'Pallet Spaces', align: 'right', render: (r) => r.palletSpaces },
        { label: 'L\u00a0*\u00a0B\u00a0*\u00a0H', render: (r) => nowrap(r.dims) },
        { label: '', align: 'right', render: ({ o, first }) => (first ? (
          <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {dev && on && canScan && !dScan.has(o.id) && (
              <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink"
                title={`Simulate driver scan of ${o.orderNumber} (demo)`} aria-label={`Simulate driver scan for ${o.orderNumber}`}
                onClick={() => { growOrderActions.driverScan(pr.id, o.id); toast.info(`Driver scan simulated for ${o.orderNumber}.`) }}>
                <ScanBarcode size={15} />
              </button>
            )}
            {on && gate('removeConsignment').enabled && pr.orderIds.includes(o.id) && !picked.has(o.id) && (
              <button type="button" className="grid h-7 w-7 place-items-center rounded-md text-ink-3 hover:bg-danger-bg hover:text-danger-fg"
                title={`Remove consignment ${o.orderNumber} (all its packages) from this request`} aria-label={`Remove ${o.orderNumber}`}
                onClick={() => {
                  growOrderActions.detachOrderFromPickup(pr.id, o.id)
                  /* an order-backed request left with nothing to collect ends, as on Grow (a reserved one keeps its slot) */
                  if (!pr.blind && pr.orderIds.length === 1) {
                    growOrderActions.cancelPickupRequest(pr.id, `Last order removed (${o.orderNumber})`, 'Ops')
                    toast.success(`${o.orderNumber} removed — ${pr.number} had nothing left to collect and is cancelled.`)
                  } else toast.success(`${o.orderNumber} removed — it waits for a pickup again.`)
                }}>
                <Trash2 size={15} />
              </button>
            )}
          </span>
        ) : null) },
      ]} />
  )

  /* a failed request: what the Reason Master → Reason Policy decides for its reason (growOrders/reasonPolicy) */
  const policyLine = pr.status === 'Pickup Failed' && pr.failureReason && pr.failureReason !== NO_ORDERS_REASON
    ? PICKUP_OUTCOME_LABEL[pickupOutcomeFor(pr.failureReason, pr.attempt, pr.maxAttempts)] : null
  const reason = reasonText(pr)

  const sections: SlideOverSection[] = [
    { id: 'summary', label: 'Summary', icon: FileText, node: (
      <div className="flex flex-col gap-3">
  {!on && (
    <div className="rounded-md border border-line bg-warm-25 px-4 py-2.5 text-[13px] text-ink-2">
      The Pickup module is disabled for this account — this request stays readable, actions are withheld.{' '}
      <Link to="/local/settings/pickup" className="font-bold text-brand-500">Pickup settings</Link>
    </div>
  )}

  {/* auto pickup with `slotConfirmation`: the shipper confirms the slot before ops plans it */}
  {pr.slotConfirmed !== null && (
    <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-warm-25 px-4 py-2.5 text-[13px] text-ink-2">
      <span className="flex items-center gap-1.5">
        <Info size={14} className="shrink-0 text-ink-3" />
        {pr.slotConfirmed
          ? <>Slot confirmed — {fmtWindow(pr)}</>
          : <>Slot confirmation pending — the shipper has not yet confirmed {fmtWindow(pr)}.</>}
      </span>
      {on && gate('confirmSlot').enabled && (
        <Button size="sm" variant="outline"
          onClick={() => { if (growOrderActions.confirmPickupSlot(pr.id)) toast.success(`Pickup slot confirmed for ${pr.number}.`) }}>
          Confirm slot
        </Button>
      )}
    </div>
  )}
      <Panel title="Summary">
        <Pairs pairs={[
          ['Pickup window', <>{fmtWindow(pr)}{windowTag(pr) && <span className="text-ink-3"> · {windowTag(pr)}</span>}</>],
          ['Pickup address', <>{pickupPointName(pr, db.stores)}<span className="block text-[12px] text-ink-3">{pickupPointAddress(pr, db.stores)}</span></>],
          ['Drops at', dropLabel(pr, db.stores)],
          ['Merchant', merchantOfPr(pr, db.stores)],
          ['Contact', [pr.contactName, pr.contactNumber].filter(Boolean).join(' · ')],
          ['Type', prTypeLabel(pr)],
          ...(pr.shipmentType === 'FTL'
            ? [['Service / vehicle', [pr.ftlServiceType, pr.vehicleType && `${pr.vehicleUnit ?? 1} × ${pr.vehicleType}`].filter(Boolean).join(' · ')] as [string, ReactNode]]
            : pr.blind ? [['Expected', `${pr.expectedPieces ?? '?'} shipments${pr.sizeClass ? ` · ${pr.sizeClass}` : ''}`] as [string, ReactNode]] : []),
          ['Shipments', consignmentsLabel(pr)],
          ['Weight', weightLabel(pr, byId)],
          ['Source', pr.schedule ? `Schedule · ${pr.schedule.code} · run ${pr.schedule.runLabel}` : pr.source],
          ['Attempt', <>{pr.attempt} of {pr.maxAttempts}{policyLine && <span className="text-ink-3"> · Reason policy: <span className="font-bold text-ink-2">{policyLine}</span></span>}</>],
          ['Carrier', pr.carrierName ? `${pr.carrierName}${pr.carrierMode === 'CARRIER' ? ' (3PL)' : ' (own fleet)'}` : ''],
          ...(reason ? [[pr.status === 'Cancelled' ? 'Cancel reason' : 'Failure reason', reason] as [string, ReactNode]] : []),
          ...(pr.manualOverride ? [['Manual override', pr.manualOverride] as [string, ReactNode]] : []),
          ['Instructions', pr.instructions ?? ''],
          ['Created', fmtStamp(pr.createdAt)],
        ]} />
      </Panel>
      </div>
    ) },
    { id: 'outcome', label: 'Pickup outcome', icon: PackageCheck, node: (
      <Panel title="Pickup outcome">
        {/* one line of counts, Add shipments on the right */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pb-3 pt-1 text-[14px] text-ink-2">
          <span><b className="text-ink">{booked.length}</b> consignment{booked.length === 1 ? '' : 's'} booked</span>
          <span><b className="text-ink">{packageCount}</b> package{packageCount === 1 ? '' : 's'}</span>
          <span><b className="text-ink">{pickedRows.length}</b> picked</span>
          {attempted && <span><b className="text-ink">{notPickedRows.length}</b> not picked</span>}
          {pr.overages.length > 0 && <span><b className="text-ink">{pr.overages.length}</b> overage</span>}
          {on && gate('addConsignments').enabled && (
            <span className="ml-auto"><Button size="sm" variant="outline" icon={<Plus size={13} />} onClick={() => setDialog('add')}>Add shipments</Button></span>
          )}
        </div>
        {outcomeRows.length || pr.overages.length ? (<>
          {/* the package table is wide — it scrolls sideways inside its card, never the whole panel */}
          {pkgRows.length > 0 && <div className="max-w-full overflow-x-auto">{outcomeTable(pkgRows)}</div>}
          {pr.overages.length > 0 && (<div className="max-w-full overflow-x-auto">
            <SimpleTable<GrowPickupRequest['overages'][number]> rows={pr.overages} rowKey={(v) => v.id}
              columns={[
                { label: 'Overage scan', render: (v) => <span className="font-mono text-[12px] font-bold text-ink">{v.barcode}</span> },
                { label: 'Scanned at', render: (v) => fmtStamp(v.scannedAt) },
                { label: 'Weight', align: 'right', render: (v) => (v.weightKg != null ? `${v.weightKg.toFixed(1)} kg` : '—') },
                { label: 'Status', render: (v) => (v.orderId
                  ? <StatusPill label={`Overage · ${byId.get(v.orderId)?.orderNumber ?? v.orderId}`} tone="success" />
                  : <StatusPill label="Overage · no shipment yet" tone="danger" />) },
                { label: 'Note', render: (v) => v.note || '—' },
              ]} /></div>
          )}
        </>) : (
          <p className="px-5 pb-4 text-[14px] text-ink-3">
            {pr.blind ? 'Reserved — no consignments attached yet. Attach them with Add shipments.' : 'No consignments on this request.'}
          </p>
        )}
        <div className="h-3" />
      </Panel>
    ) },
    /* owner, 2026-10-23: no Trip and no Related sections — the trip shows as the "On route T…" tag beside the state, a
       re-attempt chain in the Exception column and the Timeline */
    { id: 'timeline', label: 'Timeline', icon: History, node: (
      <Panel title="Timeline">
        <ol className="flex flex-col px-5 pb-5 pt-1">
          {[...pr.statusHistory].reverse().map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative border-l border-line pb-3 pl-4 last:pb-0">
              <span className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ${i === 0 ? 'bg-brand-500' : 'bg-warm-300'}`} />
              <p className="text-[13px] font-bold text-ink">{e.status}</p>
              {e.note && <p className="text-[12px] text-ink-2">{e.note}</p>}
              <p className="text-[12px] text-ink-3">{fmtStamp(e.at)}</p>
            </li>
          ))}
        </ol>
      </Panel>
    ) },
  ]

  return (
    <SlideOver title={`Pickup Request ${pr.number}`} onClose={back}
      subtitle={`${merchantOfPr(pr, db.stores)} · ${pickupPointName(pr, db.stores)} → ${dropLabel(pr, db.stores)}`}
      actions={<>
        {referenceChips(pr).map((c) => <StatusPill key={c} label={c} tone={c.endsWith(' blind') ? 'info' : 'neutral'} />)}
        <StatusPill label={s.label} tone={s.tone} />
        {tags.map((t) => <StatusPill key={t.label} label={t.label} tone={t.tone} />)}
        {/* a draft's one next step, in plain sight (owner, 2026-10-22) */}
        {on && isDraftPr(pr.status) && (() => { const g = gate('raise'); return (
          <span title={g.enabled ? undefined : g.reason}><Button size="sm" icon={<Send size={13} />} disabled={!g.enabled} onClick={raise}>Raise pickup request</Button></span>
        ) })()}
        {items.length > 0 && <KebabMenu items={items} />}
      </>}>
      <SlideOverSections sections={sections} label="Pickup request sections" />
      {dialog === 'add' && <AddConsignmentsDialog pr={pr} onClose={close} onDone={close} />}
      {dialog === 'reschedule' && <RescheduleDialog prs={[pr]} onClose={close} onDone={close} />}
      {dialog === 'split' && <SplitPickupDialog pr={pr} merchantCode={merchantOfPr(pr, db.stores)} onClose={close} onDone={close} />}
      {(dialog === 'cancel' || dialog === 'fail') && <ReasonDialog kind={dialog} prs={[pr]} onClose={close} onDone={close} />}
      {dialog === 'manual' && <ManualPickupDialog pr={pr} onClose={close} onDone={close} />}
      {dialog === 'route' && <AddToRouteDialog prIds={[pr.id]} onClose={close} onDone={close} />}
      {dialog === 'carrier' && <AssignCarrierDialog prs={[pr]} onClose={close} onDone={close} />}
      {/* the Handover section is gone (owner, 2026-10-22); Close handover stays in the ⋮ menu */}
      {dialog === 'close' && <CloseHandoverDialog pr={pr} reconciled={handoverReconciled(pr)} onClose={close} onDone={close} />}
    </SlideOver>
  )
}
