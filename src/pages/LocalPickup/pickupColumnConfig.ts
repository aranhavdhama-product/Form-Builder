/**
 * Pickup column configuration (owner, 2026-10-23: "need column configuration … based on this for pickup pages").
 *
 * One row per Pickup-grid column (`prModel.PR_COLUMN_DEFS`), seeded from the owner's column sheet: whether it shows, and
 * whether it is a FILTER and / or SEARCHED. It drives the Pickup page (`/local/pickup`): the grid's order and columns,
 * the filter line (date · State · Destination Hub on the line, every other filter in the funnel) and what the search box
 * matches. Edited on `/local/columns/pickup` (Settings › Pickup columns, and the ⚙ on the Pickup page).
 *
 * `canFilter` / `canSearch` say what the page CAN do with a column — a number (counts, quantities, weight, pallets) is
 * neither a filter nor searched, Pickup Window's filter is the date range, Reference is searched and never hidden. A
 * toggle is offered only where the page acts on it.
 *
 * Saved for everyone: the key is in `LocalConsignments/formSync.SETUP_KEYS`.
 */
import { useEffect, useState } from 'react'
import { PR_COLUMN_DEFS } from './prModel'

export const PICKUP_COLUMN_CONFIG_KEY = 'pickup-column-config-v1'
const CHANGED = 'pickup-column-config-changed'

export interface PickupColumnSpec {
  key: string
  description: string
  /** the sheet's defaults */
  show: boolean
  filter: boolean
  search: boolean
  canFilter: boolean
  canSearch: boolean
  /** a column that is always shown (Reference) */
  locked?: boolean
  remarks?: string
}

const spec = (key: string, description: string, o: Partial<PickupColumnSpec> = {}): PickupColumnSpec => ({
  key, description, show: true, filter: false, search: false, canFilter: false, canSearch: false, ...o,
})

/** The owner's sheet (2026-10-22), in the grid's reading order; the last four are optional (⚙ only). */
export const PICKUP_COLUMN_SHEET: PickupColumnSpec[] = [
  spec('reference', 'Pickup ID — the pickup request reference (PR-000123)', { search: true, canSearch: true, locked: true }),
  spec('status', 'Where the pickup is: Created · Pickup Requested · Driver Assigned For Pickup · Out For Pickup · Pickedup · Pickup Failed · Cancelled', { filter: true, canFilter: true }),
  spec('exception', 'Why it needs a hand: the failure / cancel reason and every flag (Late, Overdue, Duplicate …)', { filter: true, canFilter: true }),
  spec('type', 'LTL · FTL · LTL blind · FTL blind', { filter: true, canFilter: true }),
  spec('window', 'The date and time the pickup is planned for', { filter: true, canFilter: true, remarks: 'Date filter' }),
  spec('merchant', 'Whose consignments are collected', { search: true, canFilter: true, canSearch: true }),
  spec('address', 'Where the driver collects', { canFilter: true, canSearch: true }),
  spec('hub', 'The hub the pickup drops at', { filter: true, canFilter: true, canSearch: true }),
  spec('carrier', 'The carrier (own fleet or 3PL) that runs it', { filter: true, canFilter: true, canSearch: true }),
  spec('rider', 'The driver on its trip', { canFilter: true, canSearch: true }),
  spec('shipments', 'How many consignments are booked on it'),
  spec('plannedQty', 'Packages booked'),
  spec('actualQty', 'Packages collected (booked + overage scans), once picked'),
  spec('overage', 'Scans that matched no booking — the count opens their details'),
  spec('weight', 'Total weight of its consignments'),
  spec('pallets', 'Pallet spaces its consignments take'),
  spec('category', 'VIP · Stackable · Hazmat · Fragile · Heavy Weight', { filter: true, canFilter: true }),
  spec('service', 'The service type of its consignments', { filter: true, canFilter: true }),
  spec('tags', 'Tags of its consignments', { show: false }),
  spec('vehicle', 'Vehicle type of a full-vehicle booking', { show: false, canFilter: true }),
  spec('instructions', 'Note for the driver', { show: false }),
  spec('createdAt', 'When the request was made', { show: false }),
]
/* every grid column has a row (a new PR_COLUMN_DEFS entry without one gets plain defaults) */
const SHEET_BY_KEY = new Map(PICKUP_COLUMN_SHEET.map((s) => [s.key, s]))
const specOf = (key: string): PickupColumnSpec => SHEET_BY_KEY.get(key) ?? spec(key, '', { show: false })

export interface PickupColumnSetting extends PickupColumnSpec { label: string }

interface Stored { order: string[]; hidden: string[]; filter: string[]; search: string[] }

/** the sheet as settings — what Reset brings back */
export function defaultPickupColumns(): PickupColumnSetting[] {
  const defs = new Map(PR_COLUMN_DEFS.map((d) => [d.key, d]))
  return [...PICKUP_COLUMN_SHEET.map((s) => s.key).filter((k) => defs.has(k)),
    ...PR_COLUMN_DEFS.map((d) => d.key).filter((k) => !SHEET_BY_KEY.has(k))]
    .map((k) => ({ ...specOf(k), label: defs.get(k)!.label }))
}

/** the saved setup over the sheet: unknown keys dropped, new columns appended, at least one shown */
export function loadPickupColumns(): PickupColumnSetting[] {
  const base = defaultPickupColumns()
  let st: Stored | null = null
  try {
    const raw = window.localStorage.getItem(PICKUP_COLUMN_CONFIG_KEY)
    const v = raw ? JSON.parse(raw) as Partial<Stored> : null
    if (v && Array.isArray(v.order)) st = { order: v.order, hidden: v.hidden ?? [], filter: v.filter ?? [], search: v.search ?? [] }
  } catch { /* the sheet */ }
  if (!st) return base
  const byKey = new Map(base.map((c) => [c.key, c]))
  const ordered = [...st.order.filter((k) => byKey.has(k)), ...base.map((c) => c.key).filter((k) => !st!.order.includes(k))]
  const out = ordered.map((k) => {
    const c = byKey.get(k)!
    return {
      ...c,
      show: c.locked || !st!.hidden.includes(k),
      filter: c.canFilter && st!.filter.includes(k),
      search: c.canSearch && st!.search.includes(k),
    }
  })
  if (!out.some((c) => c.show)) out[0] = { ...out[0], show: true }
  return out
}

export function savePickupColumns(cols: PickupColumnSetting[] | null): void {
  try {
    if (!cols) window.localStorage.removeItem(PICKUP_COLUMN_CONFIG_KEY)
    else {
      const st: Stored = {
        order: cols.map((c) => c.key), hidden: cols.filter((c) => !c.show).map((c) => c.key),
        filter: cols.filter((c) => c.filter).map((c) => c.key), search: cols.filter((c) => c.search).map((c) => c.key),
      }
      window.localStorage.setItem(PICKUP_COLUMN_CONFIG_KEY, JSON.stringify(st))
    }
  } catch { /* storage unavailable — this session only */ }
  window.dispatchEvent(new Event(CHANGED))
}

/** the live setup — follows a Save here, in another tab, or a shared copy pulled in by formSync */
export function usePickupColumns(): PickupColumnSetting[] {
  const [cols, setCols] = useState(loadPickupColumns)
  useEffect(() => {
    const on = () => setCols(loadPickupColumns())
    const onStorage = (e: StorageEvent) => { if (e.key === PICKUP_COLUMN_CONFIG_KEY) on() }
    window.addEventListener(CHANGED, on)
    window.addEventListener('storage', onStorage)
    return () => { window.removeEventListener(CHANGED, on); window.removeEventListener('storage', onStorage) }
  }, [])
  return cols
}
