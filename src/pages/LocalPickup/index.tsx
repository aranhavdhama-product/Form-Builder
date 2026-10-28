/**
 * Pickup Requests — LOCAL console (`/local/pickup`), rebuilt on the growOrders
 * store (spec 2026-09-23 §3.2). Same grammar as `/local/consignments`: tabs with
 * counts, one filter row (date range · Status · Merchant · Advanced · Clear ·
 * search · icons), a selectable DataTable whose selection surfaces the bulk
 * actions, row click = the request's own page.
 *
 * Tabs (owner, 2026-10-05): Exception · Active · Closed · All — no "Eligible consignments" tab any more.
 * Waiting consignments are booked from **Create pickup ▾ → Pickup request** (createPickup.tsx; the same
 * menu sits on Pending For Planning) or Consignment Order → Schedule Pickup.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Ban, CalendarClock, CircleAlert, CircleCheck, ClipboardCheck, Download, Merge, PackageCheck, PackagePlus,
  Printer, RotateCcw, Route as RouteIcon, Send, Settings2, Split, Truck, Layers, XCircle, Zap
} from 'lucide-react'
import {
  DataTable, EmptyState, PageHeader,
  PageSize, Pagination, Panel, StatusPill, type SelectionAction,
} from '../../nueva/components'
import {
  ClearFilters, DateRange, FilterLine, FilterMultiSelect, FunnelFilters, IconBtn, LocalPage, LocalTabs, SearchBox,
} from '../../local/chrome'
import { toast } from '../../nueva/toast'
import { pickupRequestById, useGrowOrders } from '../../growOrders/store'
import { useSchedules, ymd } from '../../growOrders/scheduleModel'
import { useNow } from '../../local/useNow'
import type { GrowPickupRequest } from '../../growOrders/types'
import {
  ATTENTION_REQUIRED, CONSIGNMENTS_TO_BOOK, LOCAL_PR_TAB_SLUG, inLocalPrTab, localPrTabCounts,
  localPrTabFromSlug, type LocalPrTab,
} from '../../growOrders/tabs'
import { pickupPagesVisible, usePickupModuleConfig } from '../../config/pickupModule'
import { autoPickupSummary } from '../../growOrders/pickupSlots'
import { downloadCsv } from '../LocalPFP/adapter'
import { CreatePickupButton, CreatePickupDialogs, type CreatePickupKind } from './createPickup'
import type { PrAction } from '../../growOrders/prActions'
import { PrActionDialogs } from './prSelectionActions'
import { prSelectionItems, type PrDialog } from './prSelectionItems'
import ViewPickup from '../LocalPFP/ViewPickup'
import PickupRequestDetail from './PickupRequestDetail'
import { OverageDialog } from './overageDialog'
import {
  categoriesOfPr, dropLabel, duplicateIds, matchesStatus, merchantOfPr, ordersOf, pickupPointName, prCsv, PR_COLUMN_DEFS, PR_DEFAULT_COLUMN_KEYS,
  prTypeLabel, reasonText, statusLabel, statusTags, STATUS_FILTER_OPTIONS,
} from './prModel'
import { usePrGridColumns } from './prColumns'
import { usePickupColumns } from './pickupColumnConfig'

/** Display order of the tabs (owner, 2026-09-25: the queue that needs a hand first, All fourth); slugs and counts
    come from tabs.ts. 2026-10-05 (owner): no Eligible consignments tab here — consignments are booked from Consignment
    Order (Schedule Pickup) and Pending For Planning; an old `?tab=eligible` link lands on Exception. */
/* owner, 2026-10-21: no All tab on the console Pickup page (an old ?tab=all lands on Exception) */
const TAB_ORDER: LocalPrTab[] = [ATTENTION_REQUIRED, 'Active', 'Closed']
const ICON_OF: Record<LocalPrTab, typeof Layers> = {
  All: Layers, Active: Truck, Closed: CircleCheck, [ATTENTION_REQUIRED]: CircleAlert, [CONSIGNMENTS_TO_BOOK]: PackagePlus,
}
const TAB_ICONS = TAB_ORDER.map((t) => ICON_OF[t])
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort()
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

type Dialog =
  | { kind: 'create'; what: CreatePickupKind }
  | PrDialog
  | null

/** the Pickup page's glyph per pickup-request action (the menu itself is shared) */
const PR_ACTION_ICON: Partial<Record<PrAction, React.ReactNode>> = {
  raise: <Send size={14} />, planCollection: <RouteIcon size={14} />, addToRoute: <RouteIcon size={14} />, assignCarrier: <Truck size={14} />,
  switchToFleet: <Truck size={14} />, reschedule: <CalendarClock size={14} />, addConsignments: <PackagePlus size={14} />,
  split: <Split size={14} />, confirmSlot: <CircleCheck size={14} />, reattempt: <RotateCcw size={14} />,
  markPickedUp: <PackageCheck size={14} />, markFailed: <CircleAlert size={14} />, closeHandover: <ClipboardCheck size={14} />,
  merge: <Merge size={14} />, printLabel: <Printer size={14} />, cancel: <XCircle size={14} />, downloadCsv: <Download size={14} />,
}

/** The module-disabled state keeps the header, so the page still says where you are. */
function Disabled({ auto = false }: { auto?: boolean }) {
  return (
    <div className="p-6">
      <PageHeader title="Pickup Requests" />
      <Panel>
        <EmptyState icon={<Ban size={40} />}
          title={auto ? 'Pickups are raised automatically' : 'Pickup module is disabled for this account'}
          hint={auto
            ? 'In auto mode the module raises every pickup request itself; there is no pickup page. Switch to manual pickup requests to book and manage them here.'
            : 'Existing pickup requests stay readable from their links. Turn the Pickup Request module on to book and manage pickups.'} />
        <div className="-mt-12 pb-10 text-center">
          <Link to="/local/settings/pickup" className="text-[13px] font-bold text-brand-500 hover:text-brand-600">
            Open Pickup settings →
          </Link>
        </div>
      </Panel>
    </div>
  )
}

export default function LocalPickup() {
  const cfg = usePickupModuleConfig()
  /* owner, 2026-09-24: the page exists only in MANUAL mode */
  const { id } = useParams()
  const nav = useNavigate()
  /* a request stays READABLE from its link with the page hidden (scenario 23) */
  if (!pickupPagesVisible(cfg)) return <>
    <Disabled auto={cfg.enabled} />
    {id && <PickupRequestDetail id={id} onClose={() => nav('/local/pickup')} />}
  </>
  return <PickupRequestsList />
}

function PickupRequestsList() {
  const nav = useNavigate()
  const db = useGrowOrders()
  const schedules = useSchedules()
  const cfg = usePickupModuleConfig()
  const [params, setParams] = useSearchParams()
  /* `/local/pickup/view/:prId` = the list with the request's drawer over it —
     the same drawer Pending For Planning's Pickups tab opens */
  const { prId: drawerPrId, id: requestId } = useParams()
  const wantedTab: LocalPrTab = localPrTabFromSlug(params.get('tab'))
  const tab: LocalPrTab = TAB_ORDER.includes(wantedTab) ? wantedTab : ATTENTION_REQUIRED

  const [q, setQ] = useState('')
  /* owner, 2026-10-22: the Pickup page filters are Pickup Planning date · Hubs · Merchant — the PFP filter controls */
  /* owner, 2026-10-22 (the column sheet): FILTER = Pickup Window (date) · State · Destination Hub, and in the funnel
     Exception · Type · Shipment Category · Service Type · Carrier; SEARCH = Reference and Merchant only */
  const [states, setStates] = useState<string[]>([])
  const [hubs, setHubs] = useState<string[]>([])
  const [more, setMore] = useState<Record<string, string[]>>({})
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [overageOf, setOverageOf] = useState<GrowPickupRequest | null>(null)

  /* read the clock on every render — Overdue and the tab buckets move with it */
  const now = useNow()
  const byId = useMemo(() => new Map(db.orders.map((o) => [o.id, o])), [db.orders])
  const counts = localPrTabCounts(db.pickupRequests, 0, now)
  const dup = useMemo(() => duplicateIds(db.pickupRequests), [db.pickupRequests])
  /* what needs attention on a request — the same derivation the Exception tab uses */
  const exceptionsOf = (p: GrowPickupRequest) => statusTags(p, dup, now, pickupRequestById)
  const allPrs = useMemo(() => [...db.pickupRequests].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [db.pickupRequests])

  /* ---------------------------------------------- column configuration --- */
  /* Settings › Pickup columns (owner, 2026-10-23): which columns show and in what order, which are filters (date · State ·
     Destination Hub on the line, the rest in the funnel) and which the search box matches — saved for everyone */
  const colCfg = usePickupColumns()
  const cfgOf = (key: string) => colCfg.find((c) => c.key === key)
  const filterOn = (key: string) => !!cfgOf(key)?.filter
  /* the Exception column's reasons and flags, without their changing tails ("Late — window opened 17:00" → "Late") */
  const exceptionKinds = (p: GrowPickupRequest) => [reasonText(p), ...exceptionsOf(p).map((t) => t.label)]
    .filter(Boolean).map((x) => x.split(' — ')[0].split(' · ')[0])
  /* each column's value(s) on a request — what a filter offers and what the search box reads */
  const valuesOf: Record<string, (p: GrowPickupRequest) => string[]> = {
    reference: (p) => [p.number],
    exception: exceptionKinds,
    type: (p) => [prTypeLabel(p)],
    merchant: (p) => [merchantOfPr(p, db.stores)],
    address: (p) => [pickupPointName(p, db.stores)],
    hub: (p) => [dropLabel(p, db.stores)],
    carrier: (p) => (p.carrierName ? [p.carrierName] : []),
    rider: (p) => (p.driverName ? [p.driverName] : []),
    category: (p) => categoriesOfPr(p, byId),
    service: (p) => [...new Set(ordersOf(p, byId).map((o) => o.serviceType).filter(Boolean))],
    vehicle: (p) => (p.vehicleType ? [p.vehicleType] : []),
  }
  const ON_LINE = new Set(['window', 'status', 'hub'])
  const moreDefs = colCfg.filter((c) => c.filter && !ON_LINE.has(c.key) && valuesOf[c.key])
    .map((c) => ({ key: c.key, label: c.label, options: uniq(allPrs.flatMap(valuesOf[c.key])) }))
  const searched = colCfg.filter((c) => c.search && valuesOf[c.key])
  const searchHint = `Search ${searched.map((c) => (c.key === 'reference' ? 'reference' : c.label.toLowerCase())).join(', ').replace(/, ([^,]*)$/, ' or $1')}`
  /* the hub each request drops at (its routing hub) */
  const hubOptions = useMemo(() => uniq(allPrs.map((p) => dropLabel(p, db.stores))), [allPrs, db.stores])

  const filtersOn = !!(q || states.length || hubs.length || from || to || Object.values(more).some((v) => v.length))
  const clearAll = () => { setQ(''); setStates([]); setHubs([]); setMore({}); setFrom(''); setTo(''); setPage(1) }
  const setTab = (i: number) => {
    const next = new URLSearchParams(params); next.set('tab', LOCAL_PR_TAB_SLUG[TAB_ORDER[i]])
    setParams(next, { replace: true }); setPage(1)
  }

  const prRows = (() => {
    const needle = q.trim().toLowerCase()
    return allPrs.filter((p) => {
      if (!inLocalPrTab(p, tab, now, pickupRequestById)) return false
      /* a filter switched off in the configuration no longer filters, even if it was set before */
      if (filterOn('status') && states.length && !states.some((st) => matchesStatus(p, st))) return false
      if (filterOn('hub') && hubs.length && !hubs.includes(dropLabel(p, db.stores))) return false
      for (const [k, want] of Object.entries(more)) {
        if (want.length && filterOn(k) && valuesOf[k] && !valuesOf[k](p).some((v) => want.includes(v))) return false
      }
      /* Pickup Planning date = the day the pickup is planned for */
      if (filterOn('window') && from && p.date < from) return false
      if (filterOn('window') && to && p.date > to) return false
      /* the search box reads the columns with Search on */
      if (needle && !searched.some((c) => valuesOf[c.key](p).some((v) => v.toLowerCase().includes(needle)))) return false
      return true
    })
  })()

  const total = prRows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const slice = <T,>(xs: T[]) => xs.slice((safePage - 1) * pageSize, safePage * pageSize)

  const exportAll = () => {
    downloadCsv('pickup-requests.csv', prCsv(prRows, db))
    toast.success(`${plural(total, 'row')} exported.`)
  }

  /* -------------------------------------------------------------- columns -- */

  /* owner, 2026-09-25: one value per cell, single-line rows — the shared
     pickup grid (prModel.PR_COLUMN_DEFS), same as Grow's Pickup Requests */
  const prGrid = usePrGridColumns({
    storageKey: 'local-pickup-columns-v5', defaults: PR_DEFAULT_COLUMN_KEYS, fixed: true,
    /* the configured set, in the configured order */
    defs: colCfg.filter((c) => c.show).map((c) => PR_COLUMN_DEFS.find((d) => d.key === c.key)).filter((d): d is NonNullable<typeof d> => !!d),
    ctx: { stores: db.stores, byId, flagsOf: exceptionsOf },
    cells: {
      /* ONE state per cell (owner, 2026-10-23) — no route tag beside it */
      status: (p) => { const s = statusLabel(p); return <StatusPill label={s.label} tone={s.tone} /> },
      /* owner, 2026-10-22: the overage count opens the scans' details */
      overage: (p) => (p.overages.length
        ? <button type="button" className="font-bold text-brand-500 hover:underline" title="View the overage scans"
          onClick={(e) => { e.stopPropagation(); setOverageOf(p) }}>{p.overages.length} · View</button>
        : <span className="text-ink-3">—</span>),
    },
  })

  /* -------------------------------------------------------------- actions -- */

  /* the ONE pickup-request selection menu (prSelectionActions.tsx), shared
     with Pending for Planning; every item gated by growOrders/prActions.ts */
  const prActions = (sel: GrowPickupRequest[], clear: () => void): SelectionAction[] =>
    prSelectionItems(sel, { cfg, db, openDialog: setDialog, clear }).map((it) => ({
      label: it.label, icon: PR_ACTION_ICON[it.id], disabled: it.disabled, reason: it.reason, onClick: it.onClick,
    }))

  const close = () => setDialog(null)

  return (
    <LocalPage>
      {/* no page header: the app bar already names the page. The owner-
          finalised local chrome (spec §11): tabs on the canvas, the page's
          actions on the strip's right, then ONE filter line */}
      <LocalTabs
        tabs={TAB_ORDER.map((t, i) => ({ id: t, label: t, count: counts[t], icon: TAB_ICONS[i] }))}
        active={tab} onChange={(id) => setTab(TAB_ORDER.indexOf(id as LocalPrTab))}
        right={<>
          {/* the daily roster job failed, or has not run today (FR-03.4) — red, where dispatchers work */}
          {(schedules.lastRun?.status === 'Failed' || (schedules.schedules.some((x) => x.status === 'Active') && schedules.lastDailyDate !== ymd(now))) && (
            <button type="button" onClick={() => nav('/local/settings/merchant-master')} title={schedules.lastRun?.status === 'Failed' ? schedules.lastRun.message : 'Pickup requests for today have not been made yet'}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-danger-bg px-2.5 text-[12px] font-bold text-danger-fg">
              <CircleAlert size={13} />{schedules.lastRun?.status === 'Failed' ? 'Schedule run failed' : "Today's schedules not run"}
            </button>
          )}
          {/* owner, 2026-10-21: no Merchant master button and no settings icon here — both live under Settings */}
          {cfg.mode === 'auto'
            ? <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-info-bg bg-info-bg px-2.5 text-[12px] text-ink" title="Pickup requests are raised automatically when a consignment is created — Settings → Pickup Request.">
                <Zap size={13} className="text-brand-500" />{autoPickupSummary(cfg)}
              </span>
            /* owner, 2026-10-21: ONE button, Pickup request (waiting consignments); no Blind pickup on this page */
            : <CreatePickupButton onPick={(what) => setDialog({ kind: 'create', what })} />}
        </>} />
      <FilterLine
        right={<>
          {searched.length > 0 && <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder={searchHint} />}
          {/* the ⚙ opens the column configuration (saved for everyone) — SED-14762 */}
          <IconBtn title="Column configuration — columns, filters and search" onClick={() => nav('/local/columns/pickup')}><Settings2 size={16} /></IconBtn>
          <IconBtn title="Download filtered rows (CSV)" onClick={exportAll}><Download size={16} /></IconBtn>
        </>}>
        {/* calendar mode — the same box as PFP's, and it opens a calendar (owner, 2026-10-22: "calendar is not opening") */}
        {filterOn('window') && (
          <DateRange placeholders={['Pickup Planning date', 'End date']} start={from} end={to}
            onStart={(v) => { setFrom(v); setPage(1) }} onEnd={(v) => { setTo(v); setPage(1) }} />
        )}
        {filterOn('status') && <FilterMultiSelect values={states} placeholder="State" options={STATUS_FILTER_OPTIONS} width={190} onChange={(v) => { setStates(v); setPage(1) }} />}
        {filterOn('hub') && <FilterMultiSelect values={hubs} placeholder="Destination Hub" options={hubOptions} width={200} onChange={(v) => { setHubs(v); setPage(1) }} />}
        {moreDefs.length > 0 && <FunnelFilters defs={moreDefs} values={more} onChange={(k, vals) => { setMore((m) => ({ ...m, [k]: vals })); setPage(1) }} />}
        <ClearFilters active={filtersOn} onClick={clearAll} />
      </FilterLine>

      <div className="mt-4">
        {total === 0 ? (
          <Panel>
            <EmptyState
              title={filtersOn ? 'Nothing matches these filters' : tab === ATTENTION_REQUIRED ? 'No exceptions' : `No pickup requests under ${tab}`}
              hint={filtersOn ? 'Clear the filters to see the whole list again.' : tab === ATTENTION_REQUIRED ? undefined : 'Use Pickup request to book one.'} />
          </Panel>
        ) : (
          <>
            <DataTable key={`prs-${tab}`} columns={prGrid.columns} rows={slice(prRows)} rowKey="id" selectable
              selectionActions={(s, clear) => prActions(s as GrowPickupRequest[], clear)}
              onRowClick={(r) => nav(`/local/pickup/${(r as GrowPickupRequest).id}?${params.toString()}`)} />
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <Pagination page={safePage} total={totalPages} onChange={setPage}
                  range={`${(safePage - 1) * pageSize + 1}-${Math.min(safePage * pageSize, total)} of ${total.toLocaleString()}`} />
              </div>
              <div className="pt-3"><PageSize value={pageSize} onChange={(n) => { setPageSize(n); setPage(1) }} /></div>
            </div>
          </>
        )}
      </div>

      {drawerPrId && <ViewPickup basePath="/local/pickup" />}
      {/* owner, 2026-09-25: the request opens as a slide-over over the list, URL `/local/pickup/:id` */}
      {requestId && <PickupRequestDetail id={requestId} onClose={() => nav(`/local/pickup?${params.toString()}`)} />}

      <CreatePickupDialogs kind={dialog?.kind === 'create' ? dialog.what : null} onClose={close}
        onCreated={(prs) => { if (prs.length === 1) nav(`/local/pickup/${prs[0].id}`) }} />
      <PrActionDialogs dialog={dialog && dialog.kind !== 'create' ? dialog : null} db={db} onClose={close} />
      {overageOf && <OverageDialog pr={overageOf} byId={byId} onClose={() => setOverageOf(null)} />}
    </LocalPage>
  )
}
