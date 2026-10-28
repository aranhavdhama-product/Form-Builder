/**
 * Add Consignment v2 — `/local/consignments/new` (+ `/new/vehicle`), the console's logical Add Consignment
 * (owner, 2026-09-29). A COPY of `GrowOrders/AddOrderPage.tsx` (the staging replica at `/add`, untouched):
 * same OrderDraft shape, re-ordered by dependency for the least scroll. The list's Add ▾ offers it first.
 *
 *   1 Consignment details — Merchant first, Order / Reference / Consignment Number (no fallback to the
 *     Reference), Consignment Type (it drives the ends: Reverse swaps them, Transfer = hub → hub, RTO /
 *     payment only where they apply, Exchange requires its order no., Service = goods optional), ship-by, payment.
 *   2 Ship From → Ship To — each end = a saved-address picker (merchant addresses / address book / hubs by type)
 *     read back as a card; Add / Edit in a popup (Contact · Address, "Save this address" to the matching list;
 *     Cancel restores). The address order is how people write one: Name · Company · Contact · Email · Line 1-3 ·
 *     Landmark · Country · Postal Code · Suburb · City · State · coordinates · floor; optional ones wait behind
 *     "More address details" and appear IN PLACE. Windows on the card; Scheduling Confirmation beside the
 *     delivery window; RTO as a compact choice. Then SHIPMENT LEGS on one line (shipmentLegs.ts: the owner's
 *     14-case table → one of 8 movement types, shown in words; Edit legs switches the hub stops = skip FM
 *     inbound / skip LM; case 7's one-vehicle pick & deliver). A pickup request is booked only with a Pickup leg.
 *   3 Package & SKU — each package with its SKUs; the builder may hide the SKUs (packages only) or the packages
 *     (SKU-based: SKU + quantity, master or typed NEW SKU — the packages are worked out); one derived list `goods`.
 *     Each package is entered in kg + cm or lb + in (its SKUs follow); the numbers are kept in kg + cm.
 *   3½ Handling — its own card: Order Category chips · Barcode on every box · Delivered in parts · Clearance · Tags.
 *   4 Service & instructions — Service Type · Load type (free: every service allows both since 2026-09-29) ·
 *     Vehicle Type (Ship From hub) · Total Loading Time, then Special Instructions + value-added services (one row
 *     each, on a package or a SKU). (FTL: this card BEFORE Vehicle Details.) Label Format is in Consignment details,
 *     Clearance on the Handling row, RTO a single "same as Ship From" toggle.
 *   5 Carriers — last, names only.
 *
 * Footer: Switch to Simplified — the original quick tier, restyled, not customisable.
 * Form builder (Edit consignment form): the live form is its own preview — rename · Required · More · hide per
 * field, an eye to show / leave out hidden ones; locks for the system's mandatory fields and the fields this form
 * needs. Rules = a v2-ONLY key (`fe-consignment-form-v2-rules`) over the shared config — /add, Grow and the list
 * never change. Errors appear only after an Add Order attempt. Labels 13px ink (owner exception to the type scale).
 * Deep links: `?draft=`, `?fromPickup=`, `?fromOverage=`, `?step=1|2` (packages / carriers).
 * Grow: Service Type is chosen at checkout (step 2 · Service & payment); the builder previews it under "Next step".
 */
import { createContext, Fragment, isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleMinus, Info, Lock, MapPinned, Package, Pencil, Plus, RotateCcw,
  ArrowDown, ArrowUp, Asterisk, Barcode, Bookmark, Copy, Eye, EyeOff, GripVertical, ListChecks, ListCollapse, Regex, ScanBarcode, SlidersHorizontal, Trash2, Truck, X, ListPlus, Crown, Flame, GlassWater, Layers, Users, Weight, Monitor, Store, Route as RouteIcon, LayoutTemplate,
  ArrowLeftRight, ArrowRight, Banknote, Bike, Boxes, CalendarCheck, Clock, House, MapPin, Repeat, ShieldCheck, Sparkles, Split, Undo2, Warehouse, Wrench, Zap,
} from 'lucide-react'
import { blankParty, CURRENCY } from '../../growOrders/seed'
import { growOrderActions, orderById, pickupRequestById, useGrowOrders } from '../../growOrders/store'
import { addressBookActions } from '../../growOrders/addressBook'
import type { Party } from '../../growOrders/types'
import {
  currentMerchant, ownPackageTypes, packageTypesForMerchant, setMerchantCode, useMasters, useMerchantCode,
  vehicleTypeOf, vehicleTypesFor, loadMasters, type PackageType, type SkuItem,
} from '../../growOrders/masters'
import { toast } from '../../nueva/toast'
import { placeGrowOrder, taxOf } from '../GrowOrders/placeOrder'
import { useSplitPayment, paidNowOf } from '../GrowOrders/splitPayment'
import { SplitPaymentSheet } from '../GrowOrders/paymentSheet'
import {
  Button, Checkbox, DateInput, Input, MenuSelect, Modal, MultiSelectDropdown, Toggle, SearchInput, Tooltip,
} from '../../nueva/components'
import {
  AddMoreButton, PhoneInput, SwitchBox, SwitchField, TimeBox, UnitBox,
} from '../../components/consignmentForm'
import { money, OTHER_ADDRESS, partyOk, prWindow, storeOptionLabel } from '../GrowOrders/utils'
import { hubName, inboundHubFor, INBOUND_HUBS } from '../../growOrders/hubs'
import { usePickupLocations, useReceiverBook } from '../GrowOrders/pickupLocations'
import {
  hasPickupLeg, legsOf, legsOfMovement, movementOfLegs, MOVEMENT_LABEL, MOVEMENT_TYPES, type LegChoice, type LegKind, type MovementType, type RouteEnd,
} from './shipmentLegs'
import {
  ADDITIONAL_SERVICES, DEFAULT_FTL_SERVICE, DRAFT_KEY, FTL_SERVICE_CODES, FTL_SERVICE_TYPES, PARCEL_SERVICES, SERVICE_TYPES, VEHICLE_SPECS,
  clearDraftKeys, draftFromOrder, loadTypeOf, ftlQuoteVehicles, ftlServiceType, readOverageSidecar,
  totalLoadKg, vehiclesFor,
  vehiclesOf, type ConsignmentFields, type CustomFieldValue, type FtlVehicle, type OrderDraft, type Parcel, type ParcelItem, type UnitSystem, type VasLine, type WeightUnit, type DimUnit,
} from '../../growOrders/draft'
import {
  CUSTOM_FIELD_CARDS, CUSTOM_FIELD_KINDS, DEFAULT_LAYOUT, FIELD_WIDTHS, FORMAT_PRESETS, PKG_SECTION, SKU_SECTION, applyOrder, clearLegacyGoods, formatError, formatMessage, formatSummary,
  GROW_OWN_KEYS, SECTION_ZONE, growRules, isCustomKey, loadCustomFields, loadLayout, loadOrder, loadRules, loadSummary, moveId, newCustomKey, patternError,
  saveCustomFields, saveLayout, saveOrder, saveRules, saveSummary, withoutKeys, DEFAULT_SUMMARY,
  type CustomFieldCard, type CustomFieldDef, type CustomFieldKind, type FieldFormat, type FieldRuleV2, type FieldWidth, type FormatPreset, type FormLayout,
  type FormPortal, type FormRulesV2, type FormOrder, type FormSummary, type AddressArrangement, type AddressEntry,
} from './formSetup'
import { usePickupModuleConfig } from '../../config/pickupModule'
import { hubVehicleTypes } from '../../config/vehicleConfig'
import { autoPickupWindowFor, pickupPolicy, policyCheck, userWindowError } from '../../growOrders/pickupSlots'
import {
  bookableServices, chargeableKg, currencyForHub, laneReady, quoteLane, quoteService, shipFromHubOf, vasPrice as laneVasPrice,
  vehicleRate, zoneParties,
} from '../../growOrders/rates'
import { SlotWindowFields } from '../LocalPickup/slotFields'
import { packageReady } from '../GrowOrders/packageModel'
import { windowOk as slotWindowOk } from '../GrowOrders/utils'
import { ServiceChoice, ServiceTypeChooser, type BookingMode, type FleetVehicle } from '../GrowOrders/serviceCards'
/* the console's field registry — pure module, read-only here */
import { CONSIGNMENT_FIELDS, fieldLabel, loadFieldConfig, loadFormBehavior, type FieldDef } from '../ConsignmentAdd/fieldConfig'


/* ---- option lists ---- */
const CONSIGNMENT_TYPES = ['Forward', 'Reverse', 'Exchange', 'Transfer', 'Service']
const PAYMENT_MODES = ['Prepaid', 'COD', 'To Pay']
const LABEL_FORMATS = ['PDF', 'ZPL']
/** sample Tag Master — the portal has no tag API */
const TAG_OPTIONS = ['Ambient', 'Priority', 'Gift', 'B2B', 'Weekend Delivery', 'Bulky']
const RTO_MODES = ['Same As Ship From', 'Use Different Address']
const DIAL_CODES = ['+63', '+27', '+264', '+267', '+1', '+44', '+91']
const CARRIERS = [
  { code: '2GO Express', sub: 'Parcel network · LTL' },
  { code: '2GO Logistics', sub: 'Dedicated trucks · FTL' },
]
/** sample VAS master — the portal has no vas API */
const VAS_SERVICES = ['Installation', 'Assembly', 'Unboxing', 'Old Item Pickup', 'Gift Wrapping', 'Wall Mounting',
  /* the former FTL "Additional Services" — now ordinary VAS options, priced by the rate card */
  ...ADDITIONAL_SERVICES.map((a) => a.code)]
/** rate-card price of a VAS option (only the former Additional Services carry one) */
const vasPrice = (service: string) => ADDITIONAL_SERVICES.find((a) => a.code === service)?.price ?? 0
const VAS_OPTS = VAS_SERVICES.map((v) => ({ value: v, label: vasPrice(v) ? `${v} · ${money(vasPrice(v), CURRENCY)}` : v }))

/** One Vehicle Details row: a vehicle type booked `count` times, sharing `loadKg`, to `addressIdx`. */
interface VehicleRow { vehicleType: string; count: number; loadKg: number; addressIdx: number[] }
/** Consecutive identical vehicles (type + addresses) fold into one row with a count. */
function rowsOf(vs: FtlVehicle[]): VehicleRow[] {
  const rows: VehicleRow[] = []
  for (const v of vs) {
    const last = rows[rows.length - 1]
    if (last && last.vehicleType === v.vehicleType && last.addressIdx.join() === v.addressIdx.join()) { last.count += 1; last.loadKg += v.actualLoadKg }
    else rows.push({ vehicleType: v.vehicleType, count: 1, loadKg: v.actualLoadKg, addressIdx: [...v.addressIdx] })
  }
  return rows
}
/** …and expand back into one FtlVehicle per vehicle, the shape the draft and the rate card read. */
const vehiclesOfRows = (rows: VehicleRow[]): FtlVehicle[] => rows.flatMap((r) =>
  Array.from({ length: Math.max(1, r.count) }, () => ({ vehicleType: r.vehicleType, actualLoadKg: r.loadKg / Math.max(1, r.count), addressIdx: r.addressIdx })))
const POSTCODES = ['1000', '1105', '1300', '1600', '4000', '5000', '6000', '6014', '6015', '8000']
const STATES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape', 'Metro Manila', 'Laguna', 'Cebu', 'Iloilo']
const COUNTRIES = ['Philippines', 'South Africa', 'Namibia', 'Botswana']
/** WHAT the goods are — decides `pkg.kind` (the Package Type is what they are IN). */
const CARGO_TYPES = ['Parcel', 'Document', 'Fragile', 'Perishable', 'Bulky']
const CUSTOM_PACKAGE = '__custom__'
const CUSTOM_PACKAGE_NAME = 'Custom'
const opts = (xs: readonly string[]) => xs.map((value) => ({ value }))
/** the vehicle that FITS a load: the smallest whose payload carries it, else the biggest (a whole fleet too small is still the best choice) */
const fitVehicle = <T extends { payloadKg: number }>(fleet: T[], loadKg: number): T | undefined =>
  [...fleet].filter((v) => v.payloadKg >= loadKg).sort((a, b) => a.payloadKg - b.payloadKg)[0] ?? [...fleet].sort((a, b) => b.payloadKg - a.payloadKg)[0]
const SERVICES = PARCEL_SERVICES

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** staging mints the package id on insert */
const newPackageId = () => `PKG${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const blankItem = (): ParcelItem => ({ skuCode: null, name: '', quantity: 1, weightKg: 0 })
const newParcel = (): Parcel => ({
  packageId: newPackageId(),
  cargoType: CARGO_TYPES[0], packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME,
  items: [], itemInfo: '', quantity: 1, weight: 1, l: 10, w: 10, h: 10, weightMode: 'auto',
  trackingNumber: '', palletSpace: '', description: '',
})
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** the SKU list of the separate layout in its own order (each line's `lineNo`, else where it stands) — so a SKU a
    package picks keeps its number and its place in the list */
const sepSort = <T,>(rows: T[], itOf: (r: T) => ParcelItem): T[] => rows.map((r, idx) => ({ r, idx, no: itOf(r).lineNo ?? idx + 1 }))
  .sort((a, b) => a.no - b.no || a.idx - b.idx).map((x) => x.r)
/** packages listed before "Show all" (owner, 2026-10-05: "if I have 100 packages this form is too much scroll") */
const PKG_PAGE = 8
const newVas = (): VasLine => ({ level: 'SKU', skuCode: '', service: '', serviceTimeMin: 0, remark: '' })
/* owner, 2026-09-29: a service is added to a PACKAGE or a SKU (a full-vehicle booking: the whole booking) */
const vasOk = (v: VasLine) => !!v.level && !!v.service && (v.level !== 'SKU' || !!v.skuCode) && (v.level !== 'PACKAGE' || !!v.packageId)
const round2 = (n: number) => Number(n.toFixed(2))
const filled = (v: string | undefined) => !!(v ?? '').trim()

/* ---- package units (owner, 2026-10-06: "Package Unit selectable, the same unit flows to the SKU — both portals"): a
   package is entered in kg + cm or lb + in and its SKUs follow it. The numbers are always KEPT in kg + cm, so rates,
   checkout, the summary and the views read them as before; only what is shown and typed is converted. ---- */
const KG_PER_LB = 0.45359237
const KG_PER_OZ = 0.028349523125
const CM_PER_IN = 2.54
/** what decides a package's units: the two independent choices, else the older pair (`unitSystem`), else kg · cm */
type UnitSrc = Pick<Parcel, 'unitSystem' | 'weightUnit' | 'dimUnit'>
interface Units {
  /** the weight / length unit as shown */
  w: WeightUnit; d: DimUnit
  /** kg → shown · shown → kg; cm → shown · shown → cm */
  toW: (kg: number) => number; fromW: (v: number) => number
  toD: (cm: number) => number; fromD: (v: number) => number
  /** cm³ → the size unit cubed (a package's size) · cm³ → "0.012 m³" or "0.4 ft³" (a total) */
  toV: (cm3: number) => number; vol: (cm3: number) => string
  /** a shown value is rounded — NumBox keeps what was typed while it rounds to the same value */
  precision?: number
}
const WEIGHT_UNITS: WeightUnit[] = ['kg', 'g', 'lb', 'oz']
const DIM_UNITS: DimUnit[] = ['cm', 'in', 'mm', 'm']
const WEIGHT_PER_KG: Record<WeightUnit, number> = { kg: 1, g: 1000, lb: 1 / KG_PER_LB, oz: 1 / KG_PER_OZ }
const WEIGHT_DIGITS: Record<WeightUnit, number> = { kg: 3, g: 1, lb: 2, oz: 2 }
const CM_PER_UNIT: Record<DimUnit, number> = { cm: 1, in: CM_PER_IN, mm: 0.1, m: 100 }
const DIM_DIGITS: Record<DimUnit, number> = { cm: 3, in: 2, mm: 1, m: 4 }
const LEGACY_PAIR: Record<UnitSystem, [WeightUnit, DimUnit]> = { metric: ['kg', 'cm'], gram: ['g', 'cm'], imperial: ['lb', 'in'], ounce: ['oz', 'in'] }
/* rounded only to hide a converted value's float tail (4.5359237 kg typed as 10 lb) */
const rounded = (n: number, digits: number) => Number(n.toFixed(digits))
function unitsFor(w: WeightUnit, d: DimUnit): Units {
  const wf = WEIGHT_PER_KG[w], df = CM_PER_UNIT[d]
  return {
    w, d, precision: WEIGHT_DIGITS[w],
    toW: (kg) => rounded(kg * wf, WEIGHT_DIGITS[w]), fromW: (v) => v / wf,
    toD: (cm) => rounded(cm / df, DIM_DIGITS[d]), fromD: (v) => v * df,
    toV: (cm3) => cm3 / df ** 3,
    vol: (cm3) => (d === 'in' ? `${(cm3 / 28316.846592).toFixed(3)} ft³` : `${(cm3 / 1e6).toFixed(3)} m³`),
  }
}
const METRIC: Units = unitsFor('kg', 'cm')
const unitsOf = (s?: UnitSrc | null): Units => {
  const legacy = LEGACY_PAIR[s?.unitSystem ?? 'metric'] ?? LEGACY_PAIR.metric
  return unitsFor(s?.weightUnit ?? legacy[0], s?.dimUnit ?? legacy[1])
}
/** a SKU line saved with its own units (the retired per-SKU Weight / Dimension unit) — its numbers to kg + cm */
function canonItem(it: ParcelItem): ParcelItem {
  const w = (it.weightUom ?? 'KG').toUpperCase()
  const d = (it.dimUom ?? 'CM').toUpperCase()
  if (w === 'KG' && d === 'CM') return it
  const wf = w === 'LB' || w === 'LBS' ? KG_PER_LB : w === 'OZ' ? KG_PER_OZ : w === 'G' ? 0.001 : 1
  const df = d === 'IN' ? CM_PER_IN : d === 'M' ? 100 : 1
  const dim = (x: number | undefined) => (x == null ? x : x * df)
  return { ...it, weightKg: it.weightKg * wf, weightUom: 'KG', lengthCm: dim(it.lengthCm), widthCm: dim(it.widthCm), heightCm: dim(it.heightCm), dimUom: 'CM' }
}
/** …and its package then shows lb + in when its SKUs were typed that way */
function canonParcel(p: Parcel): Parcel {
  if (!(p.items ?? []).some((it) => (it.weightUom ?? 'KG').toUpperCase() !== 'KG' || (it.dimUom ?? 'CM').toUpperCase() !== 'CM')) return p
  const imperial = (p.items ?? []).some((it) => /^(LBS?|IN)$/i.test(it.weightUom ?? '') || /^IN$/i.test(it.dimUom ?? ''))
  return { ...p, items: p.items?.map(canonItem), ...(!p.unitSystem && imperial ? { unitSystem: 'imperial' as const } : {}) }
}
/** A package's units — TWO small dropdowns at input height, set independently (owner, 2026-10-07): the weight unit (kg · g · lb · oz)
    and the size unit (cm · in · mm · m). */
function UnitPick({ units, onChange, label = 'Units' }: { units: Pick<Units, 'w' | 'd'>; onChange: (patch: { weightUnit?: WeightUnit; dimUnit?: DimUnit }) => void; label?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={label} title={label}>
      <div className="w-[68px]" title="Weight unit">
        <MenuSelect value={units.w} options={WEIGHT_UNITS} onChange={(v) => onChange({ weightUnit: v as WeightUnit })} />
      </div>
      <span className="text-ink-3" aria-hidden>·</span>
      <div className="w-[68px]" title="Size unit">
        <MenuSelect value={units.d} options={DIM_UNITS} onChange={(v) => onChange({ dimUnit: v as DimUnit })} />
      </div>
    </div>
  )
}

function packageValue(p: Parcel, types: PackageType[]): string {
  if (p.packageTypeCode && types.some((t) => t.code === p.packageTypeCode)) return p.packageTypeCode
  const name = (p.packageTypeName ?? '').trim().toLowerCase()
  return (name ? types.find((t) => t.name.toLowerCase() === name)?.code : undefined) ?? CUSTOM_PACKAGE
}
const itemsWeight = (items: ParcelItem[] = []) => items.reduce((n, it) => n + it.weightKg * it.quantity, 0)
const autoWeight = (p: Parcel, types: PackageType[]) =>
  (types.find((t) => t.code === p.packageTypeCode)?.weightKg ?? 0) + itemsWeight(p.items)
/** Re-derive a package's weight after its SKUs or packaging changed; a typed weight is never touched. */
function reweigh(p: Parcel, types: PackageType[]): Parcel {
  if (p.weightMode === 'manual') return p
  const w = autoWeight(p, types)
  return w > 0 ? { ...p, weight: round2(w), weightMode: 'auto' } : { ...p, weightMode: 'auto' }
}
const isBlankItem = (it: ParcelItem) => !it.skuCode && !it.name.trim()
const codeFor = (p: Party) => (p.businessName || p.name || p.city || 'store')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 14) || 'STORE'
const itemInfoOf = (p: Parcel) =>
  (p.items?.length ? p.items.map((it) => it.name.trim()).filter(Boolean).join(', ') : p.itemInfo)
/** 'YYYY-MM-DDTHH:mm' → its date / time halves */
const dateOf = (at?: string) => (at ? at.slice(0, 10) : '')
const timeOf = (at?: string) => (at && at.length >= 16 ? at.slice(11, 16) : '')

/* ----------------------------------------------------------- autocomplete ---- */

/**
 * Keyboard + portaled-popover state for the two autocompletes (SKU Code,
 * address book). The list is portaled to <body> — SectionCard and
 * RepeatableList rows are overflow-hidden — so "outside" means outside BOTH
 * the anchor and the popover, the way MenuSelect checks its popRef.
 */
function useAutocomplete<T>(hits: T[], onPick: (x: T) => void) {
  const [open, setOpenState] = useState(false)
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  /** the list under (or over) the box — false when the box is off screen */
  const place = () => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || r.bottom < 0 || r.top > window.innerHeight) return false
    const below = window.innerHeight - r.bottom
    const up = below < 220 && r.top > below
    /* wide enough for a SKU's full name, never past the screen's edge */
    const width = Math.max(r.width, Math.min(440, window.innerWidth - r.left - 16))
    setPos(up
      ? { bottom: window.innerHeight - r.top + 4, left: r.left, width, maxHeight: Math.min(320, r.top - 12) }
      : { top: r.bottom + 4, left: r.left, width, maxHeight: Math.min(320, below - 12) })
    return true
  }
  const setOpen = (v: boolean) => {
    if (v && !place()) return
    setOpenState(v)
  }
  useEffect(() => {
    if (!open) return
    const click = (e: MouseEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpenState(false)
    }
    /* the list follows its box when the page scrolls (focusing a new SKU line scrolls it into view — closing on that
       scroll left the box focused with no list, and a click on a focused box never re-opened it); it closes only once
       the box leaves the screen */
    const scroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node) && !place()) setOpenState(false) }
    window.addEventListener('mousedown', click)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', scroll)
    return () => {
      window.removeEventListener('mousedown', click)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', scroll)
    }
  }, [open])
  const active = hits.length ? Math.min(hi, hits.length - 1) : 0
  const pick = (x: T) => { onPick(x); setOpenState(false) }
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') { setOpenState(false); return }
    if (!open) { if (e.key === 'ArrowDown') setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hits.length - 1, active + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(0, active - 1)) }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); pick(hits[active]) }
  }
  return { open, setOpen, hi: active, setHi, ref, popRef, pos, onKeyDown, pick }
}

/** The portaled list shell — MenuSelect's popover anatomy. */
function AcPop({ pos, popRef, children }: {
  pos: { top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null
  popRef: RefObject<HTMLDivElement | null>; children: ReactNode
}) {
  if (!pos) return null
  return createPortal(
    <div ref={popRef} role="listbox"
      style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
      className="fe-nueva fixed z-[95] overflow-auto rounded-md border border-line bg-surface py-1 shadow-ds-overlay">
      {children}
    </div>,
    document.body,
  )
}
function AcRow({ on, onPick, onHover, children }: { on: boolean; onPick: () => void; onHover: () => void; children: ReactNode }) {
  return (
    <button type="button" role="option" aria-selected={on} onClick={onPick} onMouseEnter={onHover}
      className={`flex w-full items-center gap-3 px-3 text-left transition-colors ${on ? 'bg-warm-50 hover:bg-warm-100' : 'hover:bg-warm-50'}`}>
      {children}
    </button>
  )
}

/* ------------------------------------------------------------ form chrome ---- */

/** An icon's tooltip (owner, 2026-10-05: "add tooltip on icons") — the Nueva Tooltip, floating so a table or card never clips it. */
function Tip({ text, children }: { text: string; children: ReactNode }) {
  return <Tooltip floating text={text}>{children}</Tooltip>
}

interface Opt { value: string; label?: string }
const TEXTAREA = `w-full rounded-md border border-warm-300 bg-surface px-3 py-2 text-[13px] text-ink
  placeholder:text-warm-400 transition-shadow focus:border-brand-500 focus:ring-[3px] focus:ring-brand-500/20
  disabled:bg-warm-50 disabled:text-ink-3`
/** a read-only value at input height (a locked Location Master field, a minted package id) */
function ReadBox({ value }: { value: string }) {
  return (
    <div className="flex h-8 items-center truncate rounded-md border border-warm-200 bg-warm-50 px-3 text-[13px] text-ink-2" title={value}>
      {value || '—'}
    </div>
  )
}
/** A text box that hands its value over only once it is left (or on Enter) — for a value other things key on (a package's
    id: its card and the open package follow it, so a change per keystroke would rebuild the card under the cursor).
    Left empty = the value stays as it was. */
function CommitBox({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const v = text.trim()
    setText(null)
    if (v && v !== value) onCommit(v)
  }
  return (
    <div onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit() }}>
      <Input value={text ?? value} placeholder={placeholder} onChange={setText} />
    </div>
  )
}

/**
 * One labelled field in the console grid (`Fld`) around the matching Nueva
 * control: `options` → MenuSelect, `date` → DateInput, `multiline` → textarea,
 * otherwise Input. `error` is set only after a submit attempt.
 */
function F({ label, required, className = '', type, value, options, onChange, placeholder, error, helper, disabled, multiline, rows = 3, searchable, fieldKey }: {
  label: string; required?: boolean; className?: string; type?: string; value: string; options?: Opt[]
  onChange: (v: string) => void; placeholder?: string; error?: string; helper?: ReactNode; disabled?: boolean
  multiline?: boolean; rows?: number; searchable?: boolean
  /** the registry key the form builder configures (hide / required / rename) */
  fieldKey?: string
}) {
  const ruleReq = useRuleRequired(fieldKey)
  /* a Format rule (builder): its message shows once the field is left, not only after an Add Order attempt */
  const fmtErr = useFormatError(fieldKey, value)
  /* the builder's character limit (owner, 2026-10-27): typing stops there, and the field counts */
  const limit = useContext(BuilderCtx)?.maxLen(fieldKey ?? '')
  const typed = (v: string) => onChange(limit ? v.slice(0, limit) : v)
  if (limit && !options && type !== 'date' && !helper) helper = `${(value ?? '').length}/${limit}`
  const [left, setLeft] = useState(false)
  const err = error || (ruleReq && !filled(value) ? 'Required field.' : undefined) || fmtErr || undefined
  const optLabel = (v: string) => options?.find((o) => o.value === v)?.label ?? v
  const ph = placeholder?.trim() ? placeholder : undefined
  let control: ReactNode
  if (options) {
    control = disabled
      ? <ReadBox value={value ? optLabel(value) : ''} />
      : <MenuSelect value={value} placeholder={ph ?? 'Select'} options={options.map((o) => o.value)} labels={optLabel}
          searchable={searchable ?? options.length > 8} onChange={onChange} />
  } else if (type === 'date') {
    control = disabled ? <ReadBox value={value} /> : <DateInput value={value} onChange={onChange} />
  } else if (multiline) {
    control = <textarea rows={rows} value={value} placeholder={ph} disabled={disabled} onChange={(e) => typed(e.target.value)} className={TEXTAREA} />
  } else {
    control = <Input type={type} value={value} placeholder={ph} disabled={disabled} onChange={typed} />
  }
  return (
    <SFld label={label} required={required || ruleReq} error={err} errorNow={!!fmtErr && left && err === fmtErr} helper={helper} className={className} fieldKey={fieldKey}>
      <div onBlur={() => setLeft(true)}>{control}</div>
    </SFld>
  )
}

/** A number in the console's composite shell (value + unit tag); the typed text is held locally so '0.' stays typeable. */
function NumBox({ value, onChange, unit, integer, min = 0, blankZero, error, disabled, placeholder, precision }: {
  value: number; onChange: (n: number) => void; unit?: string
  integer?: boolean; min?: number; blankZero?: boolean; error?: string; disabled?: boolean; placeholder?: string
  /** `value` is shown rounded to this many decimals (a converted unit): what was typed stays while it rounds to it */
  precision?: number
}) {
  const [typed, setTyped] = useState<{ text: string; of: number } | null>(null)
  const same = (a: number, b: number) => a === b || (precision !== undefined && Math.abs(a - b) <= 0.5 * 10 ** -precision + 1e-9)
  const text = typed && same(typed.of, value) ? typed.text : (blankZero && value === 0 ? '' : String(value))
  const commit = (v: string) => {
    const n = v.trim() === '' ? 0 : Number(v)
    const next = Number.isFinite(n) ? Math.max(min, integer ? Math.round(n) : n) : value
    setTyped({ text: v, of: next })
    if (next !== value) onChange(next)
  }
  /* the red border waits for an Add Order attempt, like every other error */
  const showErrors = useContext(ShowErrorsCtx)
  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <UnitBox unit={unit} invalid={showErrors && !!error}>
        <input type="number" value={text} placeholder={placeholder} disabled={disabled} onChange={(e) => commit(e.target.value)}
          className="h-full w-full min-w-0 flex-1 rounded-md bg-transparent px-3 text-[13px] tabular-nums text-ink placeholder:text-warm-400 focus:outline-none
                     [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      </UnitBox>
    </div>
  )
}
function FNum({ label, required, className = '', helper, fieldKey, ...p }: ComponentProps<typeof NumBox> & { label: string; required?: boolean; className?: string; helper?: ReactNode; fieldKey?: string }) {
  const ruleReq = useRuleRequired(fieldKey)
  const error = p.error || (ruleReq && !(p.value > 0) ? 'Required field.' : undefined)
  return <SFld label={label} required={required || ruleReq} error={!!error} helper={helper} className={className} fieldKey={fieldKey}><NumBox {...p} error={error} /></SFld>
}

/* ------------------------------------------------------------------ SKUs ---- */

/**
 * SKU Code — the SKU-master autocomplete. Picking binds the line: name,
 * category, HSN Code, Origin Country, weight and dimensions come with it.
 * A bound line shows its code with an unlink ×; typing a SKU Name instead
 * keeps the line a custom one.
 */
/** the list's last row when a typed code matches no master SKU — "Use it as a new SKU" */
const NEW_SKU = '\u0000new-sku'
function SkuCode({ item, skus, onPick, onUnlink, onCustom, autoFocus }: {
  item: ParcelItem; skus: SkuItem[]; onPick: (s: SkuItem) => void; onUnlink: () => void
  /** a SKU typed by hand — not in the SKU master (owner, 2026-09-29: "selected from the master or typed") */
  onCustom?: (code: string) => void
  autoFocus?: boolean
}) {
  const [q, setQ] = useState('')
  const all = useMemo(() => skus.filter((s) => s.enabled).slice().sort((a, b) => a.code.localeCompare(b.code)), [skus])
  const needle = q.trim().toLowerCase()
  const matches = useMemo(() => (needle ? all.filter((s) => `${s.code} ${s.name} ${s.category}`.toLowerCase().includes(needle)) : all), [all, needle])
  const typed = q.trim().toUpperCase()
  const offerNew = !!onCustom && !!typed && !all.some((s) => s.code.toUpperCase() === typed)
  const hits = useMemo(() => [...matches.slice(0, 8),
    ...(offerNew ? [{ code: NEW_SKU, name: typed, category: '', hsnCode: '', originCountry: '', lengthCm: 0, widthCm: 0, heightCm: 0, weightKg: 0, stackable: false, hubs: [], enabled: true } as SkuItem] : [])],
  [matches, offerNew, typed])
  const committed = useRef(false)
  const { open, setOpen, hi, setHi, ref, popRef, pos, onKeyDown, pick } = useAutocomplete<SkuItem>(hits, (s) => {
    committed.current = true
    if (s.code === NEW_SKU) onCustom?.(s.name); else onPick(s)
    setQ('')
  })
  /* owner, 2026-09-29: "what if I want to type the SKU every time" — a typed code is kept when the field is
     left (Tab / click away), exactly like a text box: a master code links to the master, any other code
     becomes a new SKU. A click on a list row wins (it lands before this runs). */
  const commitTyped = () => {
    if (committed.current || !typed || !onCustom) return
    const exact = all.find((s) => s.code.toUpperCase() === typed)
    committed.current = true
    if (exact) onPick(exact); else onCustom(typed)
    setQ('')
  }
  const more = Math.max(0, matches.length - 8)
  const inMaster = !!item.skuCode && skus.some((s) => s.code === item.skuCode)
  /* Nueva Input takes no ref — focus through the wrapper */
  useEffect(() => { if (autoFocus) ref.current?.querySelector('input')?.focus() }, [autoFocus, ref])
  if (item.skuCode) {
    return (
      <span className="flex h-8 items-center gap-1 rounded-md border border-warm-300 bg-warm-50 px-3 text-[13px] text-ink">
        <span className="min-w-0 flex-1 truncate">{item.skuCode}</span>
        {!inMaster && <Tip text="Typed — not in the SKU master"><span className="shrink-0 rounded-full bg-surface px-1.5 text-[11px] text-ink-2">New</span></Tip>}
        <Tip text={inMaster ? 'Unlink from the SKU master' : 'Clear this SKU code'}><button type="button" aria-label="Clear SKU" onClick={onUnlink}
          className="shrink-0 text-warm-400 hover:text-ink"><X size={13} /></button></Tip>
      </span>
    )
  }
  return (
    <div ref={ref} className="relative" onFocus={() => { committed.current = false; if (!open) setOpen(true) }} onKeyDown={onKeyDown}
      onMouseDown={() => { if (!open) setOpen(true) }} onBlur={() => { window.setTimeout(commitTyped, 180) }}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }} placeholder={onCustom ? 'Search or type SKU' : 'Search SKU'} />
      {open && hits.length > 0 && (
        <AcPop pos={pos} popRef={popRef}>
          {hits.map((s, i) => s.code === NEW_SKU ? (
            <AcRow key={NEW_SKU} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(s)}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warm-100 text-ink-3"><Plus size={15} /></span>
              <span className="min-w-0 flex-1 py-1.5">
                <span className="block truncate text-[13px] font-bold text-ink">Use “{s.name}” as a new SKU</span>
                <span className="block truncate text-[12px] text-ink-3">Not in the SKU master — you type its name, size and weight</span>
              </span>
            </AcRow>
          ) : (
            <AcRow key={s.code} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(s)}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warm-100 text-ink-3"><Package size={15} /></span>
              <span className="min-w-0 flex-1 py-1.5">
                <span className="block truncate text-[13px] font-bold text-ink">{s.code} · {s.name}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {s.category || 'Uncategorised'}{s.hsnCode && <> · HSN {s.hsnCode}</>}{s.originCountry && <> · {s.originCountry}</>}
                </span>
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{s.weightKg} kg</span>
            </AcRow>
          ))}
          {more > 0 && <p className="px-3 pt-1 text-[12px] text-ink-3">{more} more — keep typing</p>}
        </AcPop>
      )}
    </div>
  )
}

/** The hub that serves an address — the PH network's rule (inboundHubFor), plus Chicago → ORD. */
const hubOf = (p: Pick<Party, 'city' | 'state'>) => (/chicago|schiller|illinois|\bil\b/i.test(`${p.city} ${p.state}`) ? 'ORD' : inboundHubFor(p))
const HUB_CODES = new Set(INBOUND_HUBS.map((h) => h.code))
/** What each consignment type moves between, and what it asks (owner, 2026-09-29: fields follow the type). */
const TYPE_RULES: Record<string, { from: 'merchant' | 'customers' | 'facilities'; to: 'merchant' | 'customers' | 'facilities'; rto: boolean; payment: boolean; goodsOptional: boolean }> = {
  Forward: { from: 'merchant', to: 'customers', rto: true, payment: true, goodsOptional: false },
  Reverse: { from: 'customers', to: 'merchant', rto: false, payment: true, goodsOptional: false },
  Exchange: { from: 'merchant', to: 'customers', rto: true, payment: true, goodsOptional: false },
  Transfer: { from: 'facilities', to: 'facilities', rto: false, payment: false, goodsOptional: false },
  Service: { from: 'merchant', to: 'customers', rto: false, payment: true, goodsOptional: true },
}

const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
/** a load in words — kg below a tonne (never "0.00 tons"), tonnes with the kg above it */
const loadText = (kg: number) => (kg >= 1000 ? `${(kg / 1000).toFixed(1)} t (${kg.toLocaleString()} kg)` : `${kg.toLocaleString()} kg`)
/** what checkout's "Back" left in the session (Grow) */
const readSessionDraft = (): OrderDraft | null => {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') as OrderDraft | null } catch { return null }
}

/* -------------------------------------------------------------------- page ---- */
/** Plain-language one-liners under the handling switches (owner copy, 2026-09-24). */
const SWITCH_HINTS = {
  scannable: 'The boxes carry barcodes and get scanned along the way.',
  schedulingConfirmation: 'Check the delivery time with the customer first.',
  dedicateTruck: 'One whole truck just for this consignment.',
  clearanceRequired: 'Needs customs or gate clearance before it can move.',
  splittable: 'Packages may travel on different trips and arrive separately.',
}

/** Order Category (console) — the six flags, asked as Handling chips on the goods (VIP too, owner 2026-09-29).
    All six still land in the one `consignment.category` list. */
const GOODS_CATEGORIES = [
  { name: 'Fragile', icon: GlassWater }, { name: 'Stackable', icon: Layers }, { name: 'Hazmat', icon: Flame },
  { name: 'Heavy Weight', icon: Weight }, { name: '4 Person', icon: Users }, { name: 'VIP', icon: Crown },
] as const

/** 'YYYY-MM-DD' + 'HH:mm' → 'YYYY-MM-DDTHH:mm' ('' when both are empty) */
const joinAt = (d: string, t: string, fallbackTime: string) => (d || t ? `${d || today()}T${t || fallbackTime}` : '')

/* ------------------------------------------------------------ layout bits ---- */

/**
 * A labelled field — the shared SFld's anatomy with a READABLE label (owner, 2026-09-29: "font has to be
 * more readable"): 13px ink-2 instead of 12px ink-3. Control text stays the Nueva primitives' 13px so a
 * row of select · date · phone · number reads as one size. Helper / "Required field." keep the one-line
 * absolute slot, so row heights do not move.
 */
function SFld({ label, required, info, error, errorNow, helper, className = '', fieldKey, children }: {
  label?: string; required?: boolean; info?: boolean; error?: boolean | string
  /** show the error before an Add Order attempt (a Format mismatch in a field already left) */
  errorNow?: boolean
  helper?: ReactNode; className?: string
  /** the builder key — in edit mode the label row carries its controls */
  fieldKey?: string
  children: ReactNode
}) {
  const showErrors = useContext(ShowErrorsCtx)
  const b = useContext(BuilderCtx)
  const editing = !!b?.editing && !!label
  /* owner, 2026-09-29: no "Required field." up front — only after an Add Order attempt */
  const msg = (showErrors || errorNow) && error && !editing ? (typeof error === 'string' ? error : 'Required field.') : null
  const tip = msg ?? (typeof helper === 'string' ? helper : undefined)
  const faded = editing && !!fieldKey && b!.isHidden(fieldKey)
  /* while editing, a field the builder knows is ONE click target \u2014 its settings open in a card beside it */
  const pickable = editing && !!fieldKey && b!.known(fieldKey)
  /* the builder's Width: the field's grid span (a drag cell takes it itself while the form is edited) */
  const cols = useContext(GridColsCtx)
  const span = fieldKey && b ? widthSpan(b.width(fieldKey), cols) : ''
  return (
    <div data-field={pickable ? fieldKey : undefined}
      className={`relative min-w-0 ${className} ${span} ${pickable ? `group/field ${pickFrame(b!.selected === fieldKey)}` : ''}`}>
      {editing
        ? <BuilderLabel label={label} fieldKey={fieldKey} required={required} />
        : (
          <label className="mb-1.5 flex min-h-5 items-start gap-1 field-label" title={label}>
            <span className="min-w-0">{label || '\u00a0'}{required && <span className="req-star">*</span>}</span>
            {info && <Info size={13} className="mt-0.5 shrink-0 text-brand-500" />}
            {fieldKey && b?.tip(fieldKey) && <span className="mt-px"><InfoTip text={b.tip(fieldKey)!} /></span>}
          </label>
        )}
      <div className={`relative ${faded ? 'pointer-events-none opacity-40' : ''}`}>
        {children}
        {(msg || helper) && (
          <p title={tip} className={`absolute left-0 right-0 top-full mt-1 truncate text-[12px] leading-4 ${msg ? 'pl-2 text-danger-fg' : 'text-ink-3'}`}>
            {msg ?? helper}
          </p>
        )}
      </div>
      {pickable && <PickHit k={fieldKey!} label={label ?? ''} />}
    </div>
  )
}

/* ================================================================ FORM BUILDER (owner, 2026-09-29) ====
 * "Edit consignment form" turns THIS form into its own live preview: every configurable field gets
 * rename · Required · Hide on its label; hidden fields stay on screen, faded, so they can come back.
 * Storage = a v2-ONLY rules key layered over the account's shared config (Form Builder hides +
 * Base Modules hides + relabels): saving here never changes /add, the Grow form, or the list's columns.
 * Locks: the registry's system-mandatory fields (api / account) and the fields THIS form's own checks
 * need (SKU + package weight and L × W × H) — never hideable, never optional. Required is offered only
 * on fields that hold a value (not switches, Load type or Service Type). Required ⇒ shown; hidden ⇒ not
 * required; a dependant hides with its parent (Order Amount ↔ Payment Mode, Loading Time ↔ Load type).
 *
 * 2026-10-05 — the builder edits ONE of two forms (`./formSetup`): the Console form, or the Grow portal form
 * (`?edit=grow`: the merchant form itself is the preview; Grow follows the console field by field until a field is
 * changed for Grow). Per field it adds **Format** (what may be typed — a preset or a regular expression), and each
 * of three cards takes the account's own fields (**+ Add field**: Text · Number · Date · List · Yes / No).
 *
 * 2026-10-05 (v3, owner: "it has to be easy to use", then "no side bar"): the preview is click-to-select — click a field
 * and its settings open in a CARD BESIDE IT in plain words (name · Show · Required · Put under More · What can be typed ·
 * Remove); the form-level choices sit on the cards they change (each address, the goods, Grow's services) and the bar's
 * All fields lists every field in one searchable dialog. The labels only carry state tags. */
/** the form's own checks require these — locked like the system's mandatory fields */
/** grouped keys drive several controls — hide / require together, no single label to rename */
const GROUP_KEYS = new Set(['addrLines23', 'addrCoordinates', 'addrFloorLift', 'addrWindow'])
/** v2-only configurable keys (owner, 2026-09-29): Lift on its own, the whole VAS section, each Handling category */
const catKey = (name: string) => `cat:${name}`
const V2_FIELDS: FieldDef[] = [
  { key: 'addrLift', defaultLabel: 'Lift Available', section: 'Address details', form: 'full', apiPath: 'address.liftAvailable' },
  { key: 'vas', defaultLabel: 'Value Added Services', section: 'Instructions', form: 'full', apiPath: 'consignmentDetails.vas[]' },
  /* owner, 2026-10-28: a VAS line's optional columns and the carrier are builder fields too (hide · move · size · require) */
  { key: 'vasTime', defaultLabel: 'Time (min)', section: 'Instructions', form: 'full', apiPath: 'consignmentDetails.vas[].serviceTimeMin' },
  { key: 'vasRemark', defaultLabel: 'Remark', section: 'Instructions', form: 'full', apiPath: 'consignmentDetails.vas[].remark' },
  { key: 'carrier', defaultLabel: 'Carrier', section: 'Order details', form: 'full', apiPath: 'consignmentDetails.carrier' },
  /* owner, 2026-09-29: optional and hideable */
  { key: 'vehicleType', defaultLabel: 'Vehicle Type', section: 'Order details', form: 'full', apiPath: 'consignmentDetails.vehicleType' },
  ...GOODS_CATEGORIES.map(({ name }): FieldDef => ({ key: catKey(name), defaultLabel: name, section: 'Handling & scheduling', form: 'full', apiPath: 'consignmentDetails.category[]' })),
  /* 2026-10-05: an address's Contact Number takes a Format (it stays as it is — Ship To needs it) */
  { key: 'addrContact', defaultLabel: 'Contact Number', section: 'Address details', form: 'simplified', apiPath: 'shipFrom/shipTo.contact.phone' },
  /* owner, 2026-10-06: the Package & SKU card's two sections — hide one instead of choosing "How goods are entered" */
  { key: PKG_SECTION, defaultLabel: 'Packages', section: 'Package fields', form: 'full', apiPath: 'packageDetails[]' },
  { key: SKU_SECTION, defaultLabel: 'SKUs', section: 'SKU fields', form: 'full', apiPath: 'skuDetails[]' },
  /* owner, 2026-10-06: Package Id optional (Grow: under More by default); a SKU's Origin Country configurable like HSN */
  { key: 'pkgId', defaultLabel: 'Package Id', section: 'Package fields', form: 'full', apiPath: 'packageDetails[].id' },
  { key: 'skuOrigin', defaultLabel: 'Origin Country', section: 'SKU fields', form: 'full', apiPath: 'skuDetails[].originCountry' },
  /* owner, 2026-10-07 ("apart from Consignment Number and Order Number everything should be configured by the form
     builder"): the controls that had no builder key get one — a package's type and quantity, the address's core fields
     (renamed only: routing and the rate need them), its postal code, Grow's payment remarks and the Vehicle Details card */
  { key: 'pkgType', defaultLabel: 'Package Type', section: 'Package fields', form: 'full', apiPath: 'packageDetails[].packageType' },
  { key: 'pkgQty', defaultLabel: 'Quantity', section: 'Package fields', form: 'full', apiPath: 'packageDetails[].quantity' },
  { key: 'addrName', defaultLabel: 'Name', section: 'Address details', form: 'simplified', apiPath: 'shipFrom/shipTo.contact.name' },
  { key: 'addrLine1', defaultLabel: 'Address Line 1', section: 'Address details', form: 'simplified', apiPath: 'address.line1' },
  { key: 'addrCountry', defaultLabel: 'Country', section: 'Address details', form: 'simplified', apiPath: 'address.country' },
  { key: 'addrState', defaultLabel: 'State', section: 'Address details', form: 'simplified', apiPath: 'address.state' },
  { key: 'addrCity', defaultLabel: 'City', section: 'Address details', form: 'simplified', apiPath: 'address.city' },
  { key: 'addrPostal', defaultLabel: 'Postal Code', section: 'Address details', form: 'simplified', apiPath: 'address.pincode' },
  { key: 'remarks', defaultLabel: 'Add remarks if any', section: 'Payment', form: 'full', apiPath: 'consignmentDetails.remarks' },
  { key: 'vehicleDetails', defaultLabel: 'Vehicle Details', section: 'Handling & scheduling', form: 'full', apiPath: 'consignmentDetails.vehicles[]' },
]
const V2_KEYS = new Set(V2_FIELDS.map((f) => f.key))
/** the two goods sections: shown / hidden only — not renamed, not under More, not moved */
const GOODS_SECTIONS = new Set([PKG_SECTION, SKU_SECTION])
/** controls that are not a field in a grid cell — no Width */
const NO_WIDTH = new Set([PKG_SECTION, SKU_SECTION, 'vas', 'dedicateTruck', 'hubProcessing', 'vehicleDetails', 'serviceType', 'scannable', 'schedulingConfirmation', 'clearanceRequired', 'splittable',
  'tags', 'addrLift', 'remarks', 'carrier'])
/** the cards that can be hidden as a whole and their fields (the system's — an account's own fields follow their own switch) */
const CARD_KEYS: Record<string, string[]> = {
  'sec-handling': [...GOODS_CATEGORIES.map(({ name }) => catKey(name)), 'scannable', 'splittable', 'clearanceRequired', 'tags', 'hubProcessing',
    'vehicleDetails', 'labelFormat', 'totalLoadingTime', 'specialInstructions'],
  'sec-extras': ['vas', 'vasTime', 'vasRemark'],
  'sec-svctype': ['serviceType'],
  'sec-carrier': ['carrier'],
}
const CARD_OF_KEY = new Map(Object.entries(CARD_KEYS).flatMap(([id, ks]) => ks.map((k) => [k, id] as const)))
/** a field's width before the builder sets one (M otherwise) — a note wants room */
const DEFAULT_WIDTH: Record<string, FieldWidth> = { specialInstructions: 'l' }
const FIELD_DEF = new Map([...CONSIGNMENT_FIELDS, ...V2_FIELDS].map((f) => [f.key, f]))
/* 2026-10-05 (owner: "in Service Type I can't hide that field"): Service Type is no longer locked — hidden, every
   consignment gets the builder's DEFAULT service (its rule's `defaultValue`); a draft / Modify keeps its own */
/* 2026-10-07 (owner: "apart from Consignment Number and Order Number everything should be configured by the form
   builder, optional, in both Grow and the console"): the only SYSTEM lock left is the Order Number (the identifier every
   consignment is found by; Consignment Number keeps its own rules). Reference Number, Consignment Type, Ship By Date,
   Merchant, the package / SKU weight and size and the Contact Number can now be hidden or made optional on BOTH forms —
   each hidden one has a fallback: Reference = the Order Number, type = Forward, ship by = today, Merchant = the signed-in
   / first merchant, weight and size = not asked (the rate then works from what is given). Locked by THIS form: an
   address's Name · Line 1 · Country · State · City — the route and the rate are worked out from them (rename only). */
const SYSTEM_LOCKED = new Set(['orderNumber'])
const FORM_LOCKED = new Set(['addrName', 'addrLine1', 'addrCountry', 'addrState', 'addrCity'])
/** fields that start REQUIRED while shown (the form needed them before 2026-10-07) — the builder can make them optional */
const DEFAULT_REQUIRED = new Set(['carrier', 'referenceNumber', 'merchant', 'pkgWeight', 'skuWeight', 'skuDimensions', 'addrContact'])
/** a value that is always valid — can be hidden, never "required" */
const NOT_REQUIRABLE = new Set(['scannable', 'schedulingConfirmation', 'clearanceRequired', 'splittable', 'dedicateTruck', 'hubProcessing', 'serviceType',
  'consignmentType', 'shipByDate', ...[...V2_KEYS].filter((k) => k !== 'skuOrigin' && k !== 'addrPostal' && k !== 'remarks')])
/** Format ("what can be typed") is retired (owner, 2026-10-27) — the switch that keeps its code readable */
const FORMAT_RULES_ON = false
/** the typed-text fields a Format can check (2026-10-05) — the system's mandatory identifiers included; custom Text fields too */
const FORMATABLE = new Set(['orderNumber', 'referenceNumber', 'consignmentNumber', 'exchangeOrderNumber',
  'addrCompanyName', 'addrEmail', 'addrLandmark', 'addrSuburb', 'addrContact', 'specialInstructions', 'remarks',
  'skuDescription', 'skuHsn', 'skuImage', 'pkgTracking', 'pkgDescription', 'pkgPalletSpace'])
/** where an optional field starts: its section's "More information" fold (the builder can move it) */
const DEFAULT_MORE = new Set(['addrCompanyName', 'addrLines23', 'addrLandmark', 'addrSuburb', 'addrCoordinates', 'addrFloorLift',
  'pkgDescription', 'pkgPalletSpace'])
/** a SKU line's details — on the line's second row, or in its own fold (its "More": the chevron at the line's end) */
const SKU_ROW_KEYS = new Set(['skuCategory', 'skuDescription', 'skuHsn', 'skuOrigin', 'skuUnitCost', 'skuImage'])
/** owner, 2026-10-06 — Grow's own starting places: a SKU's HSN Code · Origin Country · Cost on the line (not folded), and
    Package Id under More (the console keeps it in the package row). The builder can still move them; Grow does not take
    the console's More for these. */
/** owner, 2026-10-28 ("Grow and the consignment form use the same components for Create Order"): off = Grow's Create Order
    is drawn with the console form's cards (Ship From → Ship To, Package & SKU, Handling, Service & instructions); only its
    priced Service Type, its Payment card and the Dangerous-goods declaration stay its own. The Grow-team look (2026-10-27)
    is kept behind this switch. */
const GROW_OWN_LOOK = false as boolean
const GROW_SKU_FRONT = new Set(['skuDescription', 'skuHsn', 'skuOrigin', 'skuUnitCost'])
const GROW_MORE = new Set(['pkgId'])
/** the fields the Grow form keeps in its own place — the console's More does not move them there */
const GROW_FIXED_PLACE = new Set([...GROW_SKU_FRONT, ...GROW_MORE])
/** where a field starts on a portal's form: its section's More fold, or up front */
const defaultMoreOf = (k: string, grow: boolean) => DEFAULT_MORE.has(k) || (grow && GROW_MORE.has(k))
  || (SKU_ROW_KEYS.has(k) && !(grow && GROW_SKU_FRONT.has(k)))
/** keys that can sit in a section's More fold (never a locked one); every custom field can */
const movable = (k: string) => isCustomKey(k) || (FIELD_DEF.has(k) && !SYSTEM_LOCKED.has(k) && !FORM_LOCKED.has(k) && !GOODS_SECTIONS.has(k)
  && k !== 'vas' && k !== 'serviceType' && k !== 'vehicleDetails' && !k.startsWith('cat:') && k !== 'carrier' && k !== 'vasTime' && k !== 'vasRemark'
  && k !== 'consignmentType' && k !== 'shipByDate' && k !== 'merchant')

/** 'last' = one of the Package & SKU card's two sections, the only one still shown */
export type FieldLock = 'system' | 'form' | 'last' | null
const LOCK_TEXT: Record<Exclude<FieldLock, null>, string> = {
  system: 'Needed by the system — always shown and required',
  form: 'This form needs it — always shown',
  last: 'Packages or SKUs must show — show the other one to hide this',
}
interface Builder {
  editing: boolean
  /** which form the builder previews */
  portal: 'console' | 'grow'
  /** a field the builder knows (the registry, the v2 keys, the account's own fields) */
  known: (k: string) => boolean
  lock: (k: string) => FieldLock
  requirable: (k: string) => boolean
  /** hidden by its own rule (not only through its parent) */
  ownHidden: (k: string) => boolean
  isHidden: (k: string) => boolean
  /** the parent that hides it, if any */
  hiddenWith: (k: string) => string | null
  required: (k: string) => boolean
  /** in its section's "More information" fold (a required field never is) */
  inMore: (k: string) => boolean
  label: (k: string) => string
  set: (k: string, patch: FieldRuleV2) => void
  /** Format (2026-10-05): which keys take one, the rule, and its message for a value */
  formatable: (k: string) => boolean
  format: (k: string) => FieldFormat | undefined
  formatError: (k: string, v: string | undefined | null) => string | null
  /** the explainer shown as an ⓘ beside a field's name, and a typed-text field's character limit (owner, 2026-10-27) */
  tip: (k: string) => string | undefined
  maxLen: (k: string) => number | undefined
  /** the account's own field, if `k` is one — removable */
  custom: (k: string) => CustomFieldDef | undefined
  removeCustom: (k: string) => void
  /** shown on the previewed form but hidden on the other one (Ops only) — and the other way round (Grow only) */
  onlyHere: (k: string) => boolean
  onlyThere: (k: string) => boolean
  /** the field whose settings card is open (click-to-select) */
  selected: string | null
  select: (k: string | null) => void
  /** it can wait under "More" (not locked, not row-level) */
  movable: (k: string) => boolean
  /** how much of its row it takes (S = the normal size) — and whether the builder offers the choice for it */
  width: (k: string) => FieldWidth | undefined
  widthable: (k: string) => boolean
  /** a card's ⓘ text — the builder's own (rule `card:<id>`), else the card's; null = switched off */
  cardInfo: (key: string, fallback?: string) => string | null
  /** the eye on the field's frame — hides / shows it at once (on the previewed form) */
  hide: (k: string, hidden: boolean) => void
  /** Show for Ops / Show for Grow (owner, 2026-10-28): each form's own switch, and why one cannot change */
  shownOn: (k: string, p: FormPortal) => boolean
  showOn: (k: string, p: FormPortal, on: boolean) => void
  /** null = it can change; else the reason it cannot */
  showBlock: (k: string, p: FormPortal) => string | null
  /** the shared Required setting (lit even where the field is hidden) · hidden on both forms */
  reqSet: (k: string) => boolean
  offBoth: (k: string) => boolean
}
const BuilderCtx = createContext<Builder | null>(null)
/** false until the first Add Order attempt — then every missing field says so */
const ShowErrorsCtx = createContext(false)
/** a builder "required" rule applies to this key (and the field is shown) */
function useRuleRequired(key?: string) {
  const b = useContext(BuilderCtx)
  return !!key && !!b?.required(key)
}
/** the Format message for this value, when the key has a Format and the value breaks it */
function useFormatError(key: string | undefined, value: string | undefined | null) {
  const b = useContext(BuilderCtx)
  return key && b ? b.formatError(key, value) : null
}
/** a red line that appears only after an Add Order attempt */
function ErrLine({ children, className = '' }: { children: ReactNode; className?: string }) {
  return useContext(ShowErrorsCtx) ? <p className={`text-[12px] text-danger-fg ${className}`}>{children}</p> : null
}

/* ---- the builder's preview (2026-10-05 v2): click-to-select. A field the builder knows is ONE click target; its
   settings open in a card beside it. Its label keeps only state tags, so nothing is cut short. ---- */
/** the dashed frame of a pickable field — brand when selected; a locked field only on hover */
/* owner, 2026-10-27 ("edit mode should match the form much closely"): no frame at rest — a field shows its dashed frame on
   hover and a solid one while selected, so the edited form reads as the form itself */
const pickFrame = (selected: boolean) => `rounded-md outline-offset-[5px] ${selected
  ? 'outline outline-2 outline-brand-500'
  : 'hover:outline-dashed hover:outline-1 hover:outline-warm-400'}`
/** the invisible button over a field in the preview — a click (or Enter) opens its settings */
function PickHit({ k, label }: { k: string; label: string }) {
  const b = useContext(BuilderCtx)!
  return (
    <button type="button" aria-label={`Change ${label || b.label(k)}`} aria-pressed={b.selected === k}
      onClick={(e) => { e.stopPropagation(); b.select(k) }}
      className="absolute -inset-[5px] z-10 cursor-pointer rounded-md focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30" />
  )
}
const CHIP = 'inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[11px] leading-none'
/** What is set on a field, in words — on its frame in the preview and on its row in All fields. */
function FieldChips({ k, className = '', hideHidden = false, overlay = false }: {
  k: string; className?: string
  /** All fields says "hidden" with its switch */
  hideHidden?: boolean
  /** in the preview: tags sitting on the field's frame (top right), so the label keeps its full width */
  overlay?: boolean
}) {
  const b = useContext(BuilderCtx)!
  const lock = b.lock(k)
  const f = b.format(k)
  if (overlay) return <FieldTools k={k} />
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      {b.onlyHere(k) && <span className={`${CHIP} bg-brand-50 font-bold text-brand-600`}>{b.portal === 'grow' ? 'Grow only' : 'Ops only'}</span>}
      {b.onlyThere(k) && <span className={`${CHIP} bg-brand-50 font-bold text-brand-600`}>{b.portal === 'grow' ? 'Ops only' : 'Grow only'}</span>}
      {b.isHidden(k) ? !hideHidden && !b.onlyThere(k) && <span className={`${CHIP} bg-warm-100 text-ink-3`}>Hidden</span>
        : b.inMore(k) && <span className={`${CHIP} bg-warm-100 text-ink-2`}>More</span>}
      {f && <Tip text={formatSummary(f)}><span className={`${CHIP} bg-warm-100 text-ink-2`}>Format</span></Tip>}
      {lock && <Tip text={LOCK_TEXT[lock]}>
        <span aria-label="Locked" className="inline-flex h-[18px] w-4 items-center justify-center text-warm-400"><Lock size={11} /></span>
      </Tip>}
    </span>
  )
}
/**
 * A field's quick tools on its frame (owner, 2026-10-05: "I love your popup to edit the fields, but bring the icons back
 * too"): ✱ Required · ☰ More · .* Format · eye · trash (own fields). What is SET stays lit, so the frame still says it at
 * a glance; every tool shows on hover or while the field is selected. A click acts at once — Format opens the field's
 * card, where the rule is written. A locked field shows only its lock.
 */
function FieldTools({ k }: { k: string }) {
  const b = useContext(BuilderCtx)!
  const lock = b.lock(k)
  const both = b.offBoth(k)
  const req = b.reqSet(k)
  const more = b.inMore(k)
  const fmt = b.format(k)
  const open = b.selected === k
  const tool = (key: string, on: boolean, tip: string, icon: ReactNode, onClick: () => void, disabled = false, wide = false) => (
    <span key={key} className={open ? 'inline-flex' : 'hidden group-hover/field:inline-flex'}>
      <Tip text={tip}>
        <button type="button" aria-label={tip} aria-pressed={on} disabled={disabled}
          onClick={(e) => { e.stopPropagation(); onClick() }}
          className={`inline-flex h-[22px] items-center justify-center gap-1 rounded-full border shadow-ds-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40
            ${wide ? 'px-2 text-[11px] font-bold' : 'w-[22px]'}
            ${on ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-line bg-surface text-ink-3 hover:text-ink'}`}>
          {icon}
        </button>
      </Tip>
    </span>
  )
  return (
    <span className="absolute -top-[15px] right-1 z-20 inline-flex items-center gap-1">
      {b.onlyThere(k) && (
        <Tip text={`Hidden on the ${b.portal === 'grow' ? 'Grow' : 'Ops'} form, shown on the ${b.portal === 'grow' ? 'Ops' : 'Grow'} form`}>
          <span className={`${CHIP} border border-brand-100 bg-brand-50 font-bold text-brand-600`}>{b.portal === 'grow' ? 'Ops only' : 'Grow only'}</span>
        </Tip>
      )}
      {b.onlyHere(k) && (
        <Tip text={`Hidden on the ${b.portal === 'grow' ? 'Ops' : 'Grow'} form — click the field to change it`}>
          <span className={`${CHIP} border border-brand-100 bg-brand-50 font-bold text-brand-600`}>{b.portal === 'grow' ? 'Grow only' : 'Ops only'}</span>
        </Tip>
      )}
      {lock
        ? <span className={open ? 'inline-flex' : 'hidden group-hover/field:inline-flex'}><Tip text={LOCK_TEXT[lock]}>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-warm-400"><Lock size={10} /></span>
          </Tip></span>
        : <>
            {b.requirable(k) && tool('req', req, req ? 'Required — click to make it optional' : 'Make it required', <Asterisk size={12} />,
              () => b.set(k, { required: !req }), both)}
            {b.movable(k) && tool('more', more, more ? 'Under “More” — click to show it up front' : 'Put it under “More”', <ListCollapse size={12} />,
              () => b.set(k, { more: !more }), both || req)}
            {b.formatable(k) && tool('fmt', !!fmt, fmt ? `Format: ${formatSummary(fmt)} — click to change it` : 'Set what can be typed', <Regex size={12} />,
              () => b.select(k))}
            {/* Show for Ops · Show for Grow (owner, 2026-10-28) — lit = shown on that form; a struck eye = hidden there */}
            {(['console', 'grow'] as const).map((p) => {
              const who = p === 'grow' ? 'Grow' : 'Ops'
              const shown = b.shownOn(k, p)
              const block = b.showBlock(k, p)
              return tool(`show-${p}`, shown, block ?? (shown ? `Shown for ${who} — click to hide it there` : `Hidden for ${who} — click to show it there`),
                <>{shown ? <Eye size={11} /> : <EyeOff size={11} />}{who}</>, () => b.showOn(k, p, !shown), !!block, true)
            })}
            {b.custom(k) && tool('del', false, 'Remove this field', <Trash2 size={11} />, () => b.removeCustom(k))}
          </>}
    </span>
  )
}
/** The edit-mode label row: the label as the form shows it, then its chips; a field the builder does not know says so. */
function BuilderLabel({ label, fieldKey, required }: { label?: string; fieldKey?: string; required?: boolean }) {
  const b = useContext(BuilderCtx)!
  const star = required && <span className="req-star">*</span>
  if (!fieldKey || !b.known(fieldKey)) {
    return (
      <div className="mb-1.5 flex min-h-5 items-start gap-1 field-label">
        <span className="min-w-0 break-words" title={label}>{label}{star}</span>
        <span className="ml-auto inline-flex shrink-0"><Tip text="Part of the form — always shown"><Lock size={11} className="text-warm-300" /></Tip></span>
      </div>
    )
  }
  return (
    <div className="mb-1.5 flex min-h-5 items-start gap-1 field-label">
      <span className="min-w-0 break-words" title={label}>{label || b.label(fieldKey)}{star}</span>
      {b.tip(fieldKey) && <InfoTip text={b.tip(fieldKey)!} />}
      <FieldChips k={fieldKey} overlay />
    </div>
  )
}
/** Edit-mode frame for a non-field control (a switch, a chip, the VAS block): its chips above it, one click target. */
function Configurable({ fieldKey, children }: { fieldKey: string; children: ReactNode }) {
  const b = useContext(BuilderCtx)
  if (!b?.editing) return <>{children}</>
  return (
    <div data-field={fieldKey} className={`group/field relative ${pickFrame(b.selected === fieldKey)}`}>
      <FieldChips k={fieldKey} overlay />
      <div className={b.isHidden(fieldKey) ? 'pointer-events-none opacity-40' : ''}>{children}</div>
      <PickHit k={fieldKey} label={b.label(fieldKey)} />
    </div>
  )
}

/**
 * "More information" — optional fields a section rarely needs stay HIDDEN IN PLACE; the toggle reveals
 * them where they belong in the section's order (owner, 2026-09-29: "Address Line 2 goes under Line 1,
 * not at the bottom"). Nothing moves; the builder only decides which fields wait behind the toggle.
 */
type RevealEntry = [string | null, ReactNode, boolean?] | false | null | undefined
function revealEntries(entries: RevealEntry[], inMore: (k: string) => boolean, open: boolean, wrap?: (node: ReactNode, id: string, key: string | null) => ReactNode) {
  const nodes: ReactNode[] = []
  let waiting = 0
  let waitingFilled = 0
  for (const e of entries) {
    if (!e) continue
    const [k, node, isFilled] = e
    if (k && inMore(k)) {
      waiting += 1
      if (isFilled) waitingFilled += 1
      if (!open) continue
    }
    nodes.push(wrap ? wrap(node, entryId(e), k) : node)
  }
  return { nodes, waiting, waitingFilled }
}

/* ================================================================ field order (2026-10-05, owner: "drag and drop and
 * resequence columns in the same sections … the More section functionality can also change due to this") — every zone
 * of fields (a section's grid, an address's contact / address details, a package's row, the handling chips …) follows
 * the saved order (`formSetup.loadOrder`, per portal). While the form is edited each field is a drag cell: grab it and
 * drop it before / after another one in the SAME zone. More keeps its meaning: a More field waits in its NEW place and
 * is revealed there. */
type LiveEntry = Exclude<RevealEntry, false | null | undefined>
/** an entry's identity in its zone: its element key (every entry node carries one), else its More key */
const entryId = (e: LiveEntry) => (isValidElement(e[1]) && e[1].key != null ? String(e[1].key) : String(e[0] ?? ''))
interface SortApi {
  order: (zone: string) => string[] | undefined
  /** the form is being edited — the cells are draggable */
  active: boolean
  drag: { zone: string; id: string } | null
  /** the cell being dragged, read at once (state lands a render later; drag events do not wait) */
  dragging: () => { zone: string; id: string } | null
  over: { zone: string; id: string; after: boolean } | null
  start: (zone: string, id: string) => void
  hover: (zone: string, id: string, after: boolean) => void
  end: () => void
  /** `ids` = the zone's cells as they stand; `moved` goes before / after `target` */
  move: (zone: string, ids: string[], moved: string, target: string, after: boolean) => void
}
const SortCtx = createContext<SortApi | null>(null)
/** the one field being dragged on the page — read at once by the drag events (React state lands a render later) */
let liveDragValue: { zone: string; id: string } | null = null
const liveDrag = { get: () => liveDragValue, set: (v: { zone: string; id: string } | null) => { liveDragValue = v } }
/** a zone's entries in the saved order, through the More fold; drag cells while the form is edited */
function arrange(sort: SortApi | null, zone: string, entries: RevealEntry[], inMore: (k: string) => boolean, open: boolean, gap?: 'chips' | 'rows',
  /** a field's own sizing in a flex row (the package row) — given to its drag cell too, so it keeps its width while edited */
  cellClass?: (id: string) => string) {
  const live = entries.filter((e): e is LiveEntry => !!e)
  return revealEntries(applyOrder(live, entryId, sort?.order(zone)), inMore, open,
    sort?.active ? (node, id, key) => <SortCell key={id} zone={zone} id={id} gap={gap} fieldKey={key ?? undefined} className={cellClass?.(id)}>{node}</SortCell> : undefined)
}
/** the cells of a zone, in the order they stand on screen (siblings of `cell`) */
const zoneIds = (cell: HTMLElement, zone: string) => [...(cell.parentElement?.children ?? [])]
  .filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.sortZone === zone).map((c) => c.dataset.sortId!)
/** One field as a drag cell (edit mode only): a grip on hover, a brand bar where it would land, faded while dragged. */
function SortCell({ zone, id, gap, className = '', fieldKey, children }: { zone: string; id: string; gap?: 'chips' | 'rows'; className?: string; fieldKey?: string; children: ReactNode }) {
  const s = useContext(SortCtx)!
  const b = useContext(BuilderCtx)
  const cols = useContext(GridColsCtx)
  /* the builder's Width: this cell IS the grid item while the form is edited */
  const span = fieldKey && b ? widthSpan(b.width(fieldKey), cols) : ''
  const dragging = s.drag?.zone === zone && s.drag.id === id
  const over = s.over && s.over.zone === zone && s.over.id === id ? s.over : null
  /* a vertical list (the Summary's lines) is split top / bottom; a grid or a chip row left / right */
  const rows = gap === 'rows'
  const side = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect()
    return rows ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2
  }
  /* the bar sits in the middle of the gap: 24px between grid fields, 8px between chips, on the line between rows */
  const bar = rows ? (over?.after ? '-bottom-[2px]' : '-top-[2px]')
    : gap === 'chips' ? (over?.after ? '-right-[6px]' : '-left-[6px]') : (over?.after ? '-right-[14px]' : '-left-[14px]')
  return (
    <div data-sort-zone={zone} data-sort-id={id} draggable
      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); s.start(zone, id) }}
      onDragEnd={(e) => { e.stopPropagation(); s.end() }}
      onDragOver={(e) => {
        const d = s.dragging()
        if (!d || d.zone !== zone) return
        e.preventDefault(); e.stopPropagation()
        if (d.id !== id) s.hover(zone, id, side(e))
      }}
      onDrop={(e) => {
        const d = s.dragging()
        if (!d || d.zone !== zone) return
        e.preventDefault(); e.stopPropagation()
        s.move(zone, zoneIds(e.currentTarget, zone), d.id, id, side(e))
        s.end()
      }}
      className={`group/sort relative min-w-0 cursor-grab active:cursor-grabbing ${dragging ? 'opacity-40' : ''} ${span} ${className}`}>
      {over && !dragging && (rows
        ? <span aria-hidden className={`pointer-events-none absolute left-0 right-0 z-30 h-[3px] rounded-full bg-brand-500 ${bar}`} />
        : <span aria-hidden className={`pointer-events-none absolute -bottom-1 -top-1 z-30 w-[3px] rounded-full bg-brand-500 ${bar}`} />)}
      {gap !== 'chips' && (
        <span aria-hidden className={`pointer-events-none absolute z-20 hidden text-warm-400 group-hover/sort:block ${rows ? '-left-[17px] top-3.5' : '-left-[19px] top-0.5'}`}><GripVertical size={14} /></span>
      )}
      {children}
    </div>
  )
}
/** The reveal toggle under a section's fields; hidden while editing (everything is shown then). */
function RevealToggle({ open, onToggle, waiting, waitingFilled = 0, label = 'information', className = '', iconOnly = false }: {
  open: boolean; onToggle: () => void; waiting: number; waitingFilled?: number; label?: string; className?: string
  /** a chevron only, the words in its tooltip (a package's details — owner, 2026-09-29) */
  iconOnly?: boolean
}) {
  const b = useContext(BuilderCtx)
  if (b?.editing || waiting === 0) return null
  const words = open ? `Less ${label}` : `More ${label} · ${waiting} field${waiting === 1 ? '' : 's'}${waitingFilled ? `, ${waitingFilled} filled` : ''}`
  if (iconOnly) return (
    <Tip text={words}><button type="button" onClick={onToggle} aria-expanded={open} aria-label={words}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-warm-200 text-ink-3 hover:bg-warm-50 hover:text-ink ${className}`}>
      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
    </button></Tip>
  )
  return (
    <div className={className}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="inline-flex items-center gap-1 text-[13px] text-brand-500 hover:text-brand-600">
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{open ? `Less ${label}` : `More ${label}`}
        {!open && <span className="ml-1 text-[12px] text-ink-3">· {waiting} field{waiting === 1 ? '' : 's'}{waitingFilled ? `, ${waitingFilled} filled` : ''}</span>}
      </button>
    </div>
  )
}

/**
 * A card's explanation behind an ⓘ beside its title (owner, 2026-09-29: "move these heading texts into an info
 * icon and save scrolling space"). Opens on hover AND keyboard focus; left-aligned so it never clips the card.
 */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/info relative inline-flex">
      <button type="button" aria-label={text} className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
        <Info size={14} />
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 hidden w-max max-w-[420px] rounded-md bg-warm-900 px-2.5 py-1.5 text-[12px] font-normal leading-snug text-white shadow-ds-overlay group-hover/info:block group-focus-within/info:block">
        {text}
      </span>
    </span>
  )
}
/** A row-adder ("+ Add SKU") — a compact link, not a section button: it adds a line, so it takes a line's height. */
function AddRowLink({ label, onClick, quiet = false }: { label: string; onClick: () => void
  /** Grow (owner, 2026-10-27, the Grow team's form): an ink link with a list icon */
  quiet?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`-ml-1.5 inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-bold hover:bg-warm-50
        ${quiet ? 'text-ink hover:text-brand-500' : 'text-brand-500 hover:text-brand-600'}`}>
      {quiet ? <ListPlus size={15} /> : <Plus size={14} />}{label}
    </button>
  )
}
/** the field-order zone that holds the CARDS' order (owner, 2026-10-05: "move sections up and down") */
const SECTION_TITLES: Record<string, string> = {
  'sec-consignment': 'Consignment details', 'sec-parties': 'Ship From → Ship To', 'sec-to': 'Ship To', 'sec-packages': 'Package & SKU',
  'sec-vehicle': 'Vehicle Details', 'sec-handling': 'Handling & Instructions', 'sec-extras': 'Value Added Services', 'sec-service': 'Service & instructions',
  'sec-svctype': 'Service Type',
  'sec-carrier': 'Carriers', 'sec-summary': 'Summary', 'sec-payment': 'Payment', 'sec-pay': 'Payment',
}
/** While the form is edited: a small pill on a card's top edge — move the whole card one place up or down. */
function SectionMover({ title, first, last, onMove }: { title: string; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void }) {
  const btn = (dir: -1 | 1, disabled: boolean) => (
    <Tip text={disabled ? (dir < 0 ? 'Already the first card' : 'Already the last card') : `Move ${title} ${dir < 0 ? 'up' : 'down'}`}>
      <button type="button" disabled={disabled} aria-label={`Move ${title} ${dir < 0 ? 'up' : 'down'}`} onClick={() => onMove(dir)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-2 hover:bg-warm-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30">
        {dir < 0 ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
      </button>
    </Tip>
  )
  return (
    <div className="absolute -top-3.5 right-6 z-20 inline-flex items-center gap-0.5 rounded-full border border-line bg-surface py-0.5 pl-2.5 pr-0.5 opacity-0 shadow-ds-1 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
      <span className="mr-1 text-[11px] text-ink-3">Move card</span>
      {btn(-1, first)}{btn(1, last)}
    </div>
  )
}
/** This form's card — the shared StagingCard's look, the caption moved into an ⓘ (the header is one line). */
function FormCard({ id, title, caption, count, action, children }: {
  id?: string; title?: ReactNode; caption?: string; count?: number; action?: ReactNode; children?: ReactNode
}) {
  /* owner, 2026-10-28: the card's ⓘ is set in the form builder (rule `card:<id>`, shared by both forms) — while editing,
     a click on it opens its settings like a field's */
  const b = useContext(BuilderCtx)
  const key = id ? `card:${id}` : null
  const info = key && b ? b.cardInfo(key, caption) : caption ?? null
  const infoNode = key && b?.editing ? (
    <span data-field={key} data-default-tip={caption ?? ''} className={`group/field relative inline-flex ${pickFrame(b.selected === key)}`}>
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${info ? 'text-ink-3' : 'text-warm-300'}`}><Info size={14} /></span>
      <PickHit k={key} label={`the info of ${typeof title === 'string' ? title : 'this card'}`} />
    </span>
  ) : info && <InfoTip text={info} />
  return (
    <section id={id} className="scroll-mt-20 rounded-xl bg-surface px-6 py-5">
      {(title || action) && (
        <div className="mb-4 flex min-h-6 items-center justify-between gap-4">
          {title && (
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
              {title}
              {count !== undefined && <span className="font-normal">{count}</span>}
              {infoNode}
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/* Field grids, tighter than the shared SGrid (owner, 2026-09-29: "less space between the fields", then
   "reduce the gap between lines"). The row gap is sized to the ONE thing that lives in it — SFld's
   absolute helper / "Required field." line (mt-1 + 16px = 20px) — plus 4px, so a message never touches
   the next row's label: 24px. */
const FIELD_GAPS = 'gap-x-6 gap-y-6'
/** the field grid around a field — whether its columns follow the viewport or a container query (an address half) */
const GridColsCtx = createContext<{ cq: boolean; own?: boolean }>({ cq: false })
/** the grid classes of a field's Width (owner, 2026-10-28: "S less than the current width, M the current default, L two
    columns, Full the whole row"). The grids run at twice the columns and every item takes two (index.css `.fgrid`), so
    S = one half-column, M = nothing to add, L = four, Full = the row. One column below the breakpoint. */
function widthSpan(w: FieldWidth | undefined, g: { cq: boolean; own?: boolean }): string {
  /* a grid that sizes its cells itself (the package row) */
  if (g.own) return ''
  if (w === 'full') return 'col-span-full'
  if (w === 's') return g.cq ? '@min-[380px]:col-span-1' : 'sm:col-span-1'
  if (w === 'l') return g.cq ? '@min-[380px]:col-span-4' : 'sm:col-span-4'
  return ''
}
const GRID = { cq: false }
const GRID_CQ = { cq: true }
const GRID_OWN = { cq: true, own: true }
/** the 3-units-a-field container grid's cell spans (`.fgrid3-cq`): S 2 · M 3 · L 6 — three-box fields (L × W × H) never below 4 */
const SPAN3: Record<FieldWidth, string> = { s: '@min-[380px]:col-span-2', m: '', l: '@min-[380px]:col-span-6', full: 'col-span-full' }
const DIMS3: Record<FieldWidth, string> = { s: '@min-[380px]:col-span-4', m: '@min-[380px]:col-span-5', l: '@min-[380px]:col-span-6', full: 'col-span-full' }
const ROW3 = `fgrid3-cq grid grid-cols-1 items-end gap-x-6 gap-y-6 @min-[380px]:grid-cols-6 @min-[640px]:grid-cols-12 @min-[960px]:grid-cols-18`
/** The console field grid — `cols` field columns (4 default; the CSS grid has twice as many), SGrid's API with this form's gaps. */
function SGrid({ children, cols = 4, className = '' }: { children: ReactNode; cols?: 3 | 4 | 5 | 7; className?: string }) {
  const c = { 3: 'lg:grid-cols-6', 4: 'lg:grid-cols-8', 5: 'lg:grid-cols-10', 7: 'lg:grid-cols-14' }[cols]
  /* items-end (owner, 2026-10-28: "box alignment should be maintained"): a label that wraps grows upwards — the boxes of a row
     stay on one line */
  return <GridColsCtx.Provider value={GRID}><div className={`fgrid grid grid-cols-1 items-end ${FIELD_GAPS} sm:grid-cols-4 ${c} ${className}`}>{children}</div></GridColsCtx.Provider>
}
/** Two equal field columns (a party's fields). */
function Grid2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <GridColsCtx.Provider value={GRID}><div className={`fgrid grid grid-cols-1 items-end ${FIELD_GAPS} sm:grid-cols-4 ${className}`}>{children}</div></GridColsCtx.Provider>
}
/** An address on the form has HALF the card (Ship From | Ship To): two columns while the half is wide enough for a
    phone code + number, one below that (a container query — the half narrows beside the Summary or a pinned rail). */
function HalfGrid({ children }: { children: ReactNode }) {
  return <GridColsCtx.Provider value={GRID_CQ}><div className="@container"><div className={`fgrid-cq grid grid-cols-1 items-end ${FIELD_GAPS} @min-[380px]:grid-cols-4`}>{children}</div></div></GridColsCtx.Provider>
}
/** "One under the other" (owner, 2026-10-06): an address on the form has the card's full width — 2 columns from 380px, 4 from 880px */
function QuadGrid({ children }: { children: ReactNode }) {
  return <div className="@container"><div className={`grid grid-cols-1 ${FIELD_GAPS} @min-[380px]:grid-cols-2 @min-[880px]:grid-cols-4`}>{children}</div></div>
}
/** A small bold heading inside a card, with an optional control on its right. */
function SubTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
      <span className="shrink-0 whitespace-nowrap text-[14px] font-bold text-ink">{children}</span>
      {right}
    </div>
  )
}
/** Date + time in one field cell (a party's window start / end). */
function DateTimeCell({ label, at, onChange, fallbackTime }: { label: string; at: string; onChange: (v: string) => void; fallbackTime: string }) {
  const ruleReq = useRuleRequired('addrWindow')
  return (
    <SFld label={label} fieldKey="addrWindow" required={ruleReq} error={ruleReq && !filled(at)}>
      <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
        <DateInput value={dateOf(at)} placeholder="Select Date" onChange={(d) => onChange(d ? joinAt(d, timeOf(at), fallbackTime) : '')} />
        <TimeBox value={timeOf(at)} placeholder="Time" onChange={(t) => onChange(joinAt(dateOf(at), t, fallbackTime))} />
      </div>
    </SFld>
  )
}

/**
 * One address's fields (the Add / Edit address popup, and inline while editing the form). Required
 * first — Name* · Contact Number · Address Line 1* · Country* · State* · City* · Postal Code — then the
 * optional ones, each in the main grid or the "More information" fold by its placement (builder).
 * `variant="rto"` = the return address: Contact + Postal Code required, no coordinates / floor.
 */
function PartyBlock({ party, set, nameLabel, requireContact, hid, variant = 'full', grouped = false, wide = false, half = false }: {
  party: Party; set: (patch: Partial<Party>) => void; nameLabel: string
  requireContact?: boolean; hid: (k: string) => boolean; variant?: 'full' | 'rto'
  /** the popup: the same order under two quiet headings, Contact then Address */
  grouped?: boolean
  /** on the form itself (the builder's "Fields on the form"): the headings as CONTACT DETAILS / ADDRESS DETAILS, in
      its half of the card (Ship From | Ship To side by side, owner 2026-10-06), "More address details" below */
  wide?: boolean
  /** with wide: Ship From | Ship To side by side — two columns at most (else the card's full width, four columns) */
  half?: boolean
}) {
  const rto = variant === 'rto'
  const b = useContext(BuilderCtx)
  const showErrors = useContext(ShowErrorsCtx)
  const miss = (v: string | undefined, req: boolean) => req && !filled(v)
  const val = (k: keyof Party) => String(party[k] ?? '')
  const text = (k: keyof Party, label: string, o: { required?: boolean; type?: string; placeholder?: string; className?: string; fieldKey?: string } = {}) => (
    <F key={String(k)} label={label} required={o.required} type={o.type} placeholder={o.placeholder} className={o.className} fieldKey={o.fieldKey}
      value={val(k)} error={miss(val(k), !!o.required) ? 'Required field.' : undefined}
      onChange={(v) => set({ [k]: v } as Partial<Party>)} />
  )
  const sel = (k: 'country' | 'postalCode' | 'state', label: string, list: string[], required: boolean, fieldKey?: string) => (
    <F label={label} required={required} value={party[k] ?? ''} options={opts(list)} fieldKey={fieldKey}
      error={miss(party[k], required) ? 'Required field.' : undefined} onChange={(v) => set({ [k]: v })} />
  )
  const L = (k: string, d: string) => b?.label(k) ?? d
  /** a renamed field's name, else the form's own wording (the Name says Sender / Customer by role) */
  const Lr = (k: string, d: string) => { const l = b?.label(k); return l && l !== FIELD_DEF.get(k)?.defaultLabel ? l : d }
  /* Contact Number's Format (builder) — said once the box is left, or after an Add Order attempt */
  const phoneFmt = b?.formatError('addrContact', party.contactNumber) ?? null
  const [phoneLeft, setPhoneLeft] = useState(false)
  const [open, setOpen] = useState(false)
  const reveal = open || !!b?.editing
  const inMore = (k: string) => !!b?.inMore(k)
  /* the order a person writes an address in — Country → Postal Code → Suburb → City → State (owner) */
  const contactEntries: RevealEntry[] = [
    [null, text('name', Lr('addrName', nameLabel), { required: true, placeholder: 'eg, John Doe', fieldKey: 'addrName' })],
    !hid('addrCompanyName') && ['addrCompanyName', text('businessName', L('addrCompanyName', 'Company Name'), { placeholder: 'eg, Random Company', fieldKey: 'addrCompanyName' }), filled(party.businessName)],
    !hid('addrContact') && ['addrContact', <SFld key="phone" label={L('addrContact', 'Contact Number')} fieldKey="addrContact" required={requireContact}
      error={miss(party.contactNumber, !!requireContact) || phoneFmt || false} errorNow={!!phoneFmt && phoneLeft}>
      <div onBlur={() => setPhoneLeft(true)}>
        <PhoneInput code={party.countryCode ?? ''} number={party.contactNumber} codes={DIAL_CODES}
          invalid={(showErrors && miss(party.contactNumber, !!requireContact)) || (!!phoneFmt && (showErrors || phoneLeft))}
          onCode={(v) => set({ countryCode: v })} onNumber={(v) => set({ contactNumber: v })} />
      </div>
    </SFld>, filled(party.contactNumber)],
    !hid('addrEmail') && ['addrEmail', text('email', L('addrEmail', 'Email'), { type: 'email', placeholder: 'eg, johndoe@xyz.com', fieldKey: 'addrEmail' }), filled(party.email)],
  ]
  const addressEntries: RevealEntry[] = [
    [null, text('line1', L('addrLine1', 'Address Line 1'), { required: true, placeholder: 'eg, Building No., Street', fieldKey: 'addrLine1' })],
    !hid('addrLines23') && ['addrLines23', text('line2', 'Address Line 2', { placeholder: 'eg, Street 1 A', fieldKey: 'addrLines23' }), filled(party.line2)],
    !hid('addrLines23') && ['addrLines23', <F key="line3" label="Address Line 3" value={party.line3 ?? ''} placeholder="eg, Behind High School" onChange={(v) => set({ line3: v })} />, filled(party.line3)],
    !hid('addrLandmark') && ['addrLandmark', text('landmark', L('addrLandmark', 'Landmark'), { placeholder: 'eg, Behind High School', fieldKey: 'addrLandmark' }), filled(party.landmark)],
    [null, <div key="country" className="contents">{sel('country', L('addrCountry', 'Country'), COUNTRIES, true, 'addrCountry')}</div>],
    !hid('addrPostal') && ['addrPostal', <div key="postal" className="contents">{sel('postalCode', L('addrPostal', 'Postal Code'), POSTCODES, rto, 'addrPostal')}</div>, filled(party.postalCode)],
    !hid('addrSuburb') && ['addrSuburb', text('county', L('addrSuburb', 'Suburb / County'), { fieldKey: 'addrSuburb' }), filled(party.county)],
    [null, text('city', L('addrCity', 'City'), { required: true, fieldKey: 'addrCity' })],
    [null, <div key="state" className="contents">{sel('state', L('addrState', 'State'), STATES, true, 'addrState')}</div>],
    !rto && !hid('addrCoordinates') && ['addrCoordinates', text('latitude', 'Latitude', { type: 'number', fieldKey: 'addrCoordinates' }), filled(party.latitude)],
    !rto && !hid('addrCoordinates') && ['addrCoordinates', text('longitude', 'Longitude', { type: 'number' }), filled(party.longitude)],
    !rto && !hid('addrFloorLift') && ['addrFloorLift', text('floorNumber', 'Floor Number', { type: 'number', fieldKey: 'addrFloorLift' }), filled(party.floorNumber)],
    !rto && !hid('addrLift') && ['addrLift', <div key="lift" className="flex items-start pt-7"><Configurable fieldKey="addrLift">
      <SwitchField label={L('addrLift', 'Lift Available')} checked={!!party.liftAvailable} onChange={(v) => set({ liftAvailable: v })} />
    </Configurable></div>, !!party.liftAvailable],
  ]
  /* the order of an address's fields — one order for every address (Ship From, Ship To, RTO), contact and address apart */
  const sort = useContext(SortCtx)
  const who = arrange(sort, 'contact', contactEntries, inMore, reveal)
  const where = arrange(sort, 'address', addressEntries, inMore, reveal)
  const waiting = who.waiting + where.waiting
  const waitingFilled = who.waitingFilled + where.waitingFilled
  const toggle = <RevealToggle open={open} onToggle={() => setOpen((v) => !v)} waiting={waiting} waitingFilled={waitingFilled} label="address details" className="mt-5" />
  if (wide) {
    const head = (t: string) => (
      <div className="mb-4 flex items-center gap-3">
        <span className="text-[12px] font-bold uppercase tracking-wide text-ink-3">{t}</span><span className="h-px flex-1 bg-warm-200" />
      </div>
    )
    const G = half ? HalfGrid : QuadGrid
    return (
      <div>
        {head('Contact details')}
        <G>{who.nodes}</G>
        <div className="mt-6">{head('Address details')}</div>
        <G>{where.nodes}</G>
        {toggle}
      </div>
    )
  }
  if (grouped) {
    const head = (t: string) => (
      <div className="mb-4 flex items-center gap-3"><span className="text-[13px] font-bold text-ink-2">{t}</span><span className="h-px flex-1 bg-warm-200" /></div>
    )
    return (
      <div>
        {head('Contact')}
        <Grid2>{who.nodes}</Grid2>
        <div className="mt-6">{head('Address')}</div>
        <Grid2>{where.nodes}</Grid2>
        {toggle}
      </div>
    )
  }
  return (
    <div>
      {/* one flowing two-column order — no spans, so a revealed field never leaves a gap */}
      <Grid2>{who.nodes}{where.nodes}</Grid2>
      {toggle}
    </div>
  )
}

/** The chosen address, read back as a card: who · how to reach them · where. */
function AddressCard({ party, missing, invalid = [], onEdit, tag, editTip = 'Edit this address', hubOnly = false }: {
  party: Party; missing: string[]; tag?: string
  /** the pencil — while the form is edited: opens the pop-up to set up the address fields */
  onEdit?: () => void
  /** the pencil's tooltip */
  editTip?: string
  /** typed in the wrong format (the builder's Format rules) */
  invalid?: string[]
  /** an end that can only be a hub (its picker is Facility) — the empty card asks for a hub */
  hubOnly?: boolean
}) {
  const showErrors = useContext(ShowErrorsCtx)
  const empty = !filled(party.name) && !filled(party.line1)
  const place = [party.city, party.state, party.postalCode, party.country].filter((x) => filled(x)).join(', ')
  const contact = [party.contactNumber ? `${party.countryCode ?? ''} ${party.contactNumber}`.trim() : '', party.email].filter(Boolean).join(' · ')
  const bad = (showErrors && missing.length > 0) || invalid.length > 0
  return (
    <div className={`rounded-lg border bg-surface p-4 ${bad ? 'border-danger-fg' : 'border-warm-200'}`}>
      {empty
        ? <p className="text-[13px] text-ink-3">{hubOnly ? 'No hub yet — pick one.' : 'No address yet — pick a saved one or add a new address.'}</p>
        : (
          <div className="flex items-start gap-3">
            <MapPinned size={16} className="mt-0.5 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold text-ink">
                {party.name || <span className="font-normal text-ink-3">No name</span>}
                {party.businessName && party.businessName !== party.name && <span className="text-[13px] font-normal text-ink-2">· {party.businessName}</span>}
                {tag && <span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] font-normal text-ink-2">{tag}</span>}
              </p>
              {contact && <p className="mt-1 text-[13px] text-ink-2">{contact}</p>}
              <p className="mt-1 text-[13px] text-ink">{[party.line1, party.line2, party.line3, party.landmark].filter((x) => filled(x)).join(', ')}</p>
              {place && <p className="text-[13px] text-ink-2">{place}</p>}
            </div>
            {onEdit && <Tip text={editTip}><button type="button" onClick={onEdit} aria-label={editTip}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-warm-200 text-ink-2 hover:bg-warm-50 hover:text-ink">
              <Pencil size={14} />
            </button></Tip>}
          </div>
        )}
      {missing.length > 0 && (showErrors
        ? <p className="mt-3 text-[12px] text-danger-fg">Missing: {missing.join(', ')}</p>
        : !empty && <p className="mt-3"><span className="rounded-full bg-warm-50 px-2 py-0.5 text-[11px] text-ink-2">Incomplete — {missing.length} to add</span></p>)}
      {invalid.length > 0 && <p className="mt-2 text-[12px] text-danger-fg">Check the format: {invalid.join(', ')}</p>}
    </div>
  )
}

/** One saved address the search can offer (a merchant address, an address-book entry, a hub). */
interface AddrHit { value: string; party: Party; tag: string }
const addrHay = (p: Party) => [p.name, p.businessName, p.contactNumber, p.email, p.line1, p.line2, p.landmark, p.city, p.state, p.postalCode]
  .filter(Boolean).join(' ').toLowerCase()
/**
 * The search above an address typed on the form (the builder's "Fields on the form", owner 2026-10-05): "Search
 * from address book by name, number, address and company name". Picking one fills the fields below.
 */
function AddressSearch({ hits, onPick, placeholder }: { hits: AddrHit[]; onPick: (h: AddrHit) => void; placeholder: string }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const matches = useMemo(() => (needle ? hits.filter((h) => addrHay(h.party).includes(needle)) : hits), [hits, needle])
  const shown = matches.slice(0, 8)
  const { open, setOpen, hi, setHi, ref, popRef, pos, onKeyDown, pick } = useAutocomplete<AddrHit>(shown, (h) => { onPick(h); setQ('') })
  return (
    <div ref={ref} onFocus={() => { if (!open) setOpen(true) }} onMouseDown={() => { if (!open) setOpen(true) }} onKeyDown={onKeyDown}>
      <SearchInput value={q} onChange={(v) => { setQ(v); setHi(0); setOpen(true) }} placeholder={placeholder} />
      {open && (
        <AcPop pos={pos} popRef={popRef}>
          {shown.length === 0
            ? <p className="px-3 py-2 text-[13px] text-ink-3">{needle ? `No saved address matches “${q.trim()}” — type it below.` : 'No saved addresses yet — type the address below.'}</p>
            : shown.map((h, i) => {
              const p = h.party
              return (
                <AcRow key={h.value} on={i === hi} onHover={() => setHi(i)} onPick={() => pick(h)}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warm-100 text-ink-3"><MapPinned size={15} /></span>
                  <span className="min-w-0 flex-1 py-1.5">
                    <span className="block truncate text-[13px] font-bold text-ink">
                      {p.name || p.businessName || 'Unnamed'}{p.businessName && p.name && p.businessName !== p.name ? <span className="font-normal text-ink-2"> · {p.businessName}</span> : null}
                    </span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {[p.contactNumber, [p.line1, p.city, p.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-warm-50 px-2 py-0.5 text-[11px] text-ink-2">{h.tag}</span>
                </AcRow>
              )
            })}
          {matches.length > shown.length && <p className="px-3 pt-1 text-[12px] text-ink-3">{matches.length - shown.length} more — keep typing</p>}
        </AcPop>
      )}
    </div>
  )
}

/** A compact switch — label beside the toggle, its explanation only in the tooltip (the one-line rows). */
function InlineSwitch({ label, title, checked, onChange }: { label: string; title?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label title={title} className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-ink">
      <Toggle checked={checked} onChange={onChange} />{label}
    </label>
  )
}

/** L × W × H in one cell — three number boxes, one unit. The values are in cm; `units` shows and takes them in its unit. */
function DimsBox({ l, w, h, onChange, error, units = METRIC }: {
  l: number; w: number; h: number; onChange: (patch: { l?: number; w?: number; h?: number }) => void; error?: boolean; units?: Units
}) {
  const box = (k: 'l' | 'w' | 'h', v: number) => (
    <NumBox blankZero placeholder={k.toUpperCase()} value={units.toD(v)} precision={units.precision} error={error && !(v > 0) ? 'x' : undefined}
      onChange={(n) => onChange({ [k]: units.fromD(n) })} />
  )
  return (
    <div className="grid grid-cols-3 gap-1.5" title={`Length × Width × Height (${units.d})`}>
      {box('l', l)}{box('w', w)}{box('h', h)}
    </div>
  )
}

/* -------------------------------------------------------------------- page ---- */

/** An Items-mode line (the Packages section hidden — SKU-based): one SKU and how many units (each unit ships as its own
    piece; the packages are worked out). */
interface ItemLine { id: string; item: ParcelItem }
/** The Summary card (owner, 2026-10-28: "how many legs in symbols, the task type, how many SKUs, packages and VAS, icons for
    hazmat etc — icons only, the most beautiful summary, a flow through icons — and options to show it on Grow or Ops"):
    five icon rows, each one shown or hidden per form (`FormSummary.hidden`), the whole card on / off per form. */
interface SummaryLine { key: string; label: string; foot?: boolean }
const SUMMARY_ROWS: SummaryLine[] = [
  { key: 'route', label: 'Route' }, { key: 'task', label: 'Task' }, { key: 'goods', label: 'Goods' },
  { key: 'handling', label: 'Handling' }, { key: 'service', label: 'Service' },
]
const SUMMARY_LINES: Record<'console' | 'grow', SummaryLine[]> = { console: SUMMARY_ROWS, grow: SUMMARY_ROWS }
const summaryLinesOf = (p: 'console' | 'grow') => SUMMARY_LINES[p]
/** the builder's All fields groups, in card order (their fields are listed in the form) */
const FIELD_GROUP_IDS = ['sec-consignment', 'addresses', 'sec-packages', 'sec-handling', 'sec-extras', 'sec-svctype', 'sec-payment']
/** the Ship From → Ship To card's choices while the form is edited — one segmented control each (owner, 2026-10-06 / 10-07) */
const ARRANGE_OPTIONS: { value: AddressArrangement; label: string; sub: string }[] = [
  { value: 'side', label: 'Side by side', sub: 'Ship From left, Ship To right' },
  { value: 'stack', label: 'Stacked', sub: 'Ship To under Ship From, more room' },
]
const ENTRY_OPTIONS: { value: AddressEntry; label: string; sub: string }[] = [
  { value: 'cards', label: 'Card', sub: 'Pick a saved address, change it in a pop-up' },
  { value: 'inline', label: 'Fields', sub: 'Type the address here, or search saved ones' },
]
const ADDRESS_LAYOUT_ROWS: { key: 'addresses' | 'shipFrom' | 'shipTo' | 'rto'; label: string; options: { value: string; label: string; sub: string }[] }[] = [
  { key: 'addresses', label: 'Layout', options: ARRANGE_OPTIONS },
  { key: 'shipFrom', label: 'Ship From', options: ENTRY_OPTIONS },
  { key: 'shipTo', label: 'Ship To', options: ENTRY_OPTIONS },
  { key: 'rto', label: 'RTO', options: ENTRY_OPTIONS },
]

/**
 * `/local/consignments/new` (+ `/new/vehicle`) — the console's Add Consignment, arranged by
 * dependency (owner, 2026-09-29): what the consignment is → where it moves → what is in it →
 * how it moves → extras. Same fields, validation and `OrderDraft` as AddOrderPage (which stays
 * the staging replica at /add), one tier only.
 */
/** Grow (merchant portal): the carrier's / ops' fields never render — the merchant is the header ⇄, the carrier
    allocates the carrier, ops set the loading time, vehicle, coordinates and pallet space. (The load type is Grow's
    own Handling question; owner 2026-09-29: the Handling categories and tags show on Grow too.) */
/* 2026-10-07 (owner: "remove this from the Grow portal"): Grow has no Payment card — every order is Prepaid, with no COD amount and no
   remarks (how it is paid is the checkout's one question) */
const MERCHANT_OFF = new Set(['merchant', 'consignmentNumber', 'totalLoadingTime', 'vehicleType',
  'addrCoordinates', 'pkgPalletSpace', 'paymentMode', 'remarks', 'carrier'])
/** the console form never has these (Grow's own Payment card asks them) */
const CONSOLE_OFF = new Set(['remarks'])
/**
 * The route element. On the console, `?edit=console` opens the form builder previewing the Ops form and `?edit=grow`
 * previewing the Grow form — the Grow merchant form itself, mounted here (2026-10-05). The `key` remounts the form when
 * the builder switches preview; the working copy goes across in `builderHandoff` (owner, 2026-10-28: ONE builder).
 */
/** the builder's working copy — both forms' settings at once (./formSetup: shared rules + Show for Ops in `con`, Show for
    Grow + Grow's Service Type in `grow`; each form's own layout, Summary and card order; the shared field order) */
interface BuilderDraft {
  con: FormRulesV2; grow: FormRulesV2; custom: CustomFieldDef[]
  layout: Record<FormPortal, FormLayout>; summary: Record<FormPortal, FormSummary>
  /** the shared field order, with the Ops form's card order */
  order: FormOrder
  /** the Grow form's card order */
  growSections: string[] | undefined
}
const savedDraft = (): BuilderDraft => ({
  con: loadRules('console'), grow: loadRules('grow'), custom: loadCustomFields(),
  layout: { console: loadLayout('console'), grow: loadLayout('grow') },
  summary: { console: loadSummary('console'), grow: loadSummary('grow') },
  order: loadOrder('console'), growSections: loadOrder('grow')[SECTION_ZONE],
})
/** what the builder hands the other preview when it switches (each preview is its own mount); read on mount, cleared after */
type BuilderHandoff = { draft: BuilderDraft; selKey: string | null; showHidden: boolean; previewing: boolean }
let builderHandoff: BuilderHandoff | null = null
const handBuilder = (h: BuilderHandoff | null) => { builderHandoff = h }

export default function AddConsignmentV2Page({ portal = 'console' }: {
  /** 'merchant' = the Grow Create Order (`/grow/orders/add`): the same form minus the carrier's and ops' features,
      plus the lane's services with ESTIMATED rates, the pickup module's window and checkout / Save for later */
  portal?: 'console' | 'merchant'
} = {}) {
  const [params] = useSearchParams()
  const edit = portal === 'console' ? params.get('edit') : null
  return edit === 'grow'
    ? <AddConsignmentV2 key="grow-setup" portal="merchant" setup />
    : <AddConsignmentV2 key={portal} portal={portal} setup={edit === 'console'} />
}

function AddConsignmentV2({ portal = 'console', setup = false }: {
  portal?: 'console' | 'merchant'
  /** opened straight into the form builder (`?edit=`); with portal 'merchant' = the Grow portal form's preview */
  setup?: boolean
}) {
  const merchantMode = portal === 'merchant'
  /** the Grow-team look (Grow-only cards and package styling) — off: the console's components */
  const growLook = merchantMode && GROW_OWN_LOOK
  /* the Grow portal form, edited from the console: the merchant form as its own live preview */
  const growSetup = setup && merchantMode
  useEffect(() => { void loadMasters() }, [])
  const base = merchantMode ? '/grow/orders' : '/local/consignments'
  const prPath = (id: string) => (merchantMode ? `/grow/orders/pickups/${id}` : `/local/pickup/${id}`)
  const nav = useNavigate()
  const db = useGrowOrders()
  const masters = useMasters()
  const merchantCode = useMerchantCode()
  const merchant = currentMerchant(masters.merchants, merchantCode)
  const pickup = usePickupLocations(db.stores)
  const stores = pickup.stores
  const packageTypes = useMemo(
    () => packageTypesForMerchant(masters.packageTypes, merchant?.code ?? null),
    [masters.packageTypes, merchant?.code])
  const ownPresets = ownPackageTypes(masters.packageTypes, merchant?.code ?? null)
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  /* ?step=1|2 — QA shortcut: sample parties + identifiers + carrier prefilled, scrolled to the packages (1) / carriers (2) */
  const jump = Math.min(2, Math.max(0, Number(params.get('step')) || 0))
  const draftId = params.get('draft')
  /* a saved draft; on Grow also what checkout's "Back" left in the session (this form clears it on mount) */
  /* console Modify Shipment Details on a LIVE consignment: prefilled from the order when it has no stored form
     state, saved back onto it (status / payment / pickup kept) — never a new draft */
  const [liveEdit] = useState(() => { const o = draftId ? orderById(draftId) : null; return !merchantMode && !!o && !o.isDraft })
  const [saved] = useState<OrderDraft | null>(() => {
    /* the Grow portal form's preview starts empty — never a merchant's session draft */
    if (growSetup) return null
    /* what step 2's Back left in the session — only for THIS order (the same draft id; the same overage scan) */
    const session = merchantMode ? readSessionDraft() : null
    const ovParam = params.get('fromOverage')
    const ovSide = readOverageSidecar()
    const sessionHere = session
      && (!ovParam || (!!ovSide && `${ovSide.prId}:${ovSide.overageId}` === ovParam))
      && (!draftId || session.orderId === draftId) ? session : null
    const o = draftId ? orderById(draftId) : null
    if (o) return sessionHere ?? o.draft ?? (!merchantMode && !o.isDraft ? draftFromOrder(o) : null)
    return sessionHere
  })
  const resumeId = draftId ?? saved?.orderId ?? null
  const pr = pickupRequestById(params.get('fromPickup'))
  const [ovPrId = '', ovId = ''] = (params.get('fromOverage') ?? '').split(':')
  const ovPr = pickupRequestById(ovPrId || null)
  const ovScan = ovPr?.overages.find((v) => v.id === ovId && !v.orderId)
  const fromOverage = ovPr && ovScan ? { pr: ovPr, scan: ovScan } : undefined
  const ftlFirst = !fromOverage
    && (params.get('type') === 'FTL' || pathname.endsWith('/vehicle') || pr?.shipmentType === 'FTL' || saved?.shipmentType === 'FTL')
  const overageStore = fromOverage ? stores.find((s) => s.code === fromOverage.pr.storeCode) : undefined

  /* ---- the console registry: relabels + Form Builder hides (the Regular tier's membership) ---- */
  /* the account's shared config (read only) + this form's own rules on top (the builder writes these) */
  const [fieldCfg] = useState(loadFieldConfig)
  const [behavior] = useState(loadFormBehavior)
  /* the saved setup (./formSetup): the console's rules (shared settings + Show for Ops), Grow's own (Show for Grow + its
     Service Type), and the account's own fields */
  const [savedRules, setSavedRules] = useState<FormRulesV2>(() => loadRules('console'))
  const [savedGrow, setSavedGrow] = useState<FormRulesV2>(() => loadRules('grow'))
  const [savedCustom, setSavedCustom] = useState<CustomFieldDef[]>(loadCustomFields)
  /* owner, 2026-10-28: ONE builder for both forms — its working copy holds both, so flipping the preview between the Ops
     form and the Grow form keeps every unsaved change (it comes across from the other preview's mount) */
  const [handoff] = useState(() => (setup ? builderHandoff : null))
  useEffect(() => handBuilder(null), [])
  const [draft, setDraft] = useState<BuilderDraft>(() => handoff?.draft ?? savedDraft())
  /* `building` = the builder is open; `previewing` = its Preview (the form exactly as people see it, nothing created) */
  const [building, setBuilding] = useState(setup)
  /* the builder edits on the Ops form; the Grow form is only ever previewed (owner, 2026-10-28) */
  const [previewing, setPreviewing] = useState(setup && (handoff?.previewing ?? merchantMode))
  const editing = building && !previewing
  const formPortal = merchantMode ? 'grow' as const : 'console' as const
  const otherPortal = merchantMode ? 'console' as const : 'grow' as const
  const draftCustom = draft.custom
  const setDraftCustom = (f: (ds: CustomFieldDef[]) => CustomFieldDef[]) => setDraft((d) => ({ ...d, custom: f(d.custom) }))
  const customDefs = building ? draftCustom : savedCustom
  const customOf = (k: string) => (isCustomKey(k) ? customDefs.find((d) => d.key === k) : undefined)
  /* the account's own fields' answers, by key */
  const [cfv, setCfv] = useState<Record<string, string>>(() =>
    Object.fromEntries((saved?.consignment?.customFields ?? []).map((f) => [f.key, f.value])))
  /* the Simplified form (owner, 2026-09-29): the original form's quick tier, moved across as it was and restyled;
     not customisable — the builder's rules apply to the regular form only */
  /* owner, 2026-10-27: "remove simplified form" — ONE form; a stored Simplified choice is ignored, the footer has no switch.
     `simple` stays (always false) so the tier's code paths read as before. */
  const simple = false as boolean
  /* owner, 2026-10-28: the console wins every conflict — Grow takes the console's shared settings (name, Required, More,
     width, explainer, limit) plus the Form Fields tab's Grow-only Required; it keeps only Show for Grow and its own
     Service Type (`formSetup.growRules`). Grow also starts some fields in its own place (GROW_SKU_FRONT, GROW_MORE —
     its SKU table), so the console's More does not move them. */
  const conNow = building ? draft.con : savedRules
  const growNow = building ? draft.grow : savedGrow
  const merchantRules = useMemo<FormRulesV2>(() => {
    const out: FormRulesV2 = { ...conNow }
    for (const k of behavior.required ?? []) if (!out[k]?.hidden) out[k] = { ...out[k], required: true }
    for (const k of GROW_OWN_LOOK ? [...GROW_SKU_FRONT, ...GROW_MORE] : []) {
      if (out[k]?.more === undefined) continue
      const rest: FieldRuleV2 = { ...out[k] }
      delete rest.more
      if (Object.keys(rest).length) out[k] = rest; else delete out[k]
    }
    return growRules(out, growNow)
  }, [conNow, growNow, behavior])
  const rulesOf = (p: FormPortal) => (p === 'grow' ? merchantRules : conNow)
  const rules = rulesOf(formPortal)
  const offOn = (p: FormPortal) => (p === 'grow' ? MERCHANT_OFF : CONSOLE_OFF)
  /* the Package & SKU card's two sections (owner, 2026-10-06), per form: both shown = each package with its SKUs; SKUs
     hidden = packages only; Packages hidden = SKU-based. Never both — the one still shown is locked ('last'). */
  const rawOffOn = (p: FormPortal, k: string) => !!rulesOf(p)[k]?.hidden
  const pkgOffOn = (p: FormPortal) => rawOffOn(p, PKG_SECTION)
  const skuOffOn = (p: FormPortal) => rawOffOn(p, SKU_SECTION) && !pkgOffOn(p)
  const pkgOff = pkgOffOn(formPortal)
  const skuOff = skuOffOn(formPortal)
  /* owner, 2026-10-28 ("Packages or SKUs must show — make it editable too"): no 'last' lock any more — hiding the one still
     shown brings the other one back (setShown / setRule), so a form always asks one of them */
  const lockOn = (k: string): FieldLock => (SYSTEM_LOCKED.has(k) ? 'system' : FORM_LOCKED.has(k) ? 'form' : null)
  const lockOf = (k: string) => lockOn(k)
  const baseHidden = (k: string) => !!fieldCfg[k]?.hidden || behavior.hidden.includes(k)
  /** Show for Ops / Show for Grow off — each form's own switch */
  /* owner, 2026-10-28 ("do not block Grow and Ops show / hide — let the user decide"): a field a form does not have by
     default (MERCHANT_OFF on Grow, CONSOLE_OFF on Ops) starts hidden there, and Show for Grow / Ops can switch it on */
  const ownHiddenOn = (k: string, p: FormPortal) => !lockOn(k) && (rulesOf(p)[k]?.hidden ?? (offOn(p).has(k) || baseHidden(k)))
  const hiddenWithOn = (k: string, p: FormPortal): string | null => {
    const parent = FIELD_DEF.get(k)?.dependsOn
    /* owner, 2026-10-27 (Order Amount on Grow): a parent the Grow portal never has (Payment Mode) does not hide its
       dependant there — a Grow order is prepaid, its amount stands alone */
    if (parent && p === 'grow' && MERCHANT_OFF.has(parent) && rulesOf(p)[parent]?.hidden === undefined) return null
    return parent && (ownHiddenOn(parent, p) || hiddenWithOn(parent, p)) ? parent : null
  }
  const hiddenOn = (k: string, p: FormPortal) => ownHiddenOn(k, p) || !!hiddenWithOn(k, p)
  const ownHidden = (k: string) => ownHiddenOn(k, formPortal)
  const hiddenWith = (k: string) => hiddenWithOn(k, formPortal)
  const isHidden = (k: string) => hiddenOn(k, formPortal)
  const known = (k: string) => FIELD_DEF.has(k) || !!customOf(k)
  /* a Yes / No field always holds a value — never "required", like the switches */
  const requirable = (k: string) => known(k) && !lockOf(k) && !NOT_REQUIRABLE.has(k) && customOf(k)?.kind !== 'yesno'
  const need = (k: string) => !simple && requirable(k) && !isHidden(k) && (rules[k]?.required ?? DEFAULT_REQUIRED.has(k))
  const inMore = (k: string) => movable(k) && !need(k) && (rules[k]?.more ?? defaultMoreOf(k, growLook))
  /* a field that sits in a grid cell or a package line can be made wider; chips, switches and whole sections have no width */
  const widthable = (k: string) => known(k) && !lockOf(k) && !k.startsWith('cat:') && !NO_WIDTH.has(k) && customOf(k)?.kind !== 'yesno'
  /* Format (2026-10-05): the typed-text fields; 'any' = no check (how the Grow form drops a console Format) */
  /* the typed-text fields (a Format once checked them; now they take a character limit) */
  const textField = (k: string) => FORMATABLE.has(k) || customOf(k)?.kind === 'text'
  /* owner, 2026-10-27: "remove validation thing from form builder" — Format is retired: no field takes one, an old saved
     rule is never applied */
  const formatable = (_k: string) => FORMAT_RULES_ON && textField(_k)
  const fmtOf = (k: string) => { const f = formatable(k) ? rules[k]?.format : undefined; return f && f.preset !== 'any' ? f : undefined }
  /* a hidden field is never checked; the Simplified form is not customisable */
  const fmtErr = (k: string, v: string | undefined | null) => (simple || isHidden(k) ? null : formatError(fmtOf(k), v))
  const fmtOk = (k: string, v: string | undefined | null) => !fmtErr(k, v)
  /* editing = the live preview: every field renders (hidden ones faded) so it can be brought back */
  /* the builder's eye (icon only): hidden fields shown faded (default) or left out while editing */
  /* owner, 2026-10-05: off by default — the preview reads as the real form; turn it on (or use All fields) to bring one back */
  const [showHidden, setShowHidden] = useState(handoff?.showHidden ?? false)
  /* owner, 2026-10-28 ("I have hidden it — still shown"): Edit shows the Ops form as it is — a hidden field leaves it; "Show hidden
     fields" brings every hidden one back, faded (one Grow still shows is tagged "Grow only") */
  /* owner, 2026-10-28 ("the VAS card hidden for Ops, shown for Grow — it stopped showing in the form builder"): a CARD hidden for Ops
     but shown on Grow stays in Edit, faded and tagged "Grow only", its fields with it — so it can still be set up */
  const growOnlyCard = (id: string) => {
    const ks = CARD_KEYS[id]
    return !!ks && ks.every((k) => hiddenOn(k, 'console')) && ks.some((k) => !hiddenOn(k, 'grow'))
  }
  const hid = (key: string) => (editing
    ? !showHidden && isHidden(key) && !(CARD_OF_KEY.has(key) && growOnlyCard(CARD_OF_KEY.get(key)!))
    : isHidden(key))
  const lbl = (key: string) => rules[key]?.label?.trim() || customOf(key)?.label
    || (V2_KEYS.has(key) ? FIELD_DEF.get(key)!.defaultLabel : fieldLabel(key, fieldCfg))
  /** a rule with its defaults filled in — two rules that read the same compare equal */
  const norm = (k: string, r?: FieldRuleV2) => ({
    hidden: r?.hidden ?? baseHidden(k), required: r?.required ?? DEFAULT_REQUIRED.has(k), label: r?.label?.trim() ?? '',
    more: r?.more ?? defaultMoreOf(k, growLook), width: r?.width ?? '', format: JSON.stringify(r?.format && r.format.preset !== 'any' ? r.format : null),
    value: r?.defaultValue?.trim() ?? '', tip: r?.tooltip?.trim() ?? '', max: r?.maxLength ?? 0, notip: !!r?.noTip,
  })
  /** Show for Ops / Show for Grow — one form's switch; the other form keeps its own */
  const setShown = (k: string, p: FormPortal, on: boolean) => {
    /* Packages and SKUs: switching off the one still shown on that form shows the other (a form asks one of them) */
    const other = k === PKG_SECTION ? SKU_SECTION : k === SKU_SECTION ? PKG_SECTION : null
    const swap = !on && !!other && rawOffOn(p, other)
    if (swap) toast.info(`${k === SKU_SECTION ? 'Packages' : 'SKUs'} shown instead on the ${p === 'grow' ? 'Grow' : 'Ops'} form — it asks one of them`)
    setDraft((d) => {
      const side = p === 'grow' ? 'grow' : 'con'
      const r = { ...d[side], [k]: { ...d[side][k], hidden: !on } }
      if (swap && other) r[other] = { ...r[other], hidden: false }
      return { ...d, [side]: r }
    })
  }
  /* every other setting is SHARED — it goes to the console's rules, both forms read it (the console wins). Grow's own
     Service Type is the exception: on the Grow preview its whole rule is Grow's. Show / hide goes to the previewed form. */
  const setRule = (k: string, patch: FieldRuleV2) => setDraft((d) => {
    if (merchantMode && GROW_OWN_KEYS.has(k)) return { ...d, grow: { ...d.grow, [k]: { ...d.grow[k], ...patch } } }
    const { hidden, ...shared } = patch
    const side = merchantMode ? 'grow' : 'con'
    let con = d.con
    let grow = d.grow
    const show = (h: boolean) => { if (side === 'grow') grow = { ...grow, [k]: { ...grow[k], hidden: h } }; else con = { ...con, [k]: { ...con[k], hidden: h } } }
    if (hidden !== undefined) show(hidden)
    if (Object.keys(shared).length) con = { ...con, [k]: { ...con[k], ...shared } }
    /* Required means it is asked — on the form being previewed it shows (a hide no longer clears Required: the other
       form may still ask it) */
    if (shared.required) show(false)
    return { ...d, con, grow }
  })
  /* the Add field dialog — opened from a card (that card) or from All fields (null: the dialog asks where) */
  const [addCard, setAddCard] = useState<CustomFieldCard | null | false>(false)
  /* the builder's selection (click-to-select in the preview) and its All fields dialog */
  const [selKey, setSelKey] = useState<string | null>(handoff?.selKey ?? null)
  const [allOpen, setAllOpen] = useState(false)
  const [allQuery, setAllQuery] = useState('')
  const [allKey, setAllKey] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  /** "All fields", opened on one group (an address card's "Address fields" link) or on every group */
  const showFieldGroup = (id: string | null) => {
    setSelKey(null); setAllQuery(''); setAllKey(null)
    setOpenGroups(new Set(id ? [id] : FIELD_GROUP_IDS))
    setAllOpen(true)
  }
  /** switched off on exactly one form (a field one form never has is not counted — nothing to switch there) */
  /* a field off by default on one form (and never switched there) is not tagged — that is how the form starts */
  const byDefault = (k: string) => (MERCHANT_OFF.has(k) && growNow[k]?.hidden === undefined) || (CONSOLE_OFF.has(k) && conNow[k]?.hidden === undefined)
  const onOneForm = (k: string) => !byDefault(k) && hiddenOn(k, 'console') !== hiddenOn(k, 'grow')
  const removeCustom = (k: string) => setDraft((d) => ({
    ...d, custom: d.custom.filter((x) => x.key !== k), con: withoutKeys(d.con, [k]), grow: withoutKeys(d.grow, [k]),
  }))
  const builder: Builder = {
    editing, portal: formPortal, known, lock: lockOf, requirable, ownHidden, isHidden, hiddenWith, required: need, inMore, label: lbl, set: setRule,
    width: (k) => rules[k]?.width ?? DEFAULT_WIDTH[k], widthable,
    formatable, format: fmtOf, formatError: fmtErr, tip: (k: string) => rules[k]?.tooltip, maxLen: (k: string) => (textField(k) ? rules[k]?.maxLength : undefined),
    custom: customOf, removeCustom,
    onlyHere: (k) => onOneForm(k) && !hiddenOn(k, formPortal),
    onlyThere: (k) => onOneForm(k) && hiddenOn(k, formPortal),
    selected: editing ? selKey : null, select: setSelKey,
    movable: (k) => movable(k),
    hide: (k, on) => {
      if (GOODS_SECTIONS.has(k)) { setShown(k, formPortal, !on); return }
      setRule(k, { hidden: on })
      /* a goods section's switch stays on its card — say what the form asks now */
      if (on && GOODS_SECTIONS.has(k)) toast.info(k === SKU_SECTION ? 'SKUs hidden — the form asks for packages only' : 'Packages hidden — the form asks for SKUs and how many')
      else if (on && !showHidden) toast.info(`${lbl(k)} is hidden for ${merchantMode ? 'Grow' : 'Ops'} — All fields or “Show hidden fields” brings it back`)
    },
    shownOn: (k, p) => !ownHiddenOn(k, p),
    cardInfo: (key, fallback) => (rules[key]?.noTip ? null : rules[key]?.tooltip?.trim() || fallback || null),
    showOn: (k, p, on) => setShown(k, p, on),
    showBlock: (k, p) => {
      const who = p === 'grow' ? 'Grow' : 'Ops'
      const lk = lockOn(k)
      if (lk) return LOCK_TEXT[lk]
      const par = hiddenWithOn(k, p)
      return par && !ownHiddenOn(k, p) ? null : par ? `Hidden for ${who} — and it follows ${lbl(par)}, which is hidden there` : null
    },
    reqSet: (k) => requirable(k) && (rules[k]?.required ?? DEFAULT_REQUIRED.has(k)),
    offBoth: (k) => hiddenOn(k, 'console') && hiddenOn(k, 'grow'),
  }
  /* how the form looks — each form's own (owner, 2026-10-28: the UI styles differ): addresses as cards or fields on the
     form, Grow's services as cards or a menu (./formSetup) */
  const [savedLayout, setSavedLayout] = useState<FormLayout>(() => loadLayout(formPortal))
  const draftLayout = draft.layout[formPortal]
  const setLayoutOf = (p: FormPortal, f: (l: FormLayout) => FormLayout) => setDraft((d) => ({ ...d, layout: { ...d.layout, [p]: f(d.layout[p]) } }))
  const setDraftLayout = (f: (l: FormLayout) => FormLayout) => setLayoutOf(formPortal, f)
  /* while editing, a card's own display options open from its header (owner, 2026-10-27: the card looks like the form) */
  const [cardOpts, setCardOpts] = useState<string | null>(null)
  const layout = building ? draftLayout : savedLayout
  /* "Fields on the form", per address (owner, 2026-10-05: "individually configured, RTO also"): that address is typed
     in the card under a search of the saved ones (the Simplified form keeps cards) */
  const ADDR_ROLE = { from: 'shipFrom', to: 'shipTo', rto: 'rto' } as const
  const inlineOf = (role: 'from' | 'to' | 'rto') => !simple && layout[ADDR_ROLE[role]] === 'inline'
  /* the fields' order (shared) and this form's card order, and the Summary card (each form's own) */
  const [savedOrder, setSavedOrder] = useState<FormOrder>(() => loadOrder(formPortal))
  const draftOrder = useMemo<FormOrder>(() => {
    if (!merchantMode) return draft.order
    const out = { ...draft.order }
    delete out[SECTION_ZONE]
    return draft.growSections ? { ...out, [SECTION_ZONE]: draft.growSections } : out
  }, [draft.order, draft.growSections, merchantMode])
  const setDraftOrder = (f: (o: FormOrder) => FormOrder) => setDraft((d) => {
    if (!merchantMode) return { ...d, order: f(d.order) }
    const cur = { ...d.order }
    delete cur[SECTION_ZONE]
    const next = f(d.growSections ? { ...cur, [SECTION_ZONE]: d.growSections } : cur)
    const shared = { ...next }
    delete shared[SECTION_ZONE]
    return { ...d, order: d.order[SECTION_ZONE] ? { ...shared, [SECTION_ZONE]: d.order[SECTION_ZONE] } : shared, growSections: next[SECTION_ZONE] }
  })
  const fieldOrder = building ? draftOrder : savedOrder
  const [savedSummary, setSavedSummary] = useState<FormSummary>(() => loadSummary(formPortal))
  const draftSummary = draft.summary[formPortal]
  const summaryCfg = building ? draftSummary : savedSummary
  const [drag, setDrag] = useState<SortApi['drag']>(null)
  const [over, setOver] = useState<SortApi['over']>(null)
  const sortApi: SortApi = {
    order: (zone) => fieldOrder[zone], active: editing, drag, over,
    dragging: liveDrag.get,
    start: (zone, id) => { liveDrag.set({ zone, id }); setDrag({ zone, id }) },
    hover: (zone, id, after) => setOver((o) => (o && o.zone === zone && o.id === id && o.after === after ? o : { zone, id, after })),
    end: () => { liveDrag.set(null); setDrag(null); setOver(null) },
    move: (zone, ids, moved, target, after) => setDraftOrder((o) => ({ ...o, [zone]: moveId(ids, moved, target, after) })),
  }
  const startEditing = () => {
    setDraft(savedDraft())
    setSelKey(null); setShowErrors(false); setPreviewing(false); setBuilding(true)
  }
  /* the builder opened by URL (`?edit=`) hands back to the plain console form when it is done */
  const leaveSetup = () => {
    if (!setup && !params.get('edit')) return
    const next = new URLSearchParams(params)
    next.delete('edit')
    const q = next.toString()
    nav({ pathname: merchantMode ? '/local/consignments/new' : pathname, search: q ? `?${q}` : '' }, { replace: true })
  }
  const cancelEditing = () => { setSelKey(null); setBuilding(false); setPreviewing(false); setShowErrors(false); leaveSetup() }
  const sameRules = (a: FormRulesV2, b: FormRulesV2) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => JSON.stringify(norm(k, a[k])) === JSON.stringify(norm(k, b[k])))
  const sameGrow = (a: FormRulesV2, b: FormRulesV2) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => (GROW_OWN_KEYS.has(k)
      ? JSON.stringify(norm(k, a[k])) === JSON.stringify(norm(k, b[k])) : (a[k]?.hidden ?? null) === (b[k]?.hidden ?? null)))
  const dirty = useMemo(() => {
    if (!building) return false
    const s0 = savedDraft()
    return !sameRules(draft.con, s0.con) || !sameGrow(draft.grow, s0.grow)
      || JSON.stringify(draft.custom) !== JSON.stringify(s0.custom) || JSON.stringify(draft.layout) !== JSON.stringify(s0.layout)
      || JSON.stringify(draft.order) !== JSON.stringify(s0.order) || JSON.stringify(draft.growSections ?? null) !== JSON.stringify(s0.growSections ?? null)
      || JSON.stringify(draft.summary) !== JSON.stringify(s0.summary)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the saved copies change only with a Save, which ends building
  }, [building, draft, savedRules, savedGrow])
  /* Save writes BOTH forms — one builder, one Save */
  const saveEditing = () => {
    const removed = savedCustom.filter((d) => !draft.custom.some((x) => x.key === d.key)).map((d) => d.key)
    saveRules('console', withoutKeys(draft.con, removed))
    saveRules('grow', withoutKeys(draft.grow, removed))
    saveCustomFields(draft.custom)
    /* both forms' rules now hold the retired "How goods are entered" as the section hides */
    clearLegacyGoods()
    saveLayout('console', draft.layout.console); saveLayout('grow', draft.layout.grow)
    saveOrder('console', draft.order); saveOrder('grow', draft.growSections ? { [SECTION_ZONE]: draft.growSections } : {})
    saveSummary('console', draft.summary.console); saveSummary('grow', draft.summary.grow)
    setSavedRules(loadRules('console')); setSavedGrow(loadRules('grow')); setSavedCustom(loadCustomFields())
    setSavedLayout(loadLayout(formPortal)); setSavedOrder(loadOrder(formPortal)); setSavedSummary(loadSummary(formPortal))
    setSelKey(null); setBuilding(false); setPreviewing(false); setShowErrors(false)
    /* formSync sends the saved setup to the server, so every device and user gets it (owner, 2026-10-06) */
    toast.success('Both forms saved — Add Consignment and Grow Create Order show it on every device')
    leaveSetup()
  }
  /* the builder's Ops | Grow preview switch — the working copy goes across, nothing to save first */
  const switchPortal = (p: FormPortal, preview = previewing) => {
    if (p === formPortal) return
    handBuilder({ draft, selKey, showHidden, previewing: preview })
    const next = new URLSearchParams(params)
    next.set('edit', p)
    nav({ pathname: '/local/consignments/new', search: `?${next}` }, { replace: true })
  }
  /* "More information" per section (and per package): open ones reveal their waiting fields in place */
  const [openSecs, setOpenSecs] = useState<Set<string>>(new Set())
  const secOpen = (id: string) => editing || openSecs.has(id)
  const toggleSec = (id: string) => setOpenSecs((st) => { const n = new Set(st); if (n.has(id)) n.delete(id); else n.add(id); return n })
  /* owner, 2026-09-29: errors only after someone tries to add the order */
  const [showErrors, setShowErrors] = useState(false)
  const custom = (key: string, registryDefault: string, copy: string) => { const l = lbl(key); return l === registryDefault ? copy : l }
  /** the builder's own name for a field, else the form's wording (a field whose label carries its units) */
  const ownLbl = (key: string, d: string) => rules[key]?.label?.trim() || d

  /* ---- Ship From ---- */
  const firstSender = (): Party => saved?.sender
    ?? overageStore?.party
    ?? (pr ? pr.shipFrom ?? stores.find((s) => s.code === pr.storeCode)?.party ?? blankParty()
      : stores[0]?.party ?? blankParty())
  const storeOf = (p: Party) => stores.find((s) => s.party.name === p.name && s.party.line1 === p.line1)
    ?? db.stores.find((s) => s.party.name === p.name && s.party.line1 === p.line1)
  const [sender, setSender] = useState<Party>(() => {
    const p = firstSender()
    return merchantMode && pr && !saved && !p.windowStart ? { ...p, windowStart: pr.startAt, windowEnd: pr.endAt } : p
  })
  const [senderStore, setSenderStore] = useState(() => {
    const p = firstSender()
    const st = storeOf(p)
    if (st) return st.code
    if (partyOk(p)) return OTHER_ADDRESS
    return stores.length ? stores[0].code : OTHER_ADDRESS
  })

  /* ---- Ship To (multi-drop) + RTO ---- */
  const [receiver, setReceiver] = useState<Party>(() => saved?.receiver
    ?? (pr ? pr.shipTo ?? blankParty() : jump ? { ...blankParty(), ...db.orders[2]?.receiver } : blankParty()))
  const [drops, setDrops] = useState<Party[]>(() => saved?.drops ?? [])
  const [rto, setRto] = useState<Party>(() => saved?.consignment?.rto ?? blankParty())

  /* ---- consignment fields (+ handling, instructions, RTO mode, VAS, carrier) ---- */
  const [c, setCState] = useState<ConsignmentFields>(() => {
    const qa = jump && !saved ? `QA${Date.now().toString(36).toUpperCase().slice(-8)}` : ''
    return {
      orderNumber: qa, referenceNumber: qa, consignmentNumber: '', exchangeOrderNumber: '',
      consignmentType: 'Forward', task: 'Delivery', shipByDate: today(), tags: [], labelFormat: '',
      paymentMode: '', orderAmount: null,
      schedulingConfirmation: false, dedicateTruck: ftlFirst, totalLoadingTime: null,
      clearanceRequired: false, scannable: false, splittable: false,
      specialInstructions: '', rtoMode: RTO_MODES[0], vas: [],
      carrier: qa && !merchantMode ? (ftlFirst ? CARRIERS[1].code : CARRIERS[0].code) : '',
      category: [],
      ...saved?.consignment,
      ...(saved && !saved.consignment?.vas?.length && saved.additionalServices?.length
        ? { vas: saved.additionalServices.map((sv) => ({ level: 'CONSIGNMENT' as const, skuCode: '', service: sv, serviceTimeMin: 0, remark: '' })) } : {}),
      ...(ftlFirst ? { dedicateTruck: true } : {}),
      ...(fromOverage ? { dedicateTruck: false } : {}),
    }
  })
  const setC = (patch: Partial<ConsignmentFields>) => setCState((x) => ({ ...x, ...patch }))
  const [instructions] = useState(saved?.instructions ?? '')

  /* ---- FTL variant (as AddOrderPage) ---- */
  /* Grow books a full vehicle in its Service Type card (Shared | Full vehicle) — the goods are still entered */
  const isFtl = ftlFirst && !merchantMode
  const [ftlService, setFtlService] = useState(saved?.ftlServiceType || pr?.ftlServiceType || DEFAULT_FTL_SERVICE)
  const [rows, setRows] = useState<VehicleRow[]>(() => {
    if (saved?.shipmentType === 'FTL') return rowsOf(vehiclesOf(saved))
    if (pr?.shipmentType === 'FTL') return rowsOf(vehiclesOf({ vehicleType: pr.vehicleType, vehicleUnit: pr.vehicleUnit, actualLoad: pr.expectedWeightKg, drops: [] }))
    return [{ vehicleType: '8 Ton Truck', count: 1, loadKg: 6400, addressIdx: [0] }]
  })
  const [dedicatedType, setDedicatedType] = useState(() => (saved && saved.shipmentType !== 'FTL' ? saved.vehicles?.[0]?.vehicleType ?? '' : ''))
  const vehicles = useMemo(() => vehiclesOfRows(rows), [rows])

  /* ---- packages ---- */
  const savedParcels = !saved ? null : saved.shipmentType === 'FTL' ? (merchantMode ? saved.sourceParcels ?? null : null) : saved.parcels ?? null
  const [parcels, setParcels] = useState<Parcel[]>(() => {
    if (savedParcels?.length) return savedParcels.map((p) => canonParcel({ ...p, packageId: p.packageId || newPackageId() }))
    const p = newParcel()
    if (merchantMode && jump && !fromOverage) return [{ ...p, weight: 2.5, l: 30, w: 20, h: 15, weightMode: 'manual' }]
    const w = fromOverage?.scan.weightKg
    return [fromOverage ? { ...p, weight: w ?? p.weight, weightMode: w ? 'manual' : 'auto', trackingNumber: fromOverage.scan.barcode } : p]
  })
  /* ---- goods: ITEMS = SKU-based ("Electrolux: ship 10 fridges") — pick SKUs + quantities, the
     SKU master supplies size and weight, the packages are DERIVED; PACKAGES = describe each box.
     A reopened draft is Items when every package is one SKU unit packed as itself. ---- */
  const itemsFromDraft = (): ItemLine[] | null => {
    const ps = savedParcels ?? []
    if (!ps.length) return null
    const asItem = ps.every((p) => {
      const it = p.items?.length === 1 ? p.items[0] : null
      return !!it && !!it.skuCode && it.quantity === 1 && packageValue(p, []) === CUSTOM_PACKAGE
        && p.l === (it.lengthCm ?? 0) && p.w === (it.widthCm ?? 0) && p.h === (it.heightCm ?? 0)
    })
    return asItem ? ps.map((p) => ({ id: p.packageId || newPackageId(), item: canonItem({ ...p.items![0], quantity: p.quantity }) })) : null
  }
  /* the builder's sections decide (Packages hidden = SKU-based) — except an overage scan / the QA shortcut (a package:
     its barcode is the tracking number) and a reopened draft (the shape it was saved in) */
  const [draftShape] = useState<'items' | 'packages' | null>(() => (savedParcels?.length ? (itemsFromDraft() ? 'items' : 'packages') : null))
  const [lines, setLines] = useState<ItemLine[]>(() => itemsFromDraft() ?? [{ id: newPackageId(), item: blankItem() }])
  const useItems = !simple && !isFtl && !fromOverage && !jump && (draftShape ? draftShape === 'items' : pkgOff)
  /* SKUs are asked: the SKU-based list, or each package's SKUs (not when the builder hid them — packages only) */
  const skusAsked = useItems || !skuOff
  /* the builder's "SKU list" (owner, 2026-10-07): the SKUs listed first, then the packages — each package picks the SKUs
     packed in it. Only while both sections are shown; the SKUs still live in their package (Package 1 holds the ones no
     other package picked), so switching the choice never loses one. */
  const separateLayout = layout.skuList === 'separate' && !useItems && !simple && !isFtl && !pkgOff && !skuOff
  /* the SKU-based list's units (owner, 2026-10-06: kg + cm or lb + in) — every line's worked-out package carries them */
  const [itemUnit, setItemUnit] = useState<UnitSrc>(() => {
    const f = savedParcels?.[0] ? canonParcel(savedParcels[0]) : undefined
    return { unitSystem: f?.unitSystem, weightUnit: f?.weightUnit, dimUnit: f?.dimUnit }
  })
  /* owner, 2026-10-05: with several packages ONE is open for editing and the rest fold to one-line rows; past
     PKG_PAGE rows the list stops at "Show all" — 100 packages no longer means 100 cards to scroll past */
  const [openPkgId, setOpenPkgId] = useState<string | null>(null)
  const [allPkgs, setAllPkgs] = useState(false)
  const [allSkus, setAllSkus] = useState(false)
  /* "10 × fridge" = ONE package spec: quantity 10, the SKU's L × W × H, weight = the SKU's (Custom, no
     tare — what reweigh() gives), one SKU unit inside. Parcel.quantity = packages, ParcelItem.quantity = units each. */
  const itemParcels = useMemo<Parcel[]>(() => lines.filter((l) => !isBlankItem(l.item)).map((l) => ({
    ...newParcel(), packageId: l.id, packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME,
    quantity: l.item.quantity, weight: round2(l.item.weightKg), weightMode: 'auto',
    l: l.item.lengthCm ?? 0, w: l.item.widthCm ?? 0, h: l.item.heightCm ?? 0,
    items: [{ ...l.item, quantity: 1 }], itemInfo: l.item.name,
    ...(itemUnit.unitSystem ? { unitSystem: itemUnit.unitSystem } : {}),
    ...(itemUnit.weightUnit ? { weightUnit: itemUnit.weightUnit } : {}),
    ...(itemUnit.dimUnit ? { dimUnit: itemUnit.dimUnit } : {}),
  })), [lines, itemUnit])
  /* THE packages every reader uses — only the mode on screen is validated and saved */
  const goods = useItems ? itemParcels : parcels
  const secure = saved?.secure ?? false
  /* Grow (owner, 2026-10-27, the Grow team's form): the merchant ticks that nothing dangerous is inside */
  const noDg = !merchantMode || !!c.dgDeclared
  const [service, setService] = useState(() => (merchantMode
    /* Grow: no service until the lane's cards are shown (one eligible card is preselected) */
    ? (saved?.shipmentType === 'FTL' ? saved.ftlServiceType || saved.service : saved?.service ?? pr?.ftlServiceType ?? '')
    : saved && saved.shipmentType !== 'FTL' ? saved.service : SERVICES[0].code))

  const fromList = !!senderStore && senderStore !== OTHER_ADDRESS
  const allDrops = [receiver, ...drops]

  /* ---- Grow: the load type, the lane's services + ESTIMATED rates (growOrders/rates), the Ship From hub's fleet ---- */
  /* owner, 2026-09-29: Shared unless it is a full-vehicle booking — the service cards show at once */
  const [mode, setMode] = useState<BookingMode | null>(ftlFirst ? 'ftl' : 'ltl')
  /* Dedicate Truck + Vehicle Details are builder fields on both forms (2026-10-07). Dedicate Truck hidden = nobody is asked:
     every consignment gets the builder's default (shared, unless "Dedicated truck" is picked under "While it is hidden").
     Vehicle Details hidden = the carrier picks the vehicle (one of the hub's vehicles carries the whole load). */
  const truckHidden = !simple && isHidden('dedicateTruck')
  const truckDefault = rules.dedicateTruck?.defaultValue === 'on'
  const vehicleCard = !hid('vehicleDetails')
  const vehiclesAuto = !simple && !editing && isHidden('vehicleDetails')
  const lm: BookingMode = mode ?? 'ltl'
  const laneHub = useMemo(() => shipFromHubOf(fromList ? senderStore : null, sender), [fromList, senderStore, sender])
  const currency = merchantMode ? currencyForHub(laneHub, sender) : CURRENCY
  const weights = chargeableKg(goods)
  const vasNames = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const services = useMemo(() => bookableServices(), [])
  /* Service Type hidden (2026-10-05): the form asks nothing and books the builder's DEFAULT service; a resumed draft, a
     Modify or a pickup request keeps its own. The Simplified tier is not customisable — it always asks. */
  const serviceHidden = !simple && isHidden('serviceType')
  const ruleDefault = rules.serviceType?.defaultValue?.trim() ?? ''
  /** console parcel default: the builder's choice when it is a known service, else Standard */
  const defaultService = SERVICE_TYPES.includes(ruleDefault) ? ruleDefault : SERVICES[0].code
  /** console full vehicle (/new/vehicle): the builder's choice when it is a vehicle service, else Inland FTL */
  const defaultFtl = FTL_SERVICE_CODES.includes(ruleDefault) ? ruleDefault : DEFAULT_FTL_SERVICE
  const ownService = saved && saved.shipmentType !== 'FTL' ? saved.service : ''
  const ownFtl = saved?.ftlServiceType || pr?.ftlServiceType || ''
  /** what the console form books (the field's value, or — hidden — its own / the default) */
  const consoleService = serviceHidden ? ownService || defaultService : service
  const consoleFtl = serviceHidden ? ownFtl || defaultFtl : ftlService
  /** Grow, hidden: its own service if still bookable, else the default, else the first bookable one */
  const ownGrow = (saved ? (saved.shipmentType === 'FTL' ? saved.ftlServiceType || saved.service : saved.service) : '') || pr?.ftlServiceType || ''
  const growDefault = [ownGrow, ruleDefault].find((code) => !!code && services.some((x) => x.code === code)) ?? services[0]?.code ?? ''
  const growService = serviceHidden ? growDefault : service
  const offered = serviceHidden ? services.filter((x) => x.code === growDefault) : services
  /* Grow's Service Type is chosen at checkout (step 2 · Service & payment, owner 2026-10-06) — its card shows only in
     the builder's preview, under "Next step" (hidden: only with "Show hidden fields", faded, so it can be brought back) */
  const growServiceCard = editing && (!serviceHidden || showHidden)
  const laneOk = laneReady(sender) && allDrops.every(laneReady)
  /* the rate needs a weight or a size — unless the builder made the weight optional / hid it (then any package counts) */
  const weightOk = goods.length > 0 && goods.every((p) => packageReady(p) || (p.quantity > 0 && !need('pkgWeight')))
  const ready = laneOk && weightOk
  /* plain (no useMemo): it reads the hidden-service default, which the compiler cannot memoise around */
  const fleet: FleetVehicle[] = (() => {
    if (!merchantMode || !laneHub) return []
    const svcCode = serviceHidden ? growDefault : service
    const ftlCat = FTL_SERVICE_TYPES.find((t) => t.code === svcCode)
    const fits = (name: string) => !ftlCat || ftlCat.vehicles.some((v) => name.startsWith(v))
    let list = hubVehicleTypes(laneHub).filter((v) => fits(v.name))
    if (!list.length) list = vehicleTypesFor(masters.vehicleTypes, laneHub, svcCode || null).filter((v) => fits(v.name))
    if (!list.length && ftlCat) list = vehiclesFor(ftlCat.code).map((v) => ({ code: v.type, name: v.type, payloadKg: v.payloadKg, capacity: v.capacity }))
    const one = (code: string) => (laneReady(sender) && laneReady(receiver) && svcCode
      ? quoteService({ code: svcCode, name: svcCode }, { from: sender, to: receiver, parcels: [], mode: 'ftl', currency, vehicles: [{ vehicleType: code, actualLoadKg: 0, addressIdx: [0] }] }).net
      : vehicleRate(code, currency))
    /* the booking stores the CATALOGUE type ("8 Ton Truck"); the card shows the hub's own name */
    const catalogue = (name: string) => VEHICLE_SPECS.map((x) => x.type).filter((t) => name.startsWith(t)).sort((a, b) => b.length - a.length)[0] ?? name
    const seen = new Set<string>()
    return list.map((v) => ({ ...v, code: catalogue(v.name) })).filter((v) => (seen.has(v.code) ? false : (seen.add(v.code), true)))
      .map((v) => ({ code: v.code, name: v.name, payloadKg: v.payloadKg, capacity: v.capacity, rate: one(v.code) }))
  })()
  const fleetNote = laneHub ? `Vehicles configured at ${hubName(laneHub, stores) || laneHub}. Rates per vehicle for this route.` : ''
  /* owner, 2026-10-06 ("see the other branch's vehicle selection"): a full vehicle is booked in a Vehicle Details card —
     the second branch's table (vehicle type · how many · est. load · deliver to) with the Ship From hub's fleet as the
     types; the console's rows model, so a resumed draft / an FTL pickup request reopens its own vehicles */
  /* plain (no useMemo): the fleet is rebuilt every render */
  const mVehicles: FtlVehicle[] = mode !== 'ftl' ? []
    : vehiclesAuto ? (fleet[0] ? [{ vehicleType: fleet[0].code, actualLoadKg: Math.round(weights.chargeable) || 0, addressIdx: allDrops.map((_, i) => i) }] : [])
    : vehicles.filter((v) => !!v.vehicleType)
  const quotes = !merchantMode || !mode ? [] : !ready
    /* not priced yet: the cards still show, with the service's own transit days and no rate */
    ? quoteLane({ ...zoneParties('local'), parcels: [], mode: lm, currency }, offered)
    : quoteLane({
      from: sender, to: receiver, drops, parcels: goods, mode: lm, currency, vas: vasNames,
      vehicles: mode === 'ftl' ? (mVehicles.length ? mVehicles : fleet.slice(0, 1).map((v) => ({ vehicleType: v.code, actualLoadKg: weights.chargeable, addressIdx: [0] }))) : undefined,
    }, offered)
  /* one eligible service = preselected; a service the lane / mode no longer offers is dropped */
  const selected = !ready ? '' : quotes.some((q) => q.code === growService) ? growService : quotes.length === 1 ? quotes[0].code : ''
  const quote = quotes.find((q) => q.code === selected) ?? null
  /* a vehicle the Ship From hub's fleet does not offer (the hub or the service changed under it) is never "ready" — and a hidden
     Vehicle Details with no fleet at all has nothing to book */
  const inFleet = (code: string) => !merchantMode || fleet.some((f) => f.code === code)
  const ftlOk = mode !== 'ftl' || (vehiclesAuto ? !merchantMode || fleet.length > 0 : (mVehicles.length > 0 && rows.every((r) => !!r.vehicleType && inFleet(r.vehicleType) && r.count >= 1 && r.loadKg > 0 && r.addressIdx.length > 0)
    && allDrops.every((_, i) => mVehicles.some((v) => v.addressIdx.includes(i)))))
  /* Grow step 1: the service is picked at checkout — until then the form shows the lowest rate for this route */
  const cheapest = merchantMode && ready && ftlOk && quotes.length ? Math.min(...quotes.map((q) => q.net)) : null
  /* a new load type keeps the chosen service — every service is offered in both modes (2026-09-29), and `selected`
     drops one the new list does not offer; switching a full vehicle on starts its Vehicle Details with the hub's first
     vehicle carrying the whole load to every Ship To address */
  const changeMode = (m: BookingMode) => {
    if (merchantMode && m === 'ftl' && mode !== 'ftl') {
      setRows([{ vehicleType: fitVehicle(fleet, weights.chargeable)?.code ?? '', count: 1, loadKg: Math.round(weights.chargeable) || 0, addressIdx: allDrops.map((_, i) => i) }])
    }
    setMode(m); setC({ dedicateTruck: m === 'ftl' })
  }
  /* the fleet moved (Ship From, the service): rows on a vehicle it no longer offers take the one that FITS the load */
  const fleetKey = fleet.map((f) => f.code).join('|')
  useEffect(() => {
    if (!merchantMode || mode !== 'ftl' || !fleet.length) return
    if (rows.every((r) => fleet.some((f) => f.code === r.vehicleType))) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeding the rows to the new fleet
    setRows((rs) => rs.map((r) => (fleet.some((f) => f.code === r.vehicleType) ? r : { ...r, vehicleType: fitVehicle(fleet, Math.max(r.loadKg, weights.chargeable))?.code ?? fleet[0].code })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetKey, mode, merchantMode])
  /* Grow, Dedicate Truck hidden: the builder's default load type — unless the order is a full vehicle by where it came
     from (an FTL pickup request, a draft, /add/vehicle) or it answers an overage scan */
  const forcedMode: BookingMode | null = merchantMode && truckHidden && !fromOverage && !ftlFirst ? (truckDefault ? 'ftl' : 'ltl') : null
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the builder's rule (a hidden field's default)
    if (forcedMode && mode !== forcedMode) changeMode(forcedMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- changeMode reads the fleet at that moment
  }, [forcedMode, mode])

  /* ---- Grow: the pickup module decides the pickup window (owner, 2026-09-25): off → none · manual → optional
     ("schedule later") · auto + ask the shipper → required · auto without asking → the computed booking is shown ---- */
  const pickupCfg = usePickupModuleConfig()
  const pickupState: 'off' | 'manual' | 'auto-ask' | 'auto-rule' = !merchantMode || !pickupCfg.enabled ? 'off'
    : pickupCfg.mode !== 'auto' ? 'manual' : pickupCfg.autoPickup.userSelectsWindow ? 'auto-ask' : 'auto-rule'
  const askWindow = pickupState === 'auto-ask'
  const pickupPol = useMemo(() => pickupPolicy(merchantCode, {
    pickupLocationCode: fromList ? senderStore : null, hubCode: laneReady(receiver) ? inboundHubFor(receiver) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pickupCfg: re-read when the module settings change
  }), [merchantCode, fromList, senderStore, receiver.city, receiver.state, pickupCfg])
  const slotOk = useMemo(() => {
    const check = policyCheck(pickupPol)
    const now = new Date()
    return (w: { startAt: string; endAt: string }) => slotWindowOk(w.startAt, w.endAt) && check(w)
      && (!askWindow || !userWindowError(w.startAt, now, pickupPol, pickupCfg.autoPickup))
  }, [pickupPol, askWindow, pickupCfg.autoPickup])
  const windowErr = askWindow && sender.windowStart ? userWindowError(sender.windowStart, new Date(), pickupPol, pickupCfg.autoPickup) : null
  const hasWindow = filled(sender.windowStart) && filled(sender.windowEnd)
  const autoWin = useMemo(() => (pickupState === 'auto-rule'
    ? autoPickupWindowFor(new Date(), pickupPol, pickupCfg.autoPickup, null) : null), [pickupState, pickupPol, pickupCfg.autoPickup])
  const autoRuleText = pickupCfg.autoPickup.dateRule === 'same-day' ? `same day, before ${pickupCfg.sameDayCutoff}`
    : pickupCfg.autoPickup.dateRule === 'days-after-order'
      ? `${pickupCfg.autoPickup.daysAfterOrder} day${pickupCfg.autoPickup.daysAfterOrder === 1 ? '' : 's'} after the order is created`
      : 'next business day'


  const fromPr = pr && isFtl ? pr : undefined
  const serviceLoad = useMemo(() => loadTypeOf(service), [service])
  const dedicatedLocked = serviceLoad !== 'both'
  const dedicated = !isFtl && (serviceLoad === 'ftl' || (serviceLoad === 'both' && (truckHidden ? truckDefault : !!c.dedicateTruck)))
  const parcelLoadKg = goods.reduce((n, p) => n + (p.weight || 0) * (p.quantity || 0), 0)
  const shipFromHub = useMemo(() => {
    if (senderStore && senderStore !== OTHER_ADDRESS) {
      return INBOUND_HUBS.some((h) => h.code === senderStore) ? senderStore : hubOf(sender)
    }
    return filled(sender.city) || filled(sender.state) ? hubOf(sender) : null
  }, [senderStore, sender])
  /* ---- the route: each end is a customer address or a facility (a hub code), every customer is served by
     a hub (hubOf) — shipmentLegs.routeOf turns the two ends + the stop switches into legs + a movement type.
     The switches belong to one pair of ends: a new pair starts with every stop on. ---- */
  const ctype = TYPE_RULES[c.consignmentType ?? 'Forward'] ? (c.consignmentType ?? 'Forward') : 'Forward'
  const typeRule = TYPE_RULES[ctype]
  /** Grow's payment (2026-10-07: asked on step 1, in its own Payment card): Prepaid unless COD is chosen */
  const growPayMode: 'Prepaid' | 'COD' = typeRule.payment && c.paymentMode === 'COD' ? 'COD' : 'Prepaid'
  const codAsked = merchantMode && growPayMode === 'COD' && !isHidden('paymentMode') && !isHidden('orderAmount')
  /* any address typed on the form (the card's caption says so) */
  const anyInline = inlineOf('from') || inlineOf('to') || (typeRule.rto && c.rtoMode === RTO_MODES[1] && inlineOf('rto'))
  /* owner, 2026-10-06: Ship From | Ship To side by side (default — Saved card or Fields on form, both portals; they stack
     only when the card itself is narrow) or one under the other (the builder's Layout). The Simplified tier keeps its own. */
  /* Grow (owner, 2026-10-27): Ship From and Ship To are two cards, each the full width */
  const stackAddr = !simple && (growLook || layout.addresses === 'stack')
  const endOf = (p: Party, code?: string): RouteEnd => {
    const lc = code ?? p.locationCode ?? ''
    if (HUB_CODES.has(lc)) return { kind: 'facility', hub: lc }
    return { kind: 'customer', hub: filled(p.city) || filled(p.state) ? hubOf(p) : null }
  }
  const fromEnd = endOf(sender, fromList ? senderStore : undefined)
  const toEnd = endOf(receiver)
  /* ---- Shipment legs = the user's CHOICE (owner, 2026-09-29: the "Legs to be created" design): Via hub + First
     Mile · Line Haul · Last Mile, or Pick & Del (one trip, no hub) — the eight movement types. The legs decide what each end
     is: First Mile on = Ship From is an address (merchant / customer), off = a hub; Last Mile likewise for Ship To.
     Line Haul follows the two ends' hubs until someone sets it. A Transfer is Line Haul only. ---- */
  /* null = follows the chosen address (FM / LM: an address = on, a hub = off; LH: the two hubs differ) until someone sets it */
  const [legChoice, setLegChoice] = useState<{ mode: LegChoice['mode']; fm: boolean | null; lm: boolean | null; lh: boolean | null }>(() => {
    const m = saved?.consignment?.movementType
    if (m && (MOVEMENT_TYPES as readonly string[]).includes(m)) { const l = legsOfMovement(m as MovementType); return { ...l, lh: l.mode === 'hub' ? l.lh : null } }
    return { mode: 'hub', fm: null, lm: null, lh: null }
  })
  const isTransfer = ctype === 'Transfer'
  const legsDirect = !isTransfer && legChoice.mode === 'direct'
  const legFm = !isTransfer && !legsDirect && (legChoice.fm ?? fromEnd.kind !== 'facility')
  const legLm = !isTransfer && !legsDirect && (legChoice.lm ?? toEnd.kind !== 'facility')
  const originHub = fromEnd.hub
  const destHub = toEnd.hub
  const hubsDiffer = !!originHub && !!destHub && originHub !== destHub
  /* auto: hub → hub always hauls; otherwise only when the two ends are served by different hubs */
  const lhAuto = !(legFm || legLm) || hubsDiffer
  const legLh = !legsDirect && (isTransfer || (legChoice.lh ?? lhAuto))
  const legs: LegChoice = { mode: legsDirect ? 'direct' : 'hub', fm: legFm, lh: legLh, lm: legLm }
  const legList = legsOf(legs)
  const movementType = movementOfLegs(legs)
  /* what each end must be under these legs */
  const fromIsAddress = legsDirect || legFm
  const toIsAddress = legsDirect || legLm
  const hasAddr = (p: Party) => filled(p.name) || filled(p.line1) || filled(p.city)
  /* a leg SET by hand (or Direct) narrows its end's picker to the matching kind; a following leg leaves both kinds open */
  const fromRestricted = legsDirect || legChoice.fm !== null
  const toRestricted = legsDirect || legChoice.lm !== null
  const fromKindBad = !merchantMode && !isTransfer && fromRestricted && hasAddr(sender) && (fromEnd.kind === 'facility') === fromIsAddress
  const toKindBad = !merchantMode && !isTransfer && toRestricted && hasAddr(receiver) && (toEnd.kind === 'facility') === toIsAddress
  const sameHubBothEnds = !legFm && !legLm && !legsDirect && fromEnd.kind === 'facility' && toEnd.kind === 'facility' && fromEnd.hub === toEnd.hub && !!fromEnd.hub
  /* a Transfer moves between two facilities */
  const transferOk = ctype !== 'Transfer' || (fromEnd.kind === 'facility' && toEnd.kind === 'facility')
  const hubVehicles = vehicleTypesFor(masters.vehicleTypes, shipFromHub)
  const vehicleChoice = hubVehicles.some((v) => v.code === dedicatedType) ? dedicatedType : ''
  const vehicleOpts = vehicleTypesFor(masters.vehicleTypes, shipFromHub, isFtl ? consoleFtl : null)
  /* a hidden Service Type never runs pickFtlService — fit the vehicle rows to the default service's vehicles here */
  useEffect(() => {
    if (!isFtl || !serviceHidden || !vehicleOpts.length) return
    const ok = (t: string) => vehicleOpts.some((v) => v.code === t)
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- synchronising with the masters + the builder's default */
    setRows((rs) => (rs.every((r) => ok(r.vehicleType)) ? rs : rs.map((r) => (ok(r.vehicleType) ? r : { ...r, vehicleType: vehicleOpts[0].code }))))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vehicleOpts is derived from these
  }, [isFtl, serviceHidden, consoleFtl, masters.vehicleTypes, shipFromHub])
  const payloadOf = (type: string) => vehicleTypeOf(masters.vehicleTypes, type)?.payloadKg ?? 0
  const units = vehicles.length
  const vehicleType = vehicles[0]?.vehicleType ?? ''
  const actualLoad = totalLoadKg(vehicles)
  const addServices = (c.vas ?? []).map((v) => v.service).filter(Boolean)
  const vasTotal = addServices.reduce((n, sv) => n + vasPrice(sv), 0)
  const parcelSvc = SERVICES.find((s) => s.code === consoleService) ?? { ...SERVICES[0], code: consoleService || SERVICES[0].code }
  const svc = isFtl
    ? { code: consoleFtl, days: ftlServiceType(consoleFtl).days, price: ftlQuoteVehicles(vehicles, drops.length, addServices) }
    : { ...parcelSvc, price: parcelSvc.price + vasTotal }
  const addressOptions = allDrops.map((d, i) => ({ value: String(i), label: `Address ${i + 1}${d.name ? ` · ${d.name}` : ''}${d.city ? `, ${d.city}` : ''}` }))
  const uncovered = allDrops.map((_, i) => i).filter((i) => !vehicles.some((v) => v.addressIdx.includes(i)))
  const skuLines = goods.flatMap((p, i) => (p.items ?? []).map((it, k) => ({ it, i, k })))
  const skuLineOpts = useMemo(() => {
    const seen = new Set<string>()
    return goods.flatMap((p) => p.items ?? []).filter((it) => !isBlankItem(it))
      .map((it) => ({ value: it.skuCode ?? it.name.trim(), label: it.skuCode ? `${it.skuCode} · ${it.name}` : it.name.trim() }))
      .filter((o) => (seen.has(o.value) ? false : (seen.add(o.value), true)))
  }, [goods])

  /* ---- identifiers: the account's identifier setting (Order / Reference / both) ---- */
  /* the Simplified form asks one number; the reference copies it (the original's rule) */
  /* 2026-10-07: Reference Number can be hidden (it then copies the Order Number) or optional (blank = the Order Number) */
  const refHidden = !simple && isHidden('referenceNumber')
  const idPref = simple || refHidden ? 'orderNumber' : behavior.identifier
  const effectiveOrder = (idPref === 'referenceNumber' ? c.referenceNumber : c.orderNumber) ?? ''
  const effectiveRef = (idPref === 'orderNumber' ? c.orderNumber : filled(c.referenceNumber) ? c.referenceNumber : c.orderNumber) ?? ''
  /* the Reference Number must be typed: required by the builder, or the only identifier shown */
  const refRequired = idPref === 'referenceNumber' || need('referenceNumber')

  /* ------------------------------------------------ completion + validation
     = AddOrderPage's Regular required set + the builder's "required" rules (only for shown fields) */
  const needOk = (k: string, ok: boolean) => (need(k) ? [ok] : [])
  /* a package's weight (required while shown — the default) and, when the builder asks for it, a Custom package's size */
  const needW = need('pkgWeight')
  const dimsOkOf = (p: Parcel) => !need('pkgDimensions') || packageValue(p, packageTypes) !== CUSTOM_PACKAGE || (p.l > 0 && p.w > 0 && p.h > 0)
  const str = (v: unknown) => (v == null ? '' : String(v))
  /* the account's own fields in a card (2026-10-05): Required + Format */
  const customReq = (card: CustomFieldCard) => customDefs.filter((d) => d.card === card)
    .flatMap((d) => [...needOk(d.key, filled(cfv[d.key])), fmtOk(d.key, cfv[d.key])])
  /* a hidden Ship By Date (Grow) is today — never a check the merchant cannot see */
  const consignmentReq = [filled(effectiveOrder), filled(effectiveRef), ...(refRequired && idPref === 'both' ? [filled(c.referenceNumber)] : []),
    !!c.consignmentType, filled(c.shipByDate) || isHidden('shipByDate'),
    /* Merchant hidden / optional: the signed-in (first) merchant is recorded */
    ...(merchantMode || !need('merchant') ? [] : [!!merchant]),
    ...needOk('consignmentNumber', filled(c.consignmentNumber)),
    /* an Exchange names the order it exchanges (owner, 2026-09-29: fields follow the type) */
    ...(!simple && ctype === 'Exchange' && !hid('exchangeOrderNumber') ? [filled(c.exchangeOrderNumber)] : []),
    /* Simplified: the delivery Start / End time on the Ship By Date are required (the original's rule) */
    ...(simple ? [filled(timeOf(receiver.windowStart)), filled(timeOf(receiver.windowEnd))] : []),
    ...(typeRule.payment && !merchantMode ? [...needOk('paymentMode', !!c.paymentMode), ...needOk('orderAmount', (c.orderAmount ?? 0) > 0)] : []),
    ...(typeRule.payment && merchantMode ? needOk('orderAmount', (c.orderAmount ?? 0) > 0) : []),
    /* Format rules on the numbers as typed (a copied identifier is checked where it is typed) */
    ...(idPref !== 'referenceNumber' ? [fmtOk('orderNumber', c.orderNumber)] : []),
    ...(idPref !== 'orderNumber' ? [fmtOk('referenceNumber', c.referenceNumber)] : []),
    fmtOk('consignmentNumber', c.consignmentNumber),
    ...(ctype === 'Exchange' ? [fmtOk('exchangeOrderNumber', c.exchangeOrderNumber)] : []),
    ...customReq('sec-consignment'),
  ]
  /** what an address still misses, in words (the card says it) — base required + the builder's rules */
  /* the Ship To / return address's Contact Number: required while shown (the default); the builder can hide it or make it optional */
  const contactReq = simple || need('addrContact')
  const missingOf = (p: Party, role: 'from' | 'to' | 'rto'): string[] => {
    if (role !== 'rto' && (role === 'from' ? fromEnd.kind === 'facility' : HUB_CODES.has(p.locationCode ?? ''))) return []
    const out: string[] = []
    const add = (ok: boolean, label: string) => { if (!ok) out.push(label) }
    add(filled(p.name), role === 'to' ? 'Customer Name' : 'Sender Name')
    if (role !== 'from' && contactReq) add(filled(p.contactNumber), lbl('addrContact'))
    add(filled(p.line1), lbl('addrLine1')); add(filled(p.country), lbl('addrCountry')); add(filled(p.state), lbl('addrState')); add(filled(p.city), lbl('addrCity'))
    if ((role === 'rto' && !isHidden('addrPostal')) || need('addrPostal')) add(filled(p.postalCode), lbl('addrPostal'))
    if (need('addrEmail')) add(filled(p.email), lbl('addrEmail'))
    if (need('addrCompanyName')) add(filled(p.businessName), lbl('addrCompanyName'))
    if (need('addrLines23')) add(filled(p.line2), 'Address Line 2')
    if (need('addrLandmark')) add(filled(p.landmark), lbl('addrLandmark'))
    if (need('addrSuburb')) add(filled(p.county), lbl('addrSuburb'))
    if (role !== 'rto' && need('addrCoordinates')) add(filled(str(p.latitude)) && filled(str(p.longitude)), 'Latitude & Longitude')
    if (role !== 'rto' && need('addrFloorLift')) add(filled(str(p.floorNumber)), 'Floor Number')
    return out
  }
  /** what an address has typed in the wrong format (the builder's Format rules) — the card says it */
  const invalidOf = (p: Party, role: 'from' | 'to' | 'rto'): string[] => {
    if (role !== 'rto' && (role === 'from' ? fromEnd.kind === 'facility' : HUB_CODES.has(p.locationCode ?? ''))) return []
    const typed: [string, string | undefined][] = [['addrCompanyName', p.businessName], ['addrEmail', p.email],
      ['addrLandmark', p.landmark], ['addrSuburb', p.county], ['addrContact', p.contactNumber]]
    return typed.filter(([k, v]) => !fmtOk(k, v)).map(([k]) => lbl(k))
  }
  /* the pickup / delivery window lives on the card, not in the address */
  const windowOk = (p: Party) => !need('addrWindow') || (filled(p.windowStart) && filled(p.windowEnd))
  const fromReq = [missingOf(sender, 'from').length === 0, invalidOf(sender, 'from').length === 0,
    /* Grow: the pickup window follows the pickup module (asked only when manual, required when auto asks) */
    ...(!merchantMode || pickupState === 'manual' ? [windowOk(sender)] : []), ...(askWindow ? [hasWindow, !windowErr] : [])]
  const toReq = allDrops.flatMap((d) => [missingOf(d, 'to').length === 0, invalidOf(d, 'to').length === 0, windowOk(d)])
  const rtoReq = simple || !typeRule.rto || c.rtoMode === RTO_MODES[0] ? [true] : [missingOf(rto, 'rto').length === 0, invalidOf(rto, 'rto').length === 0]
  /* the two ends must make a route (not the same hub twice; a Transfer = two facilities) */
  const routeReq = merchantMode ? [] : [legList.length > 0, transferOk, !sameHubBothEnds, !fromKindBad, !toKindBad]
  const pieceReq = isFtl
    ? [!!consoleFtl, vehicles.length > 0, uncovered.length === 0,
      ...rows.map((r) => !!r.vehicleType && r.count >= 1 && r.loadKg > 0 && r.addressIdx.length > 0), noDg]
    : [...goods.map((p) => p.quantity > 0 && (simple || !needW || p.weight > 0)), noDg,
      /* package-level rules apply where packages are typed (Items mode derives them) */
      ...(useItems ? [] : parcels.flatMap((p) => [...needOk('pkgTracking', filled(p.trackingNumber)), dimsOkOf(p),
        ...needOk('pkgPalletSpace', filled(p.palletSpace)), ...needOk('pkgDescription', filled(p.description)),
        fmtOk('pkgTracking', p.trackingNumber), fmtOk('pkgPalletSpace', p.palletSpace), fmtOk('pkgDescription', p.description)]))]
  /* 2026-10-07: a SKU's weight and size are required while shown (the default) — the builder can hide them or make them optional */
  const skuLineOk = (it: ParcelItem) => !!it.skuCode && filled(it.name) && it.quantity >= 1 && (!need('skuWeight') || it.weightKg > 0)
    && (!need('skuDimensions') || ((it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0))
  const skuRuleOk = (it: ParcelItem) => [...needOk('skuCategory', filled(it.category)), ...needOk('skuDescription', filled(it.description)),
    ...needOk('skuHsn', filled(it.hsnCode)), ...needOk('skuOrigin', filled(it.originCountry)), ...needOk('skuImage', filled(it.imageUrl)), ...needOk('skuUnitCost', (it.unitCost ?? 0) > 0),
    fmtOk('skuDescription', it.description), fmtOk('skuHsn', it.hsnCode), fmtOk('skuImage', it.imageUrl)].every(Boolean)
  /* Simplified asks a SKU's code / name only; with the SKUs hidden (packages only) a draft's SKUs are kept, not checked */
  const skuReq = isFtl || (!simple && !skusAsked) ? [] : skuLines.map(({ it }) => (simple ? isBlankItem(it) || filled(it.name) : skuLineOk(it) && skuRuleOk(it)))
  /** one package is complete — its own fields and its SKU lines. A folded package row says "Incomplete" after an Add
      attempt, and the first incomplete one opens. */
  const pkgOk = (p: Parcel) => p.quantity > 0 && (!needW || p.weight > 0) && dimsOkOf(p)
    && [...needOk('pkgTracking', filled(p.trackingNumber)), ...needOk('pkgPalletSpace', filled(p.palletSpace)), ...needOk('pkgDescription', filled(p.description)),
      fmtOk('pkgTracking', p.trackingNumber), fmtOk('pkgPalletSpace', p.palletSpace), fmtOk('pkgDescription', p.description)].every(Boolean)
    && (!skusAsked || (p.items ?? []).every((it) => skuLineOk(it) && skuRuleOk(it)))
  const vasReq = simple || isHidden('vas') ? [] : (c.vas ?? []).map(vasOk)
  /* Items mode needs at least one SKU picked (a blank line is ignored) */
  const goodsReq = useItems && !typeRule.goodsOptional ? [itemParcels.length > 0] : []
  const carrierReq = merchantMode ? [] : needOk('carrier', !!c.carrier)
  /* owner, 2026-09-29: Vehicle Type is optional; Service Type is required */
  const vehicleReq: boolean[] = []
  const serviceReq = merchantMode
    /* Grow step 1: a load type, a priced route (addresses + weights), at least one bookable service and (full vehicle)
       the vehicles — the service itself is chosen at checkout */
    ? [!!mode, ready, quotes.length > 0, ftlOk]
    : [...vehicleReq, !!(isFtl ? consoleFtl : consoleService), ...needOk('labelFormat', !!c.labelFormat),
      ...needOk('totalLoadingTime', (c.totalLoadingTime ?? 0) > 0)]
  const handlingReq = [...needOk('tags', (c.tags ?? []).length > 0), ...customReq('sec-handling')]
  /* no Payment card on Grow any more (2026-10-07) and none on the console: nothing here to require */
  const paymentReq: boolean[] = []
  const instrReq = [...needOk('specialInstructions', filled(c.specialInstructions)), fmtOk('specialInstructions', c.specialInstructions),
    /* Grow asks Label Format in its Handling & Instructions card */
    ...(merchantMode ? needOk('labelFormat', !!c.labelFormat) : []),
    ...customReq('sec-service')]
  const extrasReq = [...vasReq, ...instrReq]
  /* Grow is ONE page (owner, 2026-10-27, the Grow team's form): the service and HOW it is paid are asked on the form,
     and Create Consignment places the order (`placeGrowOrder` — the same placement the old checkout step used) */
  const growQuote = merchantMode ? quotes.find((q) => q.code === selected) ?? null : null
  const growRate = growQuote?.net ?? 0
  const growTax = taxOf(growRate, currency)
  const growPayable = Math.round((growRate + growTax) * 100) / 100
  const pay = useSplitPayment({ amount: growPayable, currency, allowCod: merchantMode && typeRule.payment && c.paymentMode === 'COD' })
  const payReq = merchantMode && !editing ? [!!growQuote, !!growQuote && pay.choice.ready] : []
  const allReq = [...consignmentReq, ...serviceReq, ...fromReq, ...toReq, ...rtoReq, ...routeReq, ...goodsReq, ...pieceReq, ...skuReq,
    ...handlingReq, ...extrasReq, ...carrierReq, ...paymentReq, ...payReq]
  const filledCount = allReq.filter(Boolean).length
  const canSubmit = filledCount === allReq.length
  const missingCount = allReq.length - filledCount
  const done = (xs: boolean[]) => xs.every(Boolean)

  /* ------------------------------------------------------------ mutations */
  const setParcel = (i: number, patch: Partial<Parcel>) => setParcels((ps) => ps.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const setRow = (i: number, patch: Partial<VehicleRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addVehicle = () => setRows((rs) => [...rs, {
    vehicleType: rs[rs.length - 1]?.vehicleType || (merchantMode ? fleet[0]?.code : vehicleOpts[0]?.code) || '', count: 1, loadKg: 0, addressIdx: uncovered,
  }])
  const removeVehicle = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i))
  const pickFtlService = (code: string) => {
    setFtlService(code)
    const allowed = vehicleTypesFor(masters.vehicleTypes, shipFromHub, code)
    setRows((rs) => rs.map((r) => ({ ...r, vehicleType: allowed.some((v) => v.code === r.vehicleType) ? r.vehicleType : allowed[0]?.code ?? '' })))
  }
  /* a vehicle is chosen only for a dedicated truck — switching it off drops the choice (owner, 2026-10-06) */
  const setDedicateTruck = (on: boolean) => { setC({ dedicateTruck: on }); if (!on) setDedicatedType('') }
  const setDrop = (i: number, patch: Partial<Party>) => setDrops((ds) => ds.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const removeDrop = (i: number) => {
    const idx = i + 1
    setDrops((ds) => ds.filter((_, j) => j !== i))
    setRows((rs) => rs.map((r) => ({ ...r, addressIdx: r.addressIdx.filter((a) => a !== idx).map((a) => (a > idx ? a - 1 : a)) })))
  }
  const pickPackageType = (i: number, code: string) => {
    const t = packageTypes.find((x) => x.code === code)
    setParcels((ps) => ps.map((x, j) => (j === i ? reweigh(t
      ? { ...x, packageTypeCode: t.code, packageTypeName: t.name, l: t.lengthCm, w: t.widthCm, h: t.heightCm }
      : { ...x, packageTypeCode: CUSTOM_PACKAGE, packageTypeName: CUSTOM_PACKAGE_NAME }, packageTypes) : x)))
  }
  const setItems = (i: number, f: (items: ParcelItem[]) => ParcelItem[]) =>
    setParcels((ps) => ps.map((x, j) => (j === i ? reweigh({ ...x, items: f(x.items ?? []) }, packageTypes) : x)))
  const [focusLine, setFocusLine] = useState<{ i: number; k: number } | null>(null)
  const addItem = (i: number) => {
    setFocusLine({ i, k: (parcels[i].items ?? []).length })
    /* separate list: a new line takes the next number in the SKU list */
    const top = parcels.flatMap((p) => p.items ?? []).reduce((n, it, idx) => Math.max(n, it.lineNo ?? idx + 1), 0)
    setItems(i, (items) => [...items, separateLayout ? { ...blankItem(), lineNo: top + 1 } : blankItem()])
  }
  /** line `k` of package `i`, created blank when a row edits a SKU that is not there yet (the Simplified table) */
  const padTo = (items: ParcelItem[], k: number) => (items.length > k ? items : [...items, ...Array.from({ length: k + 1 - items.length }, blankItem)])
  const pickSku = (i: number, k: number, s: SkuItem) =>
    setItems(i, (items) => padTo(items, k).map((it, m) => (m === k ? {
      ...it, skuCode: s.code, name: s.name, weightKg: s.weightKg, weightUom: 'KG', hsnCode: s.hsnCode, originCountry: s.originCountry,
      category: it.category || s.category, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm, dimUom: 'CM',
      quantity: it.quantity || 1, ...(s.unitCost ? { unitCost: s.unitCost } : {}),
    } : it)))
  const setItem = (i: number, k: number, patch: Partial<ParcelItem>) =>
    setItems(i, (items) => padTo(items, k).map((it, m) => (m === k ? { ...it, ...patch } : it)))
  const removeItem = (i: number, k: number) => setItems(i, (items) => items.filter((_, m) => m !== k))
  /** "SKUs in this package" (separate list — the PACKAGE picks its SKUs): package `j` holds exactly `want`; a SKU taken
      out of it goes back to the first package, which holds every SKU not put in another one. Every line keeps its number
      in the SKU list. */
  const packInto = (j: number, want: ParcelItem[]) => setParcels((ps) => {
    const num = new Map(sepSort(ps.flatMap((p) => p.items ?? []), (it) => it).map((it, n) => [it, n + 1]))
    const wantSet = new Set(want)
    const mine = ps[j]?.items ?? []
    const items = ps.map((p, idx) => (p.items ?? []).filter((it) => (idx === j ? wantSet.has(it) || isBlankItem(it) : !wantSet.has(it))))
    items[j] = [...items[j], ...want.filter((it) => !mine.includes(it))]
    if (j !== 0) items[0] = [...items[0], ...mine.filter((it) => !isBlankItem(it) && !wantSet.has(it))]
    return ps.map((p, idx) => reweigh({ ...p, items: items[idx].map((it) => ({ ...it, lineNo: num.get(it) })) }, packageTypes))
  })
  /** "Barcode on every box" — ONE question at the top of Package & SKU (owner, 2026-10-06: "in the section top, not on
      every package — ask this, and based on it…"): on = every package line is ONE box with its own barcode (its quantity
      stays 1; a line of N boxes becomes N lines, one per box); off = boxes of a spec are counted again */
  const setBarcodeAll = (on: boolean) => {
    setC({ scannable: on })
    if (useItems || isFtl) return
    if (!on) { setParcels((ps) => ps.map((p) => ({ ...p, barcodeEach: false }))); return }
    const boxes = parcels.reduce((n, p) => n + Math.max(1, p.quantity || 1), 0)
    if (boxes === parcels.length) { setParcels((ps) => ps.map((p) => ({ ...p, barcodeEach: true, quantity: 1 }))); return }
    if (boxes > 200) {
      setParcels((ps) => ps.map((p) => ({ ...p, barcodeEach: true, quantity: 1 })))
      toast.info(`Every package set to one box — add the other ${boxes - parcels.length} with Duplicate`)
      return
    }
    setParcels(parcels.flatMap((p) => {
      const one: Parcel = { ...p, barcodeEach: true, quantity: 1 }
      return [one, ...Array.from({ length: Math.max(1, p.quantity || 1) - 1 }, (): Parcel => ({ ...one, packageId: newPackageId(), trackingNumber: '',
        items: separateLayout ? [] : (p.items ?? []).map((it) => ({ ...it })) }))]
    }))
    setOpenPkgId(null)
    toast.success(`${boxes} boxes, one line each — every box gets its own barcode`)
  }
  /** remove a package — with the SKUs packed in it; in the separate list they stay (they move to the first package) */
  const removeParcel = (i: number) => setParcels((ps) => {
    if (ps.length <= 1) return ps
    const orphans = (ps[i].items ?? []).filter((it) => !isBlankItem(it))
    const rest = ps.filter((_, j) => j !== i)
    if (separateLayout && orphans.length) rest[0] = reweigh({ ...rest[0], items: [...(rest[0].items ?? []), ...orphans] }, packageTypes)
    return rest
  })
  const setLine = (id: string, patch: Partial<ParcelItem>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, item: { ...l.item, ...patch } } : l)))
  const pickLineSku = (id: string, s: SkuItem) => setLine(id, {
    skuCode: s.code, name: s.name, weightKg: s.weightKg, weightUom: 'KG', hsnCode: s.hsnCode, originCountry: s.originCountry,
    category: s.category, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm, dimUom: 'CM',
    ...(s.unitCost ? { unitCost: s.unitCost } : {}),
  })
  const [focusItem, setFocusItem] = useState<string | null>(null)
  const addLine = () => { const id = newPackageId(); setFocusItem(id); setLines((ls) => [...ls, { id, item: blankItem() }]) }
  const removeLine = (id: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.id !== id) : [{ id: newPackageId(), item: blankItem() }]))
  const setVas = (i: number, patch: Partial<VasLine>) => setC({ vas: (c.vas ?? []).map((v, j) => (j === i ? { ...v, ...patch } : v)) })

  const pickSender = (code: string) => {
    if (code === OTHER_ADDRESS) {
      setSenderStore(OTHER_ADDRESS)
      setSender((s) => (storeOf(s) ? blankParty() : s))
      return
    }
    const st = stores.find((s) => s.code === code) ?? db.stores.find((s) => s.code === code)
    if (!st) return
    setSenderStore(code)
    setSender({ ...st.party, locationCode: code })
  }
  const senderOptions = useMemo(() => {
    if (!senderStore || senderStore === OTHER_ADDRESS
      || pickup.options.some((o) => o.value === senderStore)) return pickup.options
    const st = db.stores.find((x) => x.code === senderStore)
    return [{ value: senderStore, label: st ? storeOptionLabel(st) : senderStore }, ...pickup.options]
  }, [pickup.options, senderStore, db.stores])

  /* the masters resolve after mount and Merchant can change: re-default Ship From when the LIST changes */
  const listKey = useMemo(() => pickup.options.map((o) => o.value).join('|'), [pickup.options])
  const [autoKey, setAutoKey] = useState<string | null>(null)
  const dictated = !!(saved || pr || fromOverage)
  useEffect(() => {
    if (dictated || autoKey === listKey) return
    const next = stores[0]
    /* eslint-disable react-hooks/set-state-in-effect -- synchronising with the external masters store */
    setAutoKey(listKey)
    setSenderStore(next?.code ?? OTHER_ADDRESS)
    setSender(next ? { ...next.party, locationCode: next.code } : blankParty())
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [dictated, listKey, autoKey, stores])

  /* the Grow form's preview leaves a merchant's session draft alone */
  useEffect(() => { if (!growSetup) clearDraftKeys() }, [growSetup])
  const jumpTarget = jump === 1 ? (isFtl ? 'sec-vehicle' : 'sec-packages') : jump === 2
    ? (merchantMode ? (growServiceCard ? 'sec-svctype' : 'sec-handling') : 'sec-carrier') : null
  useEffect(() => {
    if (!jumpTarget) return
    const t = setTimeout(() => document.getElementById(jumpTarget)?.scrollIntoView({ block: 'start' }), 150)
    return () => clearTimeout(t)
  }, [jumpTarget])

  /* a Reverse collects from the customer — its pickup point is that address, never a merchant store */
  const draftStoreCode = fromList ? senderStore : ctype === 'Reverse' ? codeFor(sender)
    : pr?.storeCode ?? saved?.storeCode ?? stores[0]?.code ?? codeFor(sender)

  /* the account's own fields, as asked on this form — a snapshot with their labels (the views read it) */
  const customAnswers = (): CustomFieldValue[] => {
    const asked = customDefs.filter((d) => !isHidden(d.key))
    /* an answer this form does not ask (the field was hidden or removed since) is kept as it was saved */
    const kept = (saved?.consignment?.customFields ?? []).filter((f) => !asked.some((d) => d.key === f.key))
    return [...asked.filter((d) => filled(cfv[d.key])).map((d) => ({ key: d.key, label: lbl(d.key), value: cfv[d.key].trim(), kind: d.kind })), ...kept]
  }

  /* the SAME OrderDraft AddOrderPage's Regular tier builds */
  const buildDraft = (): OrderDraft => ({
    orderId: draftId ?? undefined,
    storeCode: draftStoreCode,
    sender: fromList ? { ...sender, locationCode: senderStore } : sender,
    receiver, drops, shipmentType: isFtl ? 'FTL' : 'Parcel',
    ...(isFtl
      ? { vehicleType, vehicleUnit: units, actualLoad, ftlServiceType: consoleFtl, vehicles }
      : dedicated && vehicleChoice
        ? { vehicleType: vehicleChoice, vehicleUnit: 1, actualLoad: parcelLoadKg, vehicles: [{ vehicleType: vehicleChoice, actualLoadKg: parcelLoadKg, addressIdx: [0] }] }
        : { vehicleType: '', vehicleUnit: 0, actualLoad: 0 }),
    additionalServices: addServices,
    parcels: isFtl
      ? [{ cargoType: 'FTL', itemInfo: [consoleFtl, ...vehicles.map((v) => v.vehicleType), ...addServices].join(' · '), quantity: units, weight: actualLoad / Math.max(1, units), l: 120, w: 100, h: 150 }]
      : goods.map((p) => ({ ...p, items: (p.items ?? []).filter((it) => !isBlankItem(it)), itemInfo: itemInfoOf(p) })),
    authority: saved?.authority || 'Leave at the door', instructions, secure, service: svc.code, rate: svc.price, etaDays: svc.days,
    consignment: {
      ...c,
      /* owner, 2026-10-06: "Barcode on every box" is ONE switch (Package & SKU's header; Handling on a vehicle form) */
      scannable: !!c.scannable,
      dedicateTruck: isFtl || dedicated,
      /* hidden (2026-10-07): Forward and today, unless the consignment already had its own */
      consignmentType: c.consignmentType || 'Forward', shipByDate: c.shipByDate || today(),
      orderNumber: effectiveOrder.trim(), referenceNumber: effectiveRef.trim(),
      /* owner, 2026-09-29: no fallback — a blank Consignment Number stays blank */
      consignmentNumber: c.consignmentNumber?.trim() ?? '',
      merchantCode: merchant?.code ?? null, merchantName: merchant?.name ?? '',
      rto: typeRule.rto && c.rtoMode === RTO_MODES[1] ? rto : null,
      /* a value a type does not ask is not kept (a COD amount left behind by a switch to Transfer) */
      ...(typeRule.rto ? {} : { rtoMode: RTO_MODES[0] }),
      ...(typeRule.payment ? {} : { paymentMode: '', orderAmount: null }),
      ...(ctype === 'Exchange' ? {} : { exchangeOrderNumber: '' }),
      /* how it moves (shipmentLegs) */
      ...(movementType ? { movementType } : {}),
      /* the legs are chosen outright now — the old stop switches are never set */
      skipFirstMileInbound: false, skipLastMile: false, directPickAndDeliver: legsDirect,
      packages: isFtl ? [] : goods.map((p) => ({
        packageId: p.packageId, packageType: p.packageTypeName || CUSTOM_PACKAGE_NAME, quantity: p.quantity,
        trackingNumber: p.trackingNumber ?? '', palletSpace: p.palletSpace ?? '', description: p.description ?? '',
      })),
      customFields: simple ? saved?.consignment?.customFields ?? [] : customAnswers(),
    },
    formMode: simple ? 'simplified' : 'full',
  })

  /* Grow's OrderDraft: the lane's service + ESTIMATED rate + currency, the full-vehicle shape with its packages as
     sourceParcels, the signed-in merchant recorded silently; the window only where the pickup module asks for one */
  const buildMerchantDraft = (): OrderDraft => {
    const ftl = mode === 'ftl'
    const units = mVehicles.length
    const load = mVehicles.reduce((n, v) => n + v.actualLoadKg, 0)
    const svcCode = selected || growService
    const cleanParcels = goods.map((p) => ({ ...p, items: (p.items ?? []).filter((it) => !isBlankItem(it)), itemInfo: itemInfoOf(p) }))
    const from = fromList ? { ...sender, locationCode: senderStore } : sender
    return {
      orderId: resumeId ?? undefined,
      storeCode: draftStoreCode,
      sender: (pickupState === 'manual' || askWindow) && hasWindow ? from : { ...from, windowStart: '', windowEnd: '' },
      receiver, drops, shipmentType: ftl ? 'FTL' : 'Parcel',
      ...(ftl
        ? { vehicleType: mVehicles[0]?.vehicleType ?? '', vehicleUnit: units, actualLoad: load, ftlServiceType: svcCode, vehicles: mVehicles, sourceParcels: cleanParcels }
        : { vehicleType: '', vehicleUnit: 0, actualLoad: 0 }),
      additionalServices: vasNames,
      /* a full vehicle keeps the one synthetic FTL line every reader expects */
      parcels: ftl
        ? [{ cargoType: 'FTL', itemInfo: [svcCode, ...mVehicles.map((v) => v.vehicleType), ...vasNames].join(' · '), quantity: Math.max(1, units), weight: load / Math.max(1, units), l: 120, w: 100, h: 150 }]
        : cleanParcels,
      authority: saved?.authority || 'Leave at the door', instructions, secure,
      service: svcCode, rate: quote?.net ?? 0, etaDays: quote?.days ?? 0, currency,
      consignment: {
        ...c,
        /* hidden on Grow (owner, 2026-10-06): Forward and today, unless the order already had its own */
        consignmentType: c.consignmentType || 'Forward', shipByDate: c.shipByDate || today(),
        scannable: !!c.scannable,
        dedicateTruck: ftl, carrier: '', totalLoadingTime: null,
        orderNumber: effectiveOrder.trim(), referenceNumber: effectiveRef.trim(),
        consignmentNumber: c.consignmentNumber?.trim() || effectiveRef.trim(),
        merchantCode: merchant?.code ?? null, merchantName: merchant?.name ?? '',
        rto: typeRule.rto && c.rtoMode === RTO_MODES[1] ? rto : null,
        ...(typeRule.rto ? {} : { rtoMode: RTO_MODES[0] }),
        /* Grow's Payment card (2026-10-07): Prepaid or COD (hidden = Prepaid); the COD amount only for COD; the remarks */
        /* 2026-10-27: Order Amount is asked in Consignment details on Grow — kept whenever it is shown */
        paymentMode: growPayMode, orderAmount: typeRule.payment && !isHidden('orderAmount') ? c.orderAmount ?? null : null,
        /* how it moves (Delivery type, 2026-10-27) — as the console saves it */
        ...(movementType ? { movementType } : {}), directPickAndDeliver: legsDirect,
        remarks: isHidden('remarks') ? c.remarks ?? '' : (c.remarks ?? '').trim(),
        ...(ctype === 'Exchange' ? {} : { exchangeOrderNumber: '' }),
        packages: ftl ? [] : goods.map((p) => ({
          packageId: p.packageId, packageType: p.packageTypeName || CUSTOM_PACKAGE_NAME, quantity: p.quantity,
          trackingNumber: p.trackingNumber ?? '', palletSpace: '', description: p.description ?? '',
        })),
        customFields: customAnswers(),
      },
      formMode: 'full',
    }
  }

  const backTo = merchantMode
    ? (pr ? prPath(pr.id) : fromOverage ? prPath(fromOverage.pr.id) : draftId ? '/grow/orders?tab=drafts' : '/grow/orders')
    : fromPr ? prPath(fromPr.id) : fromOverage ? prPath(fromOverage.pr.id) : base


  /* ------------------------------------------------------------ the account's own fields (2026-10-05)
     Rendered in their card's grid and configured like any other field (rename · Required · More · Format · hide). */
  const customNode = (d: CustomFieldDef): ReactNode => {
    const v = cfv[d.key] ?? ''
    const set = (x: string) => setCfv((m) => ({ ...m, [d.key]: x }))
    if (d.kind === 'yesno') return (
      <SFld key={d.key} label={lbl(d.key)} fieldKey={d.key}>
        <label className="flex h-8 cursor-pointer items-center gap-2.5 text-[13px] text-ink">
          <Toggle checked={v === 'true'} onChange={(on) => set(on ? 'true' : 'false')} />{v === 'true' ? 'Yes' : 'No'}
        </label>
      </SFld>
    )
    return <F key={d.key} fieldKey={d.key} label={lbl(d.key)} value={v} placeholder={d.placeholder}
      type={d.kind === 'number' ? 'number' : d.kind === 'date' ? 'date' : undefined}
      options={d.kind === 'list' ? opts(d.options ?? []) : undefined} onChange={set} />
  }
  const customEntries = (card: CustomFieldCard): RevealEntry[] => customDefs
    .filter((d) => d.card === card && !hid(d.key))
    .map((d): RevealEntry => [d.key, customNode(d), filled(cfv[d.key])])
  /** while editing: a card's "+ Add field" */
  /* owner, 2026-10-28: "remove add field options from the form" — no "+ Add field" on the cards; an own field is added from
     All fields (its dialog asks which card it goes in) */


  /* ---- the sections, in dependency order. Parcel: the packages come before Service (Load type and
     the dedicated truck read their weight); FTL: the Service Type comes before the vehicles (it
     narrows the vehicle types). ---- */
  /* Handling shows only when something in it is visible (see the card) */
  const handlingChipsVisible = GOODS_CATEGORIES.some(({ name }) => !hid(catKey(name)))
  /* owner, 2026-10-06: "Barcode on every box" is ONE switch, back in the Handling card (it was briefly in the Package & SKU
     header) — on, every package line is one box with its own barcode (`barcodeEach`, quantity 1) */
  const barcodeEach = !isFtl && !useItems && !!c.scannable
  const handlingTogglesVisible = !hid('scannable') || !hid('splittable') || !hid('clearanceRequired') || !hid('tags') || !hid('hubProcessing')
  /* the switches row — Barcode · In parts · Clearance · Tags, the SAME on both portals (owner, 2026-10-07: "like the CFT side") */
  const switchesRow = handlingTogglesVisible
  const handlingCustom = arrange(sortApi, 'handling-fields', customEntries('sec-handling'), inMore, secOpen('sec-handling'))
  /* while editing the card always shows — its "+ Add field" lives in it */
  const handlingVisible = handlingChipsVisible || handlingTogglesVisible || handlingCustom.nodes.length > 0 || handlingCustom.waiting > 0 || editing
  /* Handling & Instructions shows for its handling or its instructions; VAS and Service Type are cards of their own */
  const instrVisible = !hid('labelFormat') || !hid('totalLoadingTime') || !hid('specialInstructions')
    || customDefs.some((d) => d.card === 'sec-service' && !hid(d.key))
  const hiCard = handlingVisible || instrVisible
  const vasCard = !hid('vas')
  const svcTypeSec = editing || !hid('serviceType') ? ['sec-svctype'] : []
  const carrierSec = !hid('carrier') ? ['sec-carrier'] : []
  /* the Summary card shows while it is on and has a line to show. While the form is edited it follows "Show hidden
     fields" like every field (owner, 2026-10-06: switched off, it stayed in the preview and the switch did nothing):
     off → it leaves the preview, as it leaves the live form; Show hidden fields → back, faded, to switch it on */
  /* while editing, the Summary follows the fields' rule (owner, 2026-10-28: "hidden for both Ops and Grow — why is it still
     shown"): it shows while it is on for EITHER form; off on both, only with "Show hidden fields" (faded, to switch it on) */
  const sumOnSomewhere = (['console', 'grow'] as const).some((p) => draft.summary[p].enabled
    && SUMMARY_LINES[p].some((l) => !draft.summary[p].hidden.includes(l.key)))
  const summaryShown = !simple && (editing ? sumOnSomewhere || showHidden
    : summaryCfg.enabled && summaryLinesOf(formPortal).some((l) => !summaryCfg.hidden.includes(l.key)))
  /* owner, 2026-10-06 ("summary should be a vertical card, not a horizontal one"): the Summary is no longer a card in
     the flow — it is the vertical card beside the form (see the layout at the bottom), so it takes no place here */
  const sumSec: string[] = []
  /* Grow: no Service Type card on step 1 — it is chosen at checkout; the builder previews it after the cards, unmovable */
  /* Grow's priced Service Type (its own card, `sec-svctype`) and Payment — with the console's cards around them (GROW_OWN_LOOK
     off), or the Grow team's cards (on) */
  const growSvc = (editing ? growServiceCard : !serviceHidden) ? ['sec-svctype'] : []
  const sections = growLook ? ['sec-consignment', 'sec-parties', 'sec-to', 'sec-handling', 'sec-packages', ...((mode === 'ftl' || editing) && vehicleCard ? ['sec-vehicle'] : []),
    'sec-extras', ...growSvc, ...(editing ? [] : ['sec-pay']), ...sumSec]
    : merchantMode ? ['sec-consignment', 'sec-parties', 'sec-packages', ...((mode === 'ftl' || editing) && vehicleCard ? ['sec-vehicle'] : []),
      ...(hiCard ? ['sec-handling'] : []), ...(vasCard ? ['sec-extras'] : []), ...growSvc, ...(editing ? [] : ['sec-pay']), ...sumSec]
    : simple ? ['sec-consignment', 'sec-parties', isFtl ? 'sec-vehicle' : 'sec-packages', 'sec-carrier'] : isFtl
    ? ['sec-consignment', 'sec-parties', ...svcTypeSec, ...(vehicleCard ? ['sec-vehicle'] : []), ...(hiCard ? ['sec-handling'] : []), ...(vasCard ? ['sec-extras'] : []), ...carrierSec, ...sumSec]
    : ['sec-consignment', 'sec-parties', 'sec-packages', ...(hiCard ? ['sec-handling'] : []), ...(vasCard ? ['sec-extras'] : []), ...svcTypeSec, ...carrierSec, ...sumSec]
  /* owner, 2026-10-05 ("allow the user to move sections up and down"): the cards follow the saved order (zone
     SECTION_ZONE of the field order, so it is edited, saved, reset and — on Grow — inherited like the fields'); a card
     the order does not know sits after its natural predecessor. The Simplified tier keeps its own order. */
  const orderedSections = simple ? sections : applyOrder(sections, (x) => x, fieldOrder[SECTION_ZONE])
  const doneOf: Record<string, boolean> = {
    'sec-consignment': done(consignmentReq),
    'sec-parties': done(fromReq) && done(toReq) && done(rtoReq) && done(routeReq),
    'sec-packages': done(goodsReq) && done(pieceReq) && done(skuReq),
    'sec-vehicle': done(pieceReq),
    'sec-handling': done(handlingReq),
    /* owner, 2026-09-29: Service and Instructions & services are ONE card */
    'sec-service': done(serviceReq) && done(extrasReq),
    'sec-carrier': done(carrierReq),
    'sec-summary': true,
    ...(growLook ? { 'sec-parties': done(fromReq) && done(rtoReq), 'sec-to': done(toReq), 'sec-handling': done(handlingReq) && done(instrReq),
      'sec-extras': done(vasReq) } : {}),
    ...(!growLook ? { 'sec-handling': done(handlingReq) && done(instrReq), 'sec-extras': done(vasReq), 'sec-svctype': done(serviceReq) } : {}),
    ...(merchantMode ? { 'sec-pay': payReq.every(Boolean), 'sec-svctype': done(serviceReq), 'sec-vehicle': ftlOk, 'sec-payment': done(paymentReq) } : {}),
  }

  const proceed = () => {
    if (editing) return
    if (!canSubmit) {
      /* the first attempt turns the errors on; the page jumps to the first incomplete section */
      setShowErrors(true)
      /* a folded package hides its errors — open the first incomplete one */
      const badPkg = !useItems && !isFtl ? parcels.find((p) => !pkgOk(p)) : undefined
      if (badPkg?.packageId) setOpenPkgId(badPkg.packageId)
      const first = orderedSections.find((s) => !doneOf[s])
      if (first) setTimeout(() => jumpTo(first), 60)
      return
    }
    /* addresses typed on the form with "Save this address" on are kept now that the consignment is */
    if (anyInline) keepTypedAddresses()
    if (merchantMode) {
      /* Grow (owner, 2026-10-27): ONE page — Create Consignment places the order with the service and payment picked here */
      if (!growQuote) return
      const placed = placeGrowOrder({ draft: buildMerchantDraft(), chosen: growQuote, parts: pay.choice.parts, merchantCode: merchant?.code ?? null,
        pickupId: pr?.id ?? null, overage: fromOverage ? { prId: fromOverage.pr.id, overageId: fromOverage.scan.id } : null })
      pay.remember()
      const o = placed.order
      const l = placed.linked
      if (l.kind === 'overage') toast.success(`Consignment ${o.orderNumber} created for overage ${l.barcode} and linked to ${l.prNumber}`)
      else if (l.kind === 'pickup') toast.success(`Consignment ${o.orderNumber} created and added to ${l.prNumber}`)
      else toast.success(`Consignment ${o.orderNumber} created · ${placed.paidNote}${l.kind === 'auto' ? ` · Pickup Request ${l.prNumber} scheduled` : ''}`)
      nav(l.kind === 'overage' || l.kind === 'pickup' ? `/grow/orders/pickups/${l.prId}` : `/grow/orders?order=${o.id}`)
      return
    }
    if (liveEdit && draftId) {
      const m = growOrderActions.modifyOrder(draftId, buildDraft())
      clearDraftKeys()
      if (m) toast.success(`Consignment ${m.orderNumber} updated`)
      nav(base)
      return
    }
    const o = growOrderActions.saveDraft(buildDraft(), draftId ?? undefined)
    growOrderActions.markPaid(o.id)
    clearDraftKeys()
    if (fromPr && growOrderActions.attachOrdersToPickup(fromPr.id, [o.id]).length > 0) {
      toast.success(`Consignment ${o.orderNumber} created and added to ${fromPr.number}`)
      nav(prPath(fromPr.id))
      return
    }
    /* a first-mile pickup request only when the route starts with a Pickup leg (FM exists only then) */
    const auto = hasPickupLeg(movementType) ? growOrderActions.autoBookOnConsignment(o.id, merchantCode) : null
    toast.success(auto ? `Consignment ${o.orderNumber} created · Pickup Request ${auto.number} scheduled` : `Consignment ${o.orderNumber} created`)
    nav(base)
  }

  const saveForLater = () => {
    if (anyInline) keepTypedAddresses()
    const o = growOrderActions.saveDraft(buildMerchantDraft(), resumeId ?? undefined)
    clearDraftKeys()
    toast.success(`Order ${o.orderNumber} saved to Drafts`)
    nav('/grow/orders?tab=drafts')
  }

  /* ------------------------------------------------------------ 1 · Consignment details */
  const err = (bad: boolean) => (bad ? 'Required field.' : undefined)
  const categories = c.category ?? []
  const hasCat = (name: string) => categories.includes(name)
  const toggleCategory = (name: string, on: boolean) =>
    setC({ category: on ? [...categories.filter((x) => x !== name), name] : categories.filter((x) => x !== name) })
  /* owner, 2026-10-28 ("Dedicate Truck moves to the top, Consignment details"): Load type is a Consignment details field */
  const loadTypeField = merchantMode
    ? !hid('dedicateTruck') && (
      <SFld key="loadType" fieldKey="dedicateTruck" label={custom('dedicateTruck', 'Dedicate Truck', 'Load type')}>
        <SwitchBox icon={Truck} label="Dedicate Truck" checked={mode === 'ftl'} disabled={!!fromOverage || pr?.shipmentType === 'FTL' || truckHidden}
          onChange={(on) => changeMode(on ? 'ftl' : 'ltl')}
          title={mode === 'ftl' ? 'Full vehicle (FTL / FCL) — its vehicles are picked in Vehicle Details' : 'Shared vehicle (LTL / LCL) — switch on for a whole vehicle'} />
      </SFld>
    )
    : !isFtl && !hid('dedicateTruck') && (
      <SFld key="loadType" fieldKey="dedicateTruck" label={custom('dedicateTruck', 'Dedicate Truck', 'Load type')}
      helper={dedicatedLocked ? `Set by the service — ${serviceLoad === 'ftl' ? 'full' : 'shared'} vehicle only`
        : dedicated ? (vehicleChoice ? `A whole vehicle · ${vehicleTypeOf(hubVehicles, vehicleChoice)?.name ?? vehicleChoice}`
          : 'Whole vehicle · picked at planning') : undefined}>
      <SwitchBox icon={Truck} label="Dedicate Truck" checked={dedicated} disabled={dedicatedLocked || !!fromOverage} onChange={setDedicateTruck}
        title={dedicated ? 'Full vehicle (FTL / FCL) — a whole vehicle just for this consignment' : 'Shared vehicle (LTL / LCL) — switch on for a whole vehicle'} />
    </SFld>
    )
  const consignmentSection = (
    <FormCard id="sec-consignment" title="Consignment details"
      caption={merchantMode ? 'How it is identified, its type, when it ships and how it is paid.' : 'Who it is for, how it is identified, its type, when it ships and how it is paid.'}>
      {(() => {
        const r = arrange(sortApi, 'consignment', [
          /* Merchant first: it decides the Ship From addresses and the package presets below */
          !merchantMode && !hid('merchant') && [null, <F key="me" fieldKey="merchant" label={lbl('merchant')} required={need('merchant')} value={merchant?.code ?? ''} placeholder="eg, ELEX"
            options={masters.merchants.map((m) => ({ value: m.code, label: m.name }))} error={err(need('merchant') && !merchant)}
            onChange={(v) => setMerchantCode(v || null)} />],
          idPref !== 'referenceNumber' && [null, <F key="on" fieldKey="orderNumber" label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001"
            error={err(!filled(effectiveOrder))} onChange={(v) => setC({ orderNumber: v })}
            helper={idPref === 'orderNumber' ? `${lbl('referenceNumber')} is copied from this.` : undefined} />],
          (idPref !== 'orderNumber' || (editing && refHidden && !hid('referenceNumber'))) && ['referenceNumber', <F key="rn" fieldKey="referenceNumber" label={lbl('referenceNumber')} required={refRequired} value={c.referenceNumber ?? ''} placeholder="eg, ABC0001"
            error={err(refRequired && !filled(c.referenceNumber))} onChange={(v) => setC({ referenceNumber: v })}
            helper={idPref === 'referenceNumber' ? `${lbl('orderNumber')} is copied from this.` : undefined} />, filled(c.referenceNumber)],
          !hid('consignmentNumber') && ['consignmentNumber', <F key="cn" fieldKey="consignmentNumber" label={lbl('consignmentNumber')} value={c.consignmentNumber ?? ''} placeholder="eg, 0001"
            onChange={(v) => setC({ consignmentNumber: v })} />, filled(c.consignmentNumber)],
          !hid('consignmentType') && [null, <F key="ct" fieldKey="consignmentType" label={lbl('consignmentType')} required value={ctype}
            options={opts(merchantMode ? CONSIGNMENT_TYPES.filter((t) => t !== 'Transfer') : CONSIGNMENT_TYPES)} onChange={changeType} />],
          !hid('shipByDate') && [null, <F key="sb" fieldKey="shipByDate" label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={err(!filled(c.shipByDate))} onChange={(d) => setC({ shipByDate: d })} />],
          !hid('exchangeOrderNumber') && (ctype === 'Exchange' || editing) && ['exchangeOrderNumber',
            <F key="ex" fieldKey="exchangeOrderNumber" label={lbl('exchangeOrderNumber')} required={ctype === 'Exchange'} value={c.exchangeOrderNumber ?? ''} placeholder="eg, ABC0000"
              error={ctype === 'Exchange' && !filled(c.exchangeOrderNumber) ? 'Required field.' : undefined}
              onChange={(v) => setC({ exchangeOrderNumber: v })} helper={editing ? 'Shown for an Exchange' : 'The order being exchanged'} />, filled(c.exchangeOrderNumber)],
          !merchantMode && !hid('paymentMode') && (typeRule.payment || editing) && ['paymentMode', <F key="pm" fieldKey="paymentMode" label={lbl('paymentMode')} value={c.paymentMode ?? ''} placeholder="eg, Prepaid"
            options={opts(PAYMENT_MODES)} onChange={(v) => setC({ paymentMode: v })} />, !!c.paymentMode],
          /* owner, 2026-10-27: Order Amount on the merchant (Grow) form too — the same field, in the same card, with its currency */
          !hid('orderAmount') && (typeRule.payment || editing) && ['orderAmount', <FNum key="oa" fieldKey="orderAmount"
            label={!merchantMode && c.paymentMode === 'COD' ? 'Amount to collect (COD)' : lbl('orderAmount')} blankZero
            placeholder="eg, 100.22" unit={merchantMode ? currency : undefined} value={c.orderAmount ?? 0} onChange={(n) => setC({ orderAmount: n || null })} />, (c.orderAmount ?? 0) > 0],
          loadTypeField && [null, loadTypeField],
          ...customEntries('sec-consignment'),
        ], inMore, secOpen('sec-consignment'))
        return <>
          <SGrid>{r.nodes}</SGrid>
          <RevealToggle open={secOpen('sec-consignment')} onToggle={() => toggleSec('sec-consignment')} waiting={r.waiting} waitingFilled={r.waitingFilled} className="mt-6" />
        </>
      })()}
    </FormCard>
  )

  /* ------------------------------------------------------------ 2 · Ship From → Ship To (+ RTO)
     Each address = a saved-address dropdown + "New address", read back as a card; Add / Edit opens a
     popup with its fields (Cancel restores what was there). While editing the FORM, the fields show
     inline instead so the builder can configure them. */
  const setSenderP = (p: Partial<Party>) => setSender((x) => ({ ...x, ...p }))
  const setReceiverP = (p: Partial<Party>) => setReceiver((x) => ({ ...x, ...p }))
  type Role = 'from' | 'to' | 'rto'
  const partyOf = (role: Role, idx: number): Party => (role === 'from' ? sender : role === 'rto' ? rto : allDrops[idx] ?? blankParty())
  const patchParty = (role: Role, idx: number) => (patch: Partial<Party>) => {
    if (role === 'from') setSenderP(patch)
    else if (role === 'rto') setRto((x) => ({ ...x, ...patch }))
    else if (idx === 0) setReceiverP(patch)
    else setDrop(idx - 1, patch)
  }
  const replaceParty = (role: Role, idx: number, p: Party) => {
    if (role === 'from') setSender(p)
    else if (role === 'rto') setRto(p)
    else if (idx === 0) setReceiver(p)
    else setDrops((ds) => ds.map((x, j) => (j === idx - 1 ? p : x)))
  }
  const [addr, setAddr] = useState<null | { role: Role; idx: number; snapshot: Party; store: string; isNew: boolean; setup?: boolean }>(null)
  /* "Save this address": a Ship From / merchant-side address joins your addresses (the store list), a
     customer address joins the address book — each is offered under Saved address next time */
  const [saveAddr, setSaveAddr] = useState(false)
  const openAddress = (role: Role, idx: number, isNew: boolean) => {
    setSaveAddr(false)
    const cur = partyOf(role, idx)
    setAddr({ role, idx, snapshot: cur, store: senderStore, isNew })
    if (isNew) {
      replaceParty(role, idx, { ...blankParty(), windowStart: cur.windowStart, windowEnd: cur.windowEnd })
      if (role === 'from') setSenderStore(OTHER_ADDRESS)
    }
  }
  /** while the form is edited: the same pop-up, to set up the address fields (owner, 2026-10-06: "in the popup I can't edit
      the fields") — closing it puts the address back as it was */
  const openAddressSetup = (role: Role, idx: number) => {
    setSelKey(null)
    setAddr({ role, idx, snapshot: partyOf(role, idx), store: senderStore, isNew: false, setup: true })
  }
  /** "Save this address": to the address book (a customer's) or to your addresses (the store list) */
  const keepAddress = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    const toBook = role === 'to' ? sourcesOf('to')[0] === 'customers' : role === 'from' ? sourcesOf('from')[0] === 'customers' : false
    /* a name and a street are enough — the address book flags a missing postal code on the row itself */
    if (!filled(p.name) || !filled(p.line1)) { toast.error('Add a name and the address before saving it'); return }
    /* the builder's Preview never writes anything */
    if (building) { toast.info('Preview — addresses are not saved'); return }
    if (toBook) { addressBookActions.add({ ...p, windowStart: '', windowEnd: '' }); toast.success(`${p.name} saved to the address book`); return }
    const stored = growOrderActions.addStore({ code: codeFor(p), name: p.businessName || p.name, party: { ...p, windowStart: '', windowEnd: '' } })
    if (role === 'from') setSenderStore(stored.code)
    else if (role === 'rto') setRto((x) => ({ ...x, locationCode: stored.code }))
    else replaceParty('to', idx, { ...p, locationCode: stored.code })
    toast.success(`${stored.name} saved to your addresses`)
  }
  const confirmAddress = () => {
    if (addr && saveAddr) keepAddress(addr.role, addr.idx)
    setAddr(null)
  }
  /* an address typed on the form (Fields on the form) is saved when the consignment is — if its switch is on */
  const [saveTyped, setSaveTyped] = useState<Set<string>>(new Set())
  const slotId = (role: Role, idx: number) => `${role}:${idx}`
  const keepTypedAddresses = () => {
    for (const id of saveTyped) {
      const [role, i] = id.split(':') as [Role, string]
      const idx = Number(i)
      if (role === 'to' && idx >= allDrops.length) continue
      if (role === 'rto' && !(typeRule.rto && c.rtoMode === RTO_MODES[1])) continue
      if (typedHere(role, idx)) keepAddress(role, idx)
    }
    setSaveTyped(new Set())
  }
  const cancelAddress = () => {
    if (addr) { replaceParty(addr.role, addr.idx, addr.snapshot); if (addr.role === 'from') setSenderStore(addr.store) }
    setAddr(null)
  }
  const closeSetup = () => { setSelKey(null); cancelAddress() }
  const book = useReceiverBook(db.orders)
  const bookIdx = (p: Party) => book.findIndex((e) => e.party.name === p.name && e.party.line1 === p.line1)
  const roleTitle: Record<Role, string> = { from: 'Ship From address', to: 'Ship To address', rto: 'return address' }
  /* a hub as an address: its store row when the hub is one, else its name */
  const hubParty = (code: string): Party => {
    const st = db.stores.find((x) => x.code === code) ?? stores.find((x) => x.code === code)
    const name = INBOUND_HUBS.find((h) => h.code === code)?.name ?? code
    return st ? { ...st.party, name: st.party.name || st.name, locationCode: code }
      : { ...blankParty(), name, businessName: name, line1: name, locationCode: code }
  }
  type Source = 'merchant' | 'customers' | 'facilities'
  const optionsOf = (src: Source): Opt[] => (src === 'facilities'
    ? INBOUND_HUBS.map((h) => ({ value: `hub:${h.code}`, label: `Hub · ${hubName(h.code, stores)}` }))
    : src === 'customers'
      ? book.map((e, i) => ({ value: `book:${i}`, label: `${e.party.name || e.party.businessName || 'Unnamed'} — ${[e.party.city, e.party.state].filter(Boolean).join(', ')}${e.tag ? ` · ${e.tag}` : ''}` }))
      /* Grow lists no hubs of its own — a hub-coded pickup location (sample data) is one of the merchant's addresses */
      : senderOptions.filter((o) => o.value !== OTHER_ADDRESS && (merchantMode || !HUB_CODES.has(o.value))).map((o) => ({ value: `store:${o.value}`, label: o.label ?? o.value })))
  /* the type decides each end's list; facilities are always offered (hub → customer, customer → hub) */
  const sourcesOf = (role: 'from' | 'to'): Source[] => {
    const main = role === 'from' ? typeRule.from : typeRule.to
    if (merchantMode) return [main === 'facilities' ? 'merchant' : main]
    /* the legs decide it (a Transfer's ends are hubs by type) */
    if (main === 'facilities') return ['facilities']
    if (!(role === 'from' ? fromRestricted : toRestricted)) return [main, 'facilities']
    return (role === 'from' ? fromIsAddress : toIsAddress) ? [main] : ['facilities']
  }
  const partyFromPick = (v: string): Party | null => {
    const [kind, ref] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)]
    if (kind === 'hub') return hubParty(ref)
    if (kind === 'book') return book[Number(ref)]?.party ?? null
    if (kind === 'store') { const st = stores.find((x) => x.code === ref) ?? db.stores.find((x) => x.code === ref); return st ? { ...st.party, locationCode: ref } : null }
    return null
  }
  const valueOf = (role: 'from' | 'to', p: Party): string => {
    const code = role === 'from' ? (fromList ? senderStore : '') : p.locationCode ?? ''
    if (code && HUB_CODES.has(code)) return merchantMode ? `store:${code}` : `hub:${code}`
    if (code && (stores.some((x) => x.code === code) || db.stores.some((x) => x.code === code))) return `store:${code}`
    const at = bookIdx(p)
    return at >= 0 ? `book:${at}` : ''
  }
  const pickerFor = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    if (role === 'rto') {
      return <F label="Saved address" value={rto.locationCode ?? ''} placeholder="Search pickup addresses" searchable
        options={pickup.options.filter((o) => o.value !== OTHER_ADDRESS)}
        onChange={(code) => { const st = stores.find((x) => x.code === code); if (st) setRto({ ...st.party, locationCode: code }) }} />
    }
    const srcs = sourcesOf(role)
    const onlyFacilities = srcs.length === 1 && srcs[0] === 'facilities'
    return <F label={onlyFacilities ? 'Facility' : 'Saved address'} value={valueOf(role, p)} searchable
      placeholder={onlyFacilities ? 'Pick a hub' : `${srcs[0] === 'customers' ? 'Search customers or locations' : 'Search your addresses'}${srcs.includes('facilities') ? ' or hubs' : ''}`}
      options={srcs.flatMap(optionsOf)}
      onChange={(v) => applyPick(role, idx, v)} />
  }
  /** a saved address (or a hub) picked for one end — the picker's and the on-form search's choice */
  const applyPick = (role: Role, idx: number, v: string) => {
    const p = partyOf(role, idx)
    if (role === 'rto') { const st = stores.find((x) => x.code === v); if (st) setRto({ ...st.party, locationCode: v }); return }
    const next = partyFromPick(v)
    if (!next) return
    const keep = { windowStart: p.windowStart, windowEnd: p.windowEnd }
    if (role === 'from') {
      if (v.startsWith('store:')) { pickSender(v.slice(6)); return }
      setSenderStore(v.startsWith('hub:') ? v.slice(4) : OTHER_ADDRESS)
      setSender({ ...next, ...keep })
    } else replaceParty('to', idx, { ...next, ...keep })
  }
  /** the address came from a saved list (a store, the address book, a hub) */
  const pickedHere = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    return role === 'rto' ? !!p.locationCode && stores.some((x) => x.code === p.locationCode) : valueOf(role, p) !== ''
  }
  /** an address typed here, not picked from a saved list (it can be saved) */
  const typedHere = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    return !pickedHere(role, idx) && (filled(p.name) || filled(p.line1))
  }
  /** what the on-form search offers for one end: its saved addresses, by name, number, address or company */
  const hitsFor = (role: Role): AddrHit[] => {
    if (role === 'rto') return stores.map((st) => ({ value: st.code, party: st.party, tag: 'Your address' }))
    return sourcesOf(role).flatMap(optionsOf).flatMap((o) => {
      const party = partyFromPick(o.value)
      if (!party) return []
      const tag = o.value.startsWith('hub:') ? 'Hub' : o.value.startsWith('book:') ? book[Number(o.value.slice(5))]?.tag ?? 'Address book' : 'Your address'
      return [{ value: o.value, party, tag }]
    })
  }
  /** "Clear" on an address typed on the form — back to an empty address (the window stays) */
  const clearParty = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    replaceParty(role, idx, { ...blankParty(), windowStart: p.windowStart, windowEnd: p.windowEnd })
    if (role === 'from') setSenderStore(OTHER_ADDRESS)
  }
  /** Consignment Type: a switch into / out of Reverse swaps the two ends (a return is collected FROM the customer). */
  function changeType(next: string) {
    const wasReverse = ctype === 'Reverse'
    setC({ consignmentType: next })
    if (wasReverse === (next === 'Reverse')) return
    const oldFrom: Party = { ...sender, locationCode: fromList ? senderStore : sender.locationCode }
    const code = receiver.locationCode ?? ''
    setSender({ ...receiver, windowStart: sender.windowStart, windowEnd: sender.windowEnd })
    setSenderStore(code && (HUB_CODES.has(code) || stores.some((x) => x.code === code) || db.stores.some((x) => x.code === code)) ? code : OTHER_ADDRESS)
    setReceiver({ ...oldFrom, windowStart: receiver.windowStart, windowEnd: receiver.windowEnd })
  }
  const windowCells = (role: 'from' | 'to', idx: number) => {
    if (hid('addrWindow')) return null
    const p = partyOf(role, idx)
    const w = role === 'from' ? 'Pick Up' : 'Delivery'
    const cells = <>
      <DateTimeCell label={`${w} Start Time`} at={p.windowStart ?? ''} fallbackTime="00:00" onChange={(v) => patchParty(role, idx)({ windowStart: v })} />
      <DateTimeCell label={`${w} End Time`} at={p.windowEnd ?? ''} fallbackTime="23:59" onChange={(v) => patchParty(role, idx)({ windowEnd: v })} />
    </>
    /* the two cells sit side by side only where each gets room for its date AND time (a container query — the column
       is narrower beside the vertical Summary) */
    return (
      <div className="@container mt-6">
        <div className={`grid grid-cols-1 ${FIELD_GAPS} @min-[500px]:grid-cols-2`}>{cells}</div>
      </div>
    )
  }
  /* picker | its card in two columns while an end has the card's full width (owner, 2026-10-06): always in "One under the
     other"; in "Side by side" only while the card is too narrow for the two ends (< 720px). Container queries on the parties card. */
  const split = simple ? null : stackAddr
    ? { grid: '@min-[600px]:grid-cols-2', pad: '@min-[600px]:pt-[26px]' }
    : { grid: '@min-[600px]:@max-[720px]:grid-cols-2', pad: '@min-[600px]:@max-[720px]:pt-[26px]' }
  const addressSlot = (role: Role, idx: number, title: ReactNode, right?: ReactNode) => {
    const p = partyOf(role, idx)
    const at = role === 'rto' ? -1 : bookIdx(p)
    const src = role === 'rto' ? 'merchant' : sourcesOf(role)[0]
    const facility = role !== 'rto' && (role === 'from' ? fromEnd.kind === 'facility' : HUB_CODES.has(p.locationCode ?? ''))
    return (
      <div>
        {/* Grow: the card is titled Ship From / Ship To — no second heading inside it */}
        {(title || right) && <SubTitle right={<span className="flex flex-wrap items-center justify-end gap-3">
          {!merchantMode && role !== 'rto' && (
            <span className="rounded-full bg-warm-100 px-2.5 py-0.5 text-[12px] text-ink-2">
              {src === 'facilities' || facility ? 'Hub' : src === 'customers' ? 'Customer address' : 'Merchant address'}
            </span>
          )}
          {right}
        </span>}>{title}</SubTitle>}
        {/* owner, 2026-10-28 ("Ship From: Fields ↔ Card does not change the UI"): "Fields on the form" applies to a picked
            hub too — the search and the fields, filled from the hub. Only an end that can ONLY be a hub (its legs say so) is a
            hub picker, whatever the choice. */}
        {inlineOf(role) && src !== 'facilities'
          ? inlineAddress(role, idx)
          : <>
        <div className={`grid gap-x-6 gap-y-4 ${split?.grid ?? ''}`}>
          <div className={`grid min-w-0 items-end gap-3 self-start ${src === 'facilities' || editing ? '' : 'grid-cols-[minmax(0,1fr)_auto]'}`}>
            {pickerFor(role, idx)}
            {src !== 'facilities' && !editing && <button type="button" onClick={() => openAddress(role, idx, true)}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-brand-500 bg-surface px-3 text-[13px] text-brand-500 hover:bg-warm-50">
              <Plus size={14} />New address
            </button>}
          </div>
          <div className={`min-w-0 ${split?.pad ?? ''}`}>
            {/* owner, 2026-10-06: while the form is edited the pencil (and the link) open the pop-up to set up its fields —
                a hub picked as Ship From included; only a hub-only end has no address fields */}
            <AddressCard party={p} missing={missingOf(p, role)} invalid={invalidOf(p, role)}
              onEdit={editing ? (src !== 'facilities' ? () => openAddressSetup(role, idx) : undefined) : () => openAddress(role, idx, false)}
              editTip={editing ? 'Set up the address fields' : undefined} hubOnly={src === 'facilities'}
              tag={facility ? 'Saved' : at >= 0 ? book[at].tag ?? 'Saved' : role === 'from' && fromList ? 'Saved' : filled(p.name) ? 'New' : undefined} />
            {editing && src !== 'facilities' && (
              <button type="button" onClick={() => openAddressSetup(role, idx)}
                className="mt-2 inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
                <SlidersHorizontal size={12} />Set up the address fields
              </button>
            )}
            {((role === 'from' && fromKindBad) || (role === 'to' && idx === 0 && toKindBad)) && (
              <ErrLine className="mt-2">{src === 'facilities' ? 'Pick a hub — this end has no pickup / delivery leg.' : 'Pick an address — this end has a pickup / delivery leg.'}</ErrLine>
            )}
          </div>
        </div>
          </>}
      </div>
    )
  }
  /** "Fields on the form" (owner, 2026-10-05, the live Grow portal's Ship To): a search of the saved addresses, then
      CONTACT DETAILS and ADDRESS DETAILS in the card itself, "More address details", and Save this address. */
  const inlineAddress = (role: Role, idx: number) => {
    const p = partyOf(role, idx)
    const id = slotId(role, idx)
    const typed = typedHere(role, idx)
    const srcs = role === 'rto' ? (['merchant'] as Source[]) : sourcesOf(role)
    const what = srcs[0] === 'customers' ? 'address book' : 'your addresses'
    const kindBad = (role === 'from' && fromKindBad) || (role === 'to' && idx === 0 && toKindBad)
    const invalid = invalidOf(p, role)
    /* "Fields on the form" STAYS fields (owner, 2026-10-07: "when Ship To is selected with inline edit it should not convert into a
       card"): picking a saved address fills the inputs below the search and leaves them editable — it never folds into a read-back
       card (that is the OTHER choice, "Saved card"). */
    return (
      <div>
        <div className={`grid gap-x-6 gap-y-4 ${split?.grid ?? ''}`}>
        <div className="flex min-w-0 items-center gap-3 self-start">
          <div className="min-w-0 flex-1">
            <AddressSearch hits={hitsFor(role)} onPick={(h) => applyPick(role, idx, h.value)}
              placeholder={`Search ${what}${srcs.includes('facilities') ? ' or hubs' : ''}`} />
          </div>
          {(filled(p.name) || filled(p.line1)) && !editing && (
            <button type="button" onClick={() => clearParty(role, idx)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] text-ink-2 hover:bg-warm-50 hover:text-ink">
              <X size={14} />Clear
            </button>
          )}
        </div>
        </div>
        {/* side by side: two columns in its half · one under the other: four across the card */}
        <div className="mt-6">
          <PartyBlock wide half={!stackAddr} party={p} set={patchParty(role, idx)} nameLabel={role === 'to' ? 'Customer Name' : 'Sender Name'}
            requireContact={role !== 'from' && contactReq} hid={hid} variant={role === 'rto' ? 'rto' : 'full'} />
        </div>
        {typed && !editing && (
          <div className="mt-6 inline-flex">
            <InlineSwitch label="Save this address" title={`It is listed in ${what} next time — saved when the consignment is`}
              checked={saveTyped.has(id)} onChange={(on) => setSaveTyped((xs) => { const n = new Set(xs); if (on) n.add(id); else n.delete(id); return n })} />
          </div>
        )}
        {invalid.length > 0 && <p className="mt-3 text-[12px] text-danger-fg">Check the format: {invalid.join(', ')}</p>}
        {kindBad && <ErrLine className="mt-2">Pick an address — this end has a pickup / delivery leg.</ErrLine>}
      </div>
    )
  }
  /* ------------------------------------------------------------ Shipment legs (owner, 2026-09-29) */
  const fromWho = typeRule.from === 'customers' ? 'the customer' : 'the merchant'
  const toWho = typeRule.to === 'merchant' ? 'the merchant' : 'the customer'
  const LEG_INFO: Record<LegKind, { name: string; hint: string; rail: string }> = {
    pickup: { name: 'First Mile', hint: `Pick up from ${fromWho} and bring to hub`, rail: 'Pickup to hub' },
    linehaul: { name: 'Line Haul', hint: 'Long trip between hubs or cities', rail: 'Long trip between hubs or cities' },
    delivery: { name: 'Last Mile', hint: `Deliver from hub to ${toWho}`, rail: 'Hub to delivery' },
    pickAndDeliver: { name: 'Pick & Del', hint: 'Same rider picks and delivers', rail: 'One trip, no hub' },
  }
  /** a leg switched off / on turns its end into a hub / an address: an end of the wrong kind is cleared */
  const fitEnds = (nextFromAddress: boolean, nextToAddress: boolean) => {
    if (hasAddr(sender) && (fromEnd.kind === 'facility') === nextFromAddress) {
      setSender({ ...blankParty(), windowStart: sender.windowStart, windowEnd: sender.windowEnd }); setSenderStore(OTHER_ADDRESS)
    }
    if (hasAddr(receiver) && (toEnd.kind === 'facility') === nextToAddress) {
      setReceiver({ ...blankParty(), windowStart: receiver.windowStart, windowEnd: receiver.windowEnd })
    }
  }
  const setLegs = (patch: Partial<typeof legChoice>) => {
    const next = { ...legChoice, ...patch }
    const direct = next.mode === 'direct'
    /* only a leg that is SET (or Direct) decides an end's kind; a following one keeps whatever is picked */
    fitEnds(direct || next.fm === null ? (direct || fromEnd.kind !== 'facility') : next.fm,
      direct || next.lm === null ? (direct || toEnd.kind !== 'facility') : next.lm)
    setLegChoice(next)
  }
  /* the hubs it passes, in order (an end that is a hub, the stop between two legs) — shown as plain words */
  const viaHubs: string[] = []
  if (!legsDirect) {
    /* only a KNOWN hub is named (owner, 2026-09-29: no "Hub (from the address)" placeholder) */
    const add = (code: string | null | undefined) => { if (!code) return; const n = hubName(code, stores); if (viaHubs[viaHubs.length - 1] !== n) viaHubs.push(n) }
    if (!fromIsAddress) add(fromEnd.hub)
    if (legFm && (legLh || legLm)) add(originHub)
    if (legLh && legLm) add(destHub)
    if (!toIsAddress) add(toEnd.hub)
  }
  /* the Hub processing switch's line: the legs it creates, in words, and any problem with the two ends */
  const legWords = legList.map((k) => LEG_INFO[k].name).join(' → ')
  /* owner, 2026-10-27 ("simpler term, like the Load type field"): Delivery type · Direct Delivery — off = through a hub,
     on = one trip, no hub. Like Dedicate Truck, a line only when it is on (or the two ends are the same hub); the legs
     it creates are the switch's tooltip. One node, on the console (after Load type) and on Grow (beside Dedicate Truck). */
  const directHelper: ReactNode = sameHubBothEnds ? <span className="text-danger-fg">Ship From and Ship To are the same hub.</span>
    : legsDirect ? 'One trip, no hub' : undefined
  const directDeliveryField = (
    <SFld key="hubProcessing" fieldKey="hubProcessing" label={lbl('hubProcessing')} helper={directHelper}>
      <SwitchBox icon={RouteIcon} label="Direct Delivery" checked={legsDirect} disabled={isTransfer}
        onChange={(on) => setLegs({ mode: on ? 'direct' : 'hub', fm: null, lm: null, lh: null })}
        title={isTransfer ? 'A Transfer always moves hub to hub'
          : legsDirect ? 'Direct Delivery — one trip, no hub: the same rider picks up and delivers'
          : `Through a hub${legWords ? ` — ${legWords}` : ''}${viaHubs.length ? ` · via ${viaHubs.join(' → ')}` : ''} (switch on for one trip, no hub)`} />
    </SFld>
  )
  const addressModal = (
    <>
      {/* while the form is edited (setup) the pop-up is the address fields' preview: a click on a field opens its card above
          the dialog; Esc closes that card first, then the pop-up; closing puts the address back as it was */}
      <Modal open={!!addr && (!addr.setup || editing)} wide
        title={addr?.setup ? (addr.role === 'rto' ? 'Return address fields' : 'Address fields')
          : addr ? `${addr.isNew ? 'New' : 'Edit'} ${roleTitle[addr.role]}${addr.role === 'to' && allDrops.length > 1 ? ` · Address ${addr.idx + 1}` : ''}` : ''}
        subtitle={addr?.setup ? 'Click a field to change it. All addresses use these fields.'
          : addr?.role === 'from' ? 'Where the carrier collects the consignment.' : addr?.role === 'to' ? 'Who receives it, and where.' : 'Where it comes back if it cannot be delivered.'}
        onClose={addr?.setup ? () => (selKey ? setSelKey(null) : closeSetup()) : cancelAddress}
        footer={addr?.setup
          ? <>
              <span className="mr-auto"><InlineSwitch label="Show hidden fields" checked={showHidden} onChange={setShowHidden} /></span>
              <Button onClick={closeSetup}>Done</Button>
            </>
          : <><Button variant="outline" onClick={cancelAddress}>Cancel</Button><Button onClick={confirmAddress}>Use this address</Button></>}>
        {addr && (
          <div className="pb-4 pt-2">
            <PartyBlock grouped party={partyOf(addr.role, addr.idx)} set={patchParty(addr.role, addr.idx)}
              nameLabel={addr.role === 'to' ? 'Customer Name' : 'Sender Name'} requireContact={addr.role !== 'from' && contactReq} hid={hid}
              variant={addr.role === 'rto' ? 'rto' : 'full'} />
            {/* any address typed here can be kept — Ship From and Ship To alike */}
            {!addr.setup && (addr.isNew || valueOf(addr.role === 'rto' ? 'from' : addr.role, partyOf(addr.role, addr.idx)) === '') && (
              <div className="mt-5 flex items-center gap-3 rounded-lg bg-warm-50 px-4 py-3">
                <Bookmark size={16} className="shrink-0 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-ink">Save this address</p>
                  <p className="text-[12px] text-ink-3">It is listed under Saved address next time.</p>
                </div>
                <Toggle checked={saveAddr} onChange={setSaveAddr} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  )
  const fmtWin = (w: { startAt: string; endAt: string }) => {
    const d = new Date(`${w.startAt.slice(0, 10)}T00:00`)
    return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${w.startAt.slice(11, 16)}–${w.endAt.slice(11, 16)}`
  }
  /* Grow: the pickup window under Ship From, as the pickup module says */
  const merchantPickupWindow = pickupState === 'auto-rule' ? (autoWin && (
    <p className="mt-6 flex flex-wrap items-center gap-x-1.5 rounded-lg bg-warm-50 px-4 py-3 text-[13px] text-ink-2">
      <b className="text-ink">Pickup is booked automatically</b>
      <span>· {fmtWin(autoWin)} ({autoRuleText})</span>
      {pickupCfg.autoPickup.slotConfirmation && <span>· you will be asked to confirm the slot</span>}
    </p>
  )) : pickupState === 'auto-ask' || (pickupState === 'manual' && !hid('addrWindow')) ? (
    <div className="mt-6">
      {/* the group's title carries required / optional once — its three fields carry no star of their own */}
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[14px] font-bold text-ink">
          Pickup window{askWindow || need('addrWindow')
            ? <span className="req-star">*</span>
            : <span className="ml-1.5 text-[13px] font-normal text-ink-3" title="Leave it empty to book the pickup later from Shipments">· Optional</span>}
        </span>
        {pickupState === 'manual' && hasWindow && !need('addrWindow') && (
          <button type="button" onClick={() => setSender((x) => ({ ...x, windowStart: '', windowEnd: '' }))}
            className="text-[12px] font-bold text-brand-500 hover:text-brand-600">Clear</button>
        )}
      </div>
      <SlotWindowFields required={false} startAt={sender.windowStart ?? ''} endAt={sender.windowEnd ?? ''} policy={pickupPol} ok={slotOk}
        onChange={(w) => setSender((x) => ({ ...x, windowStart: w.startAt, windowEnd: w.endAt }))}
        error={windowErr || (showErrors && (askWindow || need('addrWindow')) && !hasWindow ? 'Choose a pickup date and time.' : null)} />
      {askWindow && (
        <p className="mt-1 text-[12px] text-ink-3">
          {`Booked automatically in this window · up to ${pickupCfg.bookingHorizonDays} days ahead · same-day cut-off ${pickupCfg.sameDayCutoff}`}
        </p>
      )}
    </div>
  ) : null
  const fromSide = <>
    {addressSlot('from', 0, merchantMode ? null : 'Ship From')}
    {/* Grow's pickup window keeps to the left half when the ends are one under the other */}
    <div className={merchantMode && stackAddr ? '@min-[600px]:w-1/2 @min-[600px]:pr-3' : ''}>{merchantMode ? merchantPickupWindow : windowCells('from', 0)}</div>
    {typeRule.rto && (
      <div className="mt-4">
        <InlineSwitch label="RTO address same as Ship From address" title="If it can't be delivered, it comes back to the Ship From address"
          checked={(c.rtoMode ?? RTO_MODES[0]) === RTO_MODES[0]} onChange={(same) => setC({ rtoMode: same ? RTO_MODES[0] : RTO_MODES[1] })} />
      </div>
    )}
    {typeRule.rto && c.rtoMode === RTO_MODES[1] && <div className="mt-5">{addressSlot('rto', 0, 'Return To Origin (RTO) address')}</div>}
  </>
  const toSide = <>
    {allDrops.map((_, i) => (
      <div key={i} className={i > 0 ? 'mt-6 border-t border-warm-200 pt-5' : ''}>
        {addressSlot('to', i, allDrops.length > 1 ? `Ship To · Address ${i + 1}` : merchantMode ? null : 'Ship To', i > 0 ? (
          <Tip text="Remove this address"><button type="button" aria-label={`Remove address ${i + 1}`} onClick={() => removeDrop(i - 1)}
            className="text-ink-3 transition-colors hover:text-brand-500"><CircleMinus size={16} /></button></Tip>
        ) : undefined)}
        {windowCells('to', i)}
      </div>
    ))}
    {/* scheduling is about the DELIVERY — asked beside its window */}
    {!hid('schedulingConfirmation') && (
      <div className="mt-4"><Configurable fieldKey="schedulingConfirmation">
        <InlineSwitch label={lbl('schedulingConfirmation')} title={SWITCH_HINTS.schedulingConfirmation} checked={!!c.schedulingConfirmation} onChange={(v) => setC({ schedulingConfirmation: v })} />
      </Configurable></div>
    )}
    {/* multi-drop is a dedicated-truck booking: every address needs a vehicle */}
    {(isFtl || (merchantMode && mode === 'ftl')) && <div className="mt-6"><AddMoreButton label="Add delivery address" onClick={() => setDrops((ds) => [...ds, blankParty()])} /></div>}
  </>
  /* while the form is edited: how the addresses are shown — card choices (owner, 2026-10-06), each form its own */
  /** the header button that opens a card's display options while the form is edited */
  const optsButton = (id: string, label: string) => (
    <button type="button" aria-expanded={cardOpts === id} onClick={() => setCardOpts((o) => (o === id ? null : id))}
      className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors
        ${cardOpts === id ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-line bg-surface text-ink-2 hover:bg-warm-50 hover:text-ink'}`}>
      <SlidersHorizontal size={12} />{label}{cardOpts === id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  )
  /* owner, 2026-10-28 ("simplify it, its effect visible in real time"): ONE row — Layout · Ship From · Ship To · RTO — and a
     choice changes the form underneath at once. Both forms use the same components now, so it sets both forms' display. */
  const addressLayoutPanel = editing && cardOpts === 'parties' && (
    <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-warm-50 px-4 py-3">
      {ADDRESS_LAYOUT_ROWS.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <span className="shrink-0 text-[13px] text-ink-2">{row.label}</span>
          <LayoutSeg label="" value={draft.layout.console[row.key]}
            onChange={(v) => { for (const p of ['console', 'grow'] as const) setLayoutOf(p, (l) => ({ ...l, [row.key]: v }) as FormLayout) }}
            options={row.options.map((o) => ({ value: o.value, label: o.label, tip: o.sub }))} />
        </div>
      ))}
    </div>
  )
  /* Grow (owner, 2026-10-27, the Grow team's form): Ship From and Ship To are two cards, each the full width — the picker
     on the left and the saved card on the right, or the fields four across */
  const merchantToSection = (
    <FormCard id="sec-to" title="Ship To" caption={anyInline ? 'Search a saved address, or type the address here.' : 'Pick a saved address or add a new one.'}>
      <div className="@container">{toSide}</div>
    </FormCard>
  )
  const partiesSection = growLook ? (
    <FormCard id="sec-parties" title="Ship From" action={editing ? optsButton('parties', 'Address display') : undefined}
      caption={anyInline ? 'Search a saved address, or type the address here.' : 'Pick a saved address or add a new one.'}>
      {addressLayoutPanel}
      <div className="@container">{fromSide}</div>
      {addressModal}
    </FormCard>
  ) : (
    <FormCard id="sec-parties" title="Ship From → Ship To" action={editing ? optsButton('parties', 'Address display') : undefined}
      caption={ctype === 'Transfer' ? 'Stock moving between two facilities — pick a hub at each end.'
        : anyInline ? 'Search a saved address, or type the address here.'
        : merchantMode ? 'Pick a saved address or add a new one.' : 'Pick a saved address or add a new one — a hub or a customer address.'}>
      {addressLayoutPanel}
      {/* owner, 2026-10-06: Ship From | Ship To, one beside the other, however the addresses are entered (the second
          branch's combined card) — a container query, so they stack only when the CARD is narrow (the Summary beside the
          form, a pinned rail), never because of the viewport alone; or, by the builder's Layout, one under the other */}
      <div className="@container">
        {stackAddr
          ? (
            <div>
              <div className="min-w-0">{fromSide}</div>
              <div className="mt-6 min-w-0 border-t border-warm-200 pt-5">{toSide}</div>
            </div>
          )
          : (
            <div className="grid gap-y-10 @min-[720px]:grid-cols-2">
              <div className="min-w-0 @min-[720px]:pr-8">{fromSide}</div>
              <div className="min-w-0 border-t border-warm-200 pt-5 @min-[720px]:border-l @min-[720px]:border-t-0 @min-[720px]:pl-8 @min-[720px]:pt-0">{toSide}</div>
            </div>
          )}
      </div>
      {/* owner, 2026-10-27: no Shipment legs line here — how it moves is the Hub processing switch in Service & instructions */}
      {addressModal}
    </FormCard>
  )

  /* ------------------------------------------------------------ handling — asked on the GOODS (owner,
     2026-09-29: "barcode labels should be asked at package level"): what the goods are like, whether every
     box is labelled, whether the pieces may travel apart, and their tags. Consignment-level fields, as
     before — the package editor / vehicle card just asks them. */
  /* one line (owner, 2026-09-29: "can this section be merged … least scroll"): the six flags as chips,
     then the two box questions as compact toggles (their explanation in the tooltip), then Tags */
  /* owner, 2026-09-29: Handling is its OWN card (between the goods and the service) — and only when something in it
     is shown (every category and toggle hidden = no card, no gap) */
  const handlingSection = (
    <FormCard id="sec-handling" title="Handling" caption="How the goods must be handled on the way.">
    <>
    <div role="group" aria-label="Handling">
      {/* row 1 — what the goods are like: six pill chips */}
      {handlingChipsVisible && <div className="flex flex-wrap items-center gap-2">
        {arrange(sortApi, 'handling-chips', GOODS_CATEGORIES.filter(({ name }) => !hid(catKey(name))).map(({ name, icon: Icon }): RevealEntry => {
          const on = hasCat(name)
          return [null, (
            <Configurable key={name} fieldKey={catKey(name)}>
            <button type="button" aria-pressed={on} onClick={() => toggleCategory(name, !on)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors
                ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
              <Icon size={14} className={on ? 'text-brand-500' : 'text-warm-400'} />{lbl(catKey(name))}
            </button>
            </Configurable>
          )]
        }), () => false, true, 'chips').nodes}
      </div>}
      {/* row 2 — how the boxes travel, and their tags; every control on one baseline */}
      {/* owner, 2026-10-28 ("make every toggle like the Delivery type field"): each switch is a field — its name above, a switch
          box with an icon below — in the field grid, Tags beside them */}
      {switchesRow && <div className={handlingChipsVisible ? 'mt-6' : ''}><SGrid>
        {arrange(sortApi, 'handling-switches', [
          /* owner, 2026-10-28: the Task type (Direct Delivery — was "Delivery type") sits with the other switches */
          !hid('hubProcessing') && [null, <Fragment key="hubProcessing">{directDeliveryField}</Fragment>],
          !hid('scannable') && [null, (
            <SFld key="scannable" fieldKey="scannable" label={custom('scannable', 'Scannable', 'Barcode labels')}>
              <SwitchBox icon={ScanBarcode} label="Barcode on every box" checked={!!c.scannable} onChange={setBarcodeAll}
                title={barcodeEach || (!isFtl && !useItems) ? `${SWITCH_HINTS.scannable} On = every package line is one box; its quantity stays 1.` : SWITCH_HINTS.scannable} />
            </SFld>
          )],
          !hid('splittable') && [null, (
            <SFld key="splittable" fieldKey="splittable" label="Delivery in parts">
              <SwitchBox icon={Split} label="Can be split" checked={!!c.splittable} onChange={(v) => setC({ splittable: v })} title={SWITCH_HINTS.splittable} />
            </SFld>
          )],
          !hid('clearanceRequired') && [null, (
            <SFld key="clearanceRequired" fieldKey="clearanceRequired" label={lbl('clearanceRequired')}>
              <SwitchBox icon={ShieldCheck} label="Needs clearance" checked={!!c.clearanceRequired} onChange={(v) => setC({ clearanceRequired: v })} title={SWITCH_HINTS.clearanceRequired} />
            </SFld>
          )],
          !hid('tags') && [null, (
            <SFld key="tags" fieldKey="tags" label={lbl('tags')} required={need('tags')}>
              <MultiSelectDropdown options={TAG_OPTIONS} values={c.tags ?? []} noun="tags" placeholder="Add tags" onChange={(v) => setC({ tags: v })} />
            </SFld>
          )],
        ], () => false, true).nodes}
      </SGrid></div>}
      {/* Grow (owner, 2026-10-06: "Tags and Dedicate Truck in one line"): the two as fields side by side, labels on top,
          the field grid's widths — Load type = the Dedicate Truck switch (on = a full vehicle, picked in Vehicle Details) */}
      {growLook && (!hid('dedicateTruck') || !hid('hubProcessing')) && (
        <div className={`${handlingChipsVisible || switchesRow ? 'mt-6' : ''} grid grid-cols-1 ${FIELD_GAPS} sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`}>
          {/* 2026-10-07: a builder field on Grow too — hidden, every order books the builder's default (shared unless set) */}
          {!hid('dedicateTruck') && (
            <SFld fieldKey="dedicateTruck" label={custom('dedicateTruck', 'Dedicate Truck', 'Load type')}>
              <SwitchBox icon={Truck} label="Dedicate Truck" checked={mode === 'ftl'} disabled={!!fromOverage || pr?.shipmentType === 'FTL' || truckHidden}
                onChange={(on) => changeMode(on ? 'ftl' : 'ltl')}
                title={mode === 'ftl' ? 'Full vehicle (FTL / FCL) — its vehicles are picked in Vehicle Details' : 'Shared vehicle (LTL / LCL) — switch on for a whole vehicle'} />
            </SFld>
          )}
          {/* owner, 2026-10-27: Delivery type on Grow too, beside Load type */}
          {!hid('hubProcessing') && directDeliveryField}
        </div>
      )}
      {need('tags') && !(c.tags ?? []).length && showErrors && <ErrLine className="mt-2">Add at least one tag.</ErrLine>}
    </div>
    {handlingCustom.nodes.length > 0 && <SGrid className={handlingChipsVisible || handlingTogglesVisible ? 'mt-6' : ''}>{handlingCustom.nodes}</SGrid>}
    <RevealToggle open={secOpen('sec-handling')} onToggle={() => toggleSec('sec-handling')} waiting={handlingCustom.waiting} waitingFilled={handlingCustom.waitingFilled} className="mt-6" />
    </>
    </FormCard>
  )

  /* ------------------------------------------------------------ 3 · Package & SKU (parcel) */
  const packageTypeOpts = [...packageTypes.map((t) => ({ value: t.code, label: t.name })), { value: CUSTOM_PACKAGE, label: CUSTOM_PACKAGE_NAME }]
  const packageTypeTitle = packageTypes.length === 0 ? 'No presets in the Package master — enter dimensions'
    : !ownPresets ? `Showing all package types — none assigned to ${merchant?.name ?? 'this merchant'}` : undefined
  const [skuMore, setSkuMore] = useState<Set<string>>(new Set())
  const flip = <T,>(s: Set<T>, k: T) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n }
  /* a SKU line's columns — Unit Weight and Dimensions leave when the builder hides them (2026-10-07) */
  const skuWHid = hid('skuWeight')
  const skuDHid = hid('skuDimensions')
  /* a SKU line is ONE line (owner, 2026-10-07: "in SKU it should be in one line, in both Grow and the console"): every detail
     the builder shows and does NOT put under "More" (Grow: HSN Code · Origin Country · Unit Cost; any the console moves out
     of More) is a column of the line itself, headed like Unit Weight; the rest wait behind the chevron */
  const SKU_INLINE_ORDER = ['skuCategory', 'skuDescription', 'skuHsn', 'skuOrigin', 'skuUnitCost', 'skuImage'] as const
  const SKU_INLINE_W: Record<string, string> = { skuCategory: 'minmax(0,1fr)', skuDescription: 'minmax(0,1.2fr)', skuHsn: '112px', skuOrigin: 'minmax(0,1.1fr)', skuUnitCost: '112px', skuImage: 'minmax(0,1fr)' }
  const skuInline: string[] = SKU_INLINE_ORDER.filter((k) => !hid(k) && !inMore(k))
  /* Grow (owner, 2026-10-27, the Grow team's form): the short headers — Qty, Cost — unless the builder renamed them */
  const skuInlineLabel = (k: string) => (k === 'skuUnitCost' ? (growLook ? ownLbl(k, 'Cost') : `${lbl(k)} (${currency})`)
    : growLook && k === 'skuDescription' ? ownLbl(k, 'Description') : lbl(k))
  const SKU_COLS = 'grid items-start gap-x-3'
  /** a SKU line's default widths (3 units a field): Name wider, Quantity narrow */
  const SKU_LINE_W: Record<string, FieldWidth> = { skuNameCol: 'l', skuQtyCol: 's' }
  /** a SKU column's width by the builder (owner, 2026-10-28): S about half · M its own · L about double · Full wider still */
  const skuColW = (k: string, base: string) => {
    const w = rules[k]?.width
    if (!w || w === 'm') return base
    /* S is about three quarters of M, never below a usable floor (owner, 2026-10-28: "see the difference between S and M") */
    if (k === 'skuDimensions') return w === 's' ? 'minmax(150px,1.1fr)' : w === 'l' ? 'minmax(220px,2.4fr)' : 'minmax(260px,3.2fr)'
    const px = /^(\d+)px$/.exec(base)
    if (px) return `${Math.max(80, Math.round(Number(px[1]) * (w === 's' ? 0.75 : w === 'l' ? 1.8 : 2.4)))}px`
    return w === 's' ? 'minmax(96px,1fr)' : w === 'l' ? 'minmax(0,2.4fr)' : 'minmax(0,3.2fr)'
  }
  /* Grow: SKU Code · Name · Qty · Description · HSN Code · Origin Country · Cost · L × W × H · Weight — no # and no Total */
  /* owner, 2026-10-28 ("I cannot rearrange the SKU fields and change their sizes"): the SKU line's own columns (Unit Weight,
     Dimensions and every detail shown on the line) follow the field order — drag a header while the form is edited (zone
     `sku-cols`) — and each takes the builder's Width (S / M / L / Full, `skuColW`). SKU Code · Name · Quantity stay first. */
  const SKU_COL_BASE: Record<string, string> = { skuCodeCol: 'minmax(0,1.3fr)', skuNameCol: 'minmax(0,1.4fr)', skuQtyCol: '84px', skuWeight: '104px', skuDimensions: 'minmax(0,1.5fr)', ...SKU_INLINE_W }
  /* owner, 2026-10-28: SKU Code · Name · Quantity move too (always shown — required) */
  const skuVarCols = applyOrder(['skuCodeCol', 'skuNameCol', 'skuQtyCol', ...(skuWHid ? [] : ['skuWeight']), ...(skuDHid ? [] : ['skuDimensions']), ...skuInline],
    (x) => x, fieldOrder['sku-cols'])
  const skuColsStyle = { gridTemplateColumns: (growLook
    ? ['minmax(0,1.2fr)', 'minmax(0,1.3fr)', '60px', ...skuInline.map((k) => (k === 'skuUnitCost' ? '92px' : 'minmax(0,1fr)')),
      ...(skuDHid ? [] : ['132px']), ...(skuWHid ? [] : ['88px']), 'max-content']
    : ['28px', ...skuVarCols.map((k) => skuColW(k, SKU_COL_BASE[k])), '80px', '96px']).join(' ') }
  const skuMinWidth = growLook ? 600 + skuInline.length * 90 : 860 + skuInline.length * 130
  /** picked from the SKU master (its name / size / weight came with it) vs typed by hand */
  const isMasterSku = (it: ParcelItem) => !!it.skuCode && masters.skus.some((sk) => sk.code === it.skuCode)
  /** a SKU line's details (owner, 2026-10-06: "Grow — HSN Code, Origin Country and Cost in the default view"): the ones not
      under "More" sit on the line's second row (Grow: HSN · Origin · Cost; the console: none); the rest wait behind the
      chevron at the line's end and open IN PLACE. `open` = the chevron is open (or the form is edited). */
  /** a SKU's detail fields (Category, Description, HSN, Origin, Unit Cost, Image) — the details grid and the SKU line share them */
  const skuDetailEntries = (it: ParcelItem, patch: (p: Partial<ParcelItem>) => void, off: (k: string) => boolean): RevealEntry[] => [
      !off('skuCategory') && ['skuCategory', <F key="skuCategory" fieldKey="skuCategory" label={lbl('skuCategory')} value={it.category ?? ''}
        options={opts([...new Set([...masters.skus.map((sk) => sk.category).filter(Boolean), ...(it.category ? [it.category] : [])])])}
        onChange={(v) => patch({ category: v })} />, filled(it.category)],
      !off('skuDescription') && ['skuDescription', <F key="skuDescription" fieldKey="skuDescription" label={lbl('skuDescription')} value={it.description ?? ''}
        placeholder="eg, Water Bottle" onChange={(v) => patch({ description: v })} />, filled(it.description)],
      !off('skuHsn') && ['skuHsn', <F key="skuHsn" fieldKey="skuHsn" label={lbl('skuHsn')} value={it.hsnCode ?? ''} placeholder="eg, 851713"
        onChange={(v) => patch({ hsnCode: v })} />, filled(it.hsnCode)],
      !off('skuOrigin') && ['skuOrigin', <F key="skuOrigin" fieldKey="skuOrigin" label={lbl('skuOrigin')} value={it.originCountry ?? ''} placeholder="eg, Philippines" searchable
        options={opts([...new Set([...COUNTRIES, ...(it.originCountry ? [it.originCountry] : [])])])} onChange={(v) => patch({ originCountry: v })} />, filled(it.originCountry)],
      !off('skuUnitCost') && ['skuUnitCost', <FNum key="skuUnitCost" fieldKey="skuUnitCost" label={`${lbl('skuUnitCost')} (${currency})`} blankZero placeholder="eg, 12.34"
        value={it.unitCost ?? 0} onChange={(n) => patch({ unitCost: n })} />, (it.unitCost ?? 0) > 0],
      !off('skuImage') && ['skuImage', <F key="skuImage" fieldKey="skuImage" label={lbl('skuImage')} value={it.imageUrl ?? ''}
        onChange={(v) => patch({ imageUrl: v })} />, filled(it.imageUrl)],
  ]
  const skuDetails = (it: ParcelItem, patch: (p: Partial<ParcelItem>) => void, open: boolean, skipInline = false) => {
    const off = (k: string) => hid(k) || (skipInline && skuInline.includes(k))
    const r = arrange(sortApi, 'sku-details', skuDetailEntries(it, patch, off), inMore, open)
    return { node: r.nodes.length ? <SGrid className="mt-5 pl-10">{r.nodes}</SGrid> : null, waiting: r.waiting, waitingFilled: r.waitingFilled }
  }
  /** one inline detail as a bare control (its header names it) — same inputs as the details grid */
  const skuInlineCell = (k: string, it: ParcelItem, patch: (p: Partial<ParcelItem>) => void): ReactNode => {
    switch (k) {
      case 'skuCategory': {
        const list = [...new Set([...masters.skus.map((sk) => sk.category).filter(Boolean), ...(it.category ? [it.category] : [])])]
        return <MenuSelect value={it.category ?? ''} placeholder="Select" options={list} onChange={(v) => patch({ category: v })} />
      }
      case 'skuDescription': return <Input value={it.description ?? ''} placeholder="eg, Water Bottle" onChange={(v) => patch({ description: v })} />
      case 'skuHsn': return <Input value={it.hsnCode ?? ''} placeholder="eg, 851713" onChange={(v) => patch({ hsnCode: v })} />
      case 'skuOrigin': return <MenuSelect value={it.originCountry ?? ''} placeholder="eg, Philippines" searchable
        options={[...new Set([...COUNTRIES, ...(it.originCountry ? [it.originCountry] : [])])]} onChange={(v) => patch({ originCountry: v })} />
      case 'skuUnitCost': return <NumBox blankZero placeholder="eg, 12.34" value={it.unitCost ?? 0} onChange={(n) => patch({ unitCost: n })} />
      default: return <Input value={it.imageUrl ?? ''} placeholder="https://" onChange={(v) => patch({ imageUrl: v })} />
    }
  }
  /** the chevron at a SKU line's end — what waits under its "More" */
  const skuMoreButton = (open: boolean, waiting: number, waitingFilled: number, label: string, onClick: () => void) => {
    const words = open ? 'Hide SKU details' : `More SKU details · ${plural(waiting, 'field')}${waitingFilled ? `, ${waitingFilled} filled` : ''}`
    return (
      <Tip text={words}><button type="button" aria-label={`${label} details`} aria-expanded={open} onClick={onClick}
        className="inline-flex h-8 w-7 items-center justify-center rounded-md border border-warm-200 text-ink-3 hover:bg-warm-50 hover:text-ink">
        {/* owner, 2026-09-29: a chevron only — the words are in the tooltip */}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button></Tip>
    )
  }
  const [itemMore, setItemMore] = useState<Set<string>>(new Set())

  /* Items (the Packages section hidden — SKU-based): one line per SKU — search, how many, done. Size and weight come from
     the SKU master and are asked only when the master has none; shown and typed in the list's units. */
  const iu = unitsOf(itemUnit)
  const ITEM_COLS = 'grid items-start gap-x-4'
  /* the SKU-only table's own columns follow the same order (zone `sku-cols`) and widths as the package SKU table */
  const itemInline = applyOrder(skuInline, (x) => x, fieldOrder['sku-cols'])
  const itemColsStyle = { gridTemplateColumns: ['28px', 'minmax(0,2.2fr)', '112px', 'minmax(0,1.9fr)', ...itemInline.map((k) => skuColW(k, SKU_INLINE_W[k])), '96px', '104px'].join(' ') }
  const itemTotals = itemParcels.reduce((t, p) => ({
    pieces: t.pieces + p.quantity, kg: t.kg + p.weight * p.quantity, cm3: t.cm3 + p.l * p.w * p.h * p.quantity,
  }), { pieces: 0, kg: 0, cm3: 0 })
  const itemsBlock = (
    <div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 760 + itemInline.length * 130 }}>
          <div className={`${ITEM_COLS} border-b border-warm-200 pb-2 field-label`} style={itemColsStyle}>
            <span>#</span>
            <span>SKU<span className="req-star">*</span></span>
            <span>Quantity<span className="req-star">*</span></span>
            <span>Each unit</span>
            {arrange(sortApi, 'sku-cols', itemInline.map((k): RevealEntry => [null, (
              <Configurable key={k} fieldKey={k}><span className="block break-words" title={skuInlineLabel(k)}>{skuInlineLabel(k)}</span></Configurable>
            )]), () => false, true).nodes}
            <span className="text-right">Total</span>
            <span />
          </div>
          {lines.map((l, n) => {
            const it = l.item
            const picked = !!it.skuCode
            const dimsOk = (it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0
            const weightOk = it.weightKg > 0
            /* only what the builder still asks (2026-10-07: a SKU's weight / size can be hidden or optional) */
            const askW = !skuWHid && !weightOk
            const askD = !skuDHid && !dimsOk
            /* a typed SKU has nothing from the master — its details start open */
            const open = itemMore.has(l.id) !== (picked && !isMasterSku(it))
            /* while the form is edited the details show on the empty sample line too — so they can be picked, moved and sized */
            const det = picked || editing ? skuDetails(it, (patch) => setLine(l.id, patch), open || editing, true) : null
            return (
              <div key={l.id} className="border-b border-warm-200 py-3 last:border-0">
              <div className={ITEM_COLS} style={itemColsStyle}>
                <span className="flex h-8 items-center text-[13px] text-ink-3">{n + 1}</span>
                <div className="min-w-0">
                  <SkuCode item={it} skus={masters.skus} onPick={(sk) => pickLineSku(l.id, sk)} autoFocus={focusItem === l.id}
                    onCustom={(code) => setLine(l.id, { ...blankItem(), skuCode: code, quantity: it.quantity })}
                    onUnlink={() => setLine(l.id, { ...blankItem(), quantity: it.quantity })} />
                  {picked && (isMasterSku(it)
                    ? <p className="mt-1 truncate text-[13px] text-ink" title={it.name}>{it.name}</p>
                    : <div className="mt-2"><Input value={it.name} placeholder="SKU name, eg, Refrigerator 300 L" onChange={(v) => setLine(l.id, { name: v })} /></div>)}
                </div>
                <NumBox integer min={1} blankZero placeholder="1" value={it.quantity} error={err(it.quantity < 1)}
                  onChange={(q) => setLine(l.id, { quantity: q })} />
                <div className="min-w-0">
                  {!picked ? <span className="flex h-8 items-center text-[13px] text-ink-3">Pick a SKU</span>
                    : !askW && !askD
                      ? <span className="flex h-8 items-center text-[13px] text-ink-2">
                          {[weightOk && `${round2(iu.toW(it.weightKg))} ${iu.w}`, dimsOk && `${iu.toD(it.lengthCm ?? 0)} × ${iu.toD(it.widthCm ?? 0)} × ${iu.toD(it.heightCm ?? 0)} ${iu.d}`]
                            .filter(Boolean).join(' · ') || '—'}
                        </span>
                      : (
                        /* the SKU master has no size / weight for this SKU — ask only what is missing */
                        <div className={`grid gap-2 ${askW && askD ? 'grid-cols-[88px_minmax(0,1fr)]' : 'grid-cols-1'}`}>
                          {askW && <NumBox unit={iu.w} blankZero placeholder={iu.w} value={iu.toW(it.weightKg)} precision={iu.precision} error={err(need('skuWeight') && !weightOk)}
                            onChange={(w) => setLine(l.id, { weightKg: iu.fromW(w) })} />}
                          {askD && <DimsBox error={need('skuDimensions')} units={iu} l={it.lengthCm ?? 0} w={it.widthCm ?? 0} h={it.heightCm ?? 0}
                            onChange={(d) => setLine(l.id, { ...(d.l !== undefined ? { lengthCm: d.l } : {}), ...(d.w !== undefined ? { widthCm: d.w } : {}), ...(d.h !== undefined ? { heightCm: d.h } : {}) })} />}
                          <p className={`${askW && askD ? 'col-span-2' : ''} text-[12px] text-ink-3`}>Not in the SKU master — enter {askW && askD ? 'the weight and size' : askW ? 'the weight' : 'the size'} of one unit.</p>
                        </div>
                      )}
                </div>
                {itemInline.map((k) => <div key={k} className="min-w-0">{picked || editing ? skuInlineCell(k, it, (patch) => setLine(l.id, patch)) : null}</div>)}
                <span className="flex h-8 items-center justify-end text-[13px] tabular-nums text-ink">
                  {picked && weightOk && it.quantity ? `${round2(iu.toW(it.weightKg * it.quantity))} ${iu.w}` : '-'}
                </span>
                <span className="flex items-center justify-end gap-1">
                  {det && det.waiting > 0 && !editing && skuMoreButton(open, det.waiting, det.waitingFilled, `SKU line ${n + 1}`, () => setItemMore((st) => flip(st, l.id)))}
                  <Tip text="Remove SKU"><button type="button" aria-label={`Remove SKU line ${n + 1}`} onClick={() => removeLine(l.id)}
                    className="inline-flex h-8 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
                    <Trash2 size={14} />
                  </button></Tip>
                </span>
              </div>
              {det?.node}
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <AddRowLink label="Add SKU" onClick={addLine} />
        <span className="text-[13px] text-ink-2">
          {itemTotals.pieces
            ? <>{plural(itemTotals.pieces, 'piece')} · {round2(iu.toW(itemTotals.kg))} {iu.w} · {iu.vol(itemTotals.cm3)} — each unit ships as its own piece</>
            : 'Search the SKU master, or type any code — a new SKU asks for its name, size and weight'}
        </span>
      </div>
      {itemParcels.length === 0 && <ErrLine className="mt-2">Pick at least one SKU.</ErrLine>}
    </div>
  )
  /* ---- Package & SKU (owner, 2026-09-29; 2026-10-06: no "How goods are entered" — the builder hides the SKUs or the
     packages instead): each package with its SKUs, and every Add button BELOW what it adds to — Add SKU under its SKUs,
     Add Package under all the packages. A package's units (kg + cm or lb + in) sit in its header; its SKUs follow. */
  const skuTable = (rows: ReactNode, u: Units) => growLook ? (
    /* Grow (owner, 2026-10-27, the Grow team's form): a framed table, its header on a grey band */
    <div className="overflow-x-auto rounded-lg border border-warm-200">
      <div style={{ minWidth: skuMinWidth }}>
        <div className={`${SKU_COLS} border-b border-warm-200 bg-warm-50 px-4 py-2.5 field-label`} style={skuColsStyle}>
          <span>SKU Code<span className="req-star">*</span></span>
          <span>Name<span className="req-star">*</span></span>
          <span>Qty<span className="req-star">*</span></span>
          {skuInline.map((k) => <Configurable key={k} fieldKey={k}><span className="block break-words" title={skuInlineLabel(k)}>{skuInlineLabel(k)}</span></Configurable>)}
          {!skuDHid && <Configurable fieldKey="skuDimensions"><span className="block break-words">L × W × H ({u.d}){need('skuDimensions') && <span className="req-star">*</span>}</span></Configurable>}
          {!skuWHid && <Configurable fieldKey="skuWeight"><span className="block break-words">{ownLbl('skuWeight', 'Weight')} ({u.w}){need('skuWeight') && <span className="req-star">*</span>}</span></Configurable>}
          <span />
        </div>
        <div className="px-4">{rows}</div>
      </div>
    </div>
  ) : (
    /* each SKU line carries its own field names (owner, 2026-10-28) — no shared header */
    <div className="grid gap-3">{rows}</div>
  )
  /** one SKU line — code (master or typed) · name · quantity · unit weight · L × W × H · total · details, in its package's
      units. `preview` = the builder's SAMPLE line (owner, 2026-10-05: "one should be shown, otherwise I have to click Add
      before I can configure them"): every column and the details show, and nothing is written. */
  const skuRow = (it: ParcelItem, i: number, k: number, n: number, preview = false) => {
    const k2 = k
    const key = preview ? `sample:${i}` : `${i}:${k}`
    const u = unitsOf(parcels[i])
    const upd = (patch: Partial<ParcelItem>) => { if (!preview) setItem(i, k, patch) }
    const open = skuMore.has(key) !== (!!it.skuCode && !isMasterSku(it))
    const det = skuDetails(it, upd, open || editing, true)
    const missing = [!it.skuCode && 'SKU code', !filled(it.name) && 'name', !(it.quantity >= 1) && 'quantity',
      need('skuWeight') && !(it.weightKg > 0) && 'weight',
      need('skuDimensions') && !((it.lengthCm ?? 0) > 0 && (it.widthCm ?? 0) > 0 && (it.heightCm ?? 0) > 0) && 'dimensions']
      .filter(Boolean) as string[]
    const vol = (it.lengthCm ?? 0) * (it.widthCm ?? 0) * (it.heightCm ?? 0)
    /* owner, 2026-10-28 ("can't edit the SKUs where packages and SKUs are both on — make it more like the package fields"): a SKU
       line is a field row like a package's — every field with its name above it, in one zone (`sku-line`): drag to move, S / M / L /
       Full, show for Ops / Grow, Required, More. SKU Code · Name · Quantity are always asked. */
    if (!growLook) {
      const ln = arrange(sortApi, 'sku-line', [
        [null, <SFld key="skuCodeCol" label="SKU Code" required>
          <SkuCode item={it} skus={masters.skus} onPick={(sk) => { if (!preview) pickSku(i, k, sk) }} onUnlink={() => upd({ skuCode: null })}
            onCustom={(code) => upd({ skuCode: code })} autoFocus={!preview && focusLine?.i === i && focusLine.k === k} />
        </SFld>],
        [null, <SFld key="skuNameCol" label="Name" required>
          <Input value={it.name} placeholder="eg, Refrigerator 300 L" disabled={isMasterSku(it)} onChange={(v) => upd({ name: v })} />
        </SFld>],
        [null, <SFld key="skuQtyCol" label="Quantity" required>
          <NumBox integer min={1} blankZero placeholder="1" value={it.quantity} error={err(it.quantity < 1)} onChange={(q) => upd({ quantity: q })} />
        </SFld>],
        !hid('skuWeight') && ['skuWeight', <SFld key="skuWeight" fieldKey="skuWeight" label={ownLbl('skuWeight', 'Unit Weight')} required={need('skuWeight')}>
          <NumBox unit={u.w} blankZero placeholder="0" value={u.toW(it.weightKg)} precision={u.precision} error={err(need('skuWeight') && !(it.weightKg > 0))}
            onChange={(w) => upd({ weightKg: u.fromW(w) })} />
        </SFld>, it.weightKg > 0],
        !hid('skuDimensions') && ['skuDimensions', <SFld key="skuDimensions" fieldKey="skuDimensions" label={`${ownLbl('skuDimensions', 'Dimensions')} (${u.d})`} required={need('skuDimensions')}>
          <DimsBox units={u} l={it.lengthCm ?? 0} w={it.widthCm ?? 0} h={it.heightCm ?? 0} error={need('skuDimensions')}
            onChange={(d) => upd({ ...(d.l !== undefined ? { lengthCm: d.l } : {}), ...(d.w !== undefined ? { widthCm: d.w } : {}), ...(d.h !== undefined ? { heightCm: d.h } : {}) })} />
        </SFld>, vol > 0],
        ...skuDetailEntries(it, upd, hid),
      ], inMore, open || editing, undefined, (id) => {
        const w = rules[id]?.width ?? SKU_LINE_W[id] ?? 'm'
        return (id === 'skuDimensions' ? DIMS3 : SPAN3)[w]
      })
      const totalW = it.weightKg && it.quantity ? `${round2(u.toW(it.weightKg * it.quantity))} ${u.w}` : ''
      return (
        <div key={key} className={`rounded-lg border border-line px-4 pb-4 pt-3 ${preview ? 'bg-warm-25' : 'bg-surface'}`}>
          <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[13px] font-bold text-ink">SKU {n + 1}</span>
            {separateLayout && parcels.length > 1 && <span className="text-[12px] text-ink-3">In Package {i + 1}</span>}
            {(totalW || vol * it.quantity > 0) && <span className="text-[12px] text-ink-3">Total {[totalW, vol * it.quantity > 0 && u.vol(vol * it.quantity)].filter(Boolean).join(' · ')}</span>}
            {preview && <span className="rounded-full border border-line bg-surface px-1.5 text-[11px] leading-4 text-ink-3">Sample line — how a SKU is entered (not saved)</span>}
            <span className="ml-auto flex items-center gap-1">
              {ln.waiting > 0 && !editing && skuMoreButton(open, ln.waiting, ln.waitingFilled, `SKU ${n + 1}`, () => setSkuMore((st) => flip(st, key)))}
              <Tip text="Remove SKU"><button type="button" aria-label={`Remove SKU ${n + 1}`} onClick={() => { if (!preview) removeItem(i, k) }}
                className="inline-flex h-8 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
                <Trash2 size={14} />
              </button></Tip>
            </span>
          </div>
          <GridColsCtx.Provider value={GRID_OWN}><div className="@container"><div className={ROW3}>{ln.nodes}</div></div></GridColsCtx.Provider>
          {missing.length > 0 && !preview && <ErrLine className="mt-2">Required: {missing.join(', ')}</ErrLine>}
        </div>
      )
    }
    return (
      <div key={key} className={`relative border-b border-warm-200 py-3 last:border-0 ${preview ? 'rounded-md bg-warm-25' : ''}`}>
        {preview && (
          <span className="pointer-events-none absolute -top-2 left-9 z-10 rounded-full border border-line bg-surface px-1.5 text-[11px] leading-4 text-ink-3">
            Sample line — how a SKU is entered (not saved)
          </span>
        )}
        <div className={SKU_COLS} style={skuColsStyle}>
          {!growLook && <span className="flex h-8 items-center text-[13px] text-ink-3" title={separateLayout && parcels.length > 1 ? `In Package ${i + 1}` : undefined}>{n + 1}</span>}
          {growLook && <>
          <SkuCode item={it} skus={masters.skus} onPick={(sk) => { if (!preview) pickSku(i, k, sk) }} onUnlink={() => upd({ skuCode: null })}
            onCustom={(code) => upd({ skuCode: code })} autoFocus={!preview && focusLine?.i === i && focusLine.k === k} />
          {/* a master SKU's name comes with it; a typed one is yours to name */}
          <Input value={it.name} placeholder="eg, Refrigerator 300 L" disabled={isMasterSku(it)} onChange={(v) => upd({ name: v })} />
          <NumBox integer min={1} blankZero placeholder="1" value={it.quantity} error={err(it.quantity < 1)} onChange={(q) => upd({ quantity: q })} />
            {skuInline.map((k) => <div key={k} className="min-w-0">{k === 'skuUnitCost'
              ? <NumBox blankZero placeholder="0" unit={currency} value={it.unitCost ?? 0} onChange={(c2) => upd({ unitCost: c2 })} />
              : skuInlineCell(k, it, upd)}</div>)}
            {!skuDHid && <DimsBox units={u} l={it.lengthCm ?? 0} w={it.widthCm ?? 0} h={it.heightCm ?? 0} error={need('skuDimensions')}
              onChange={(d) => upd({ ...(d.l !== undefined ? { lengthCm: d.l } : {}), ...(d.w !== undefined ? { widthCm: d.w } : {}), ...(d.h !== undefined ? { heightCm: d.h } : {}) })} />}
            {!skuWHid && <NumBox blankZero placeholder="0" value={u.toW(it.weightKg)} precision={u.precision} error={err(need('skuWeight') && !(it.weightKg > 0))}
              onChange={(w) => upd({ weightKg: u.fromW(w) })} />}
          </>}
          {!growLook && skuVarCols.map((k) => <div key={k} className="min-w-0">{k === 'skuCodeCol'
            ? <SkuCode item={it} skus={masters.skus} onPick={(sk) => { if (!preview) pickSku(i, k2, sk) }} onUnlink={() => upd({ skuCode: null })}
                onCustom={(code) => upd({ skuCode: code })} autoFocus={!preview && focusLine?.i === i && focusLine.k === k2} />
            : k === 'skuNameCol' ? <Input value={it.name} placeholder="eg, Refrigerator 300 L" disabled={isMasterSku(it)} onChange={(v) => upd({ name: v })} />
            : k === 'skuQtyCol' ? <NumBox integer min={1} blankZero placeholder="1" value={it.quantity} error={err(it.quantity < 1)} onChange={(q) => upd({ quantity: q })} />
            : k === 'skuWeight'
            ? <NumBox unit={u.w} blankZero placeholder="0" value={u.toW(it.weightKg)} precision={u.precision} error={err(need('skuWeight') && !(it.weightKg > 0))}
                onChange={(w) => upd({ weightKg: u.fromW(w) })} />
            : k === 'skuDimensions'
              ? <DimsBox units={u} l={it.lengthCm ?? 0} w={it.widthCm ?? 0} h={it.heightCm ?? 0} error={need('skuDimensions')}
                  onChange={(d) => upd({ ...(d.l !== undefined ? { lengthCm: d.l } : {}), ...(d.w !== undefined ? { widthCm: d.w } : {}), ...(d.h !== undefined ? { heightCm: d.h } : {}) })} />
              : skuInlineCell(k, it, upd)}</div>)}
          {!growLook && <span className="flex min-h-8 flex-col items-end justify-center text-[13px] tabular-nums text-ink-2">
            <span>{it.weightKg && it.quantity ? `${round2(u.toW(it.weightKg * it.quantity))} ${u.w}` : '-'}</span>
            {vol * it.quantity > 0 && <span className="text-[12px] text-ink-3">{u.vol(vol * it.quantity)}</span>}
          </span>}
          <span className="flex items-center justify-end gap-1">
            {det.waiting > 0 && !editing && skuMoreButton(open, det.waiting, det.waitingFilled, `SKU ${n + 1}`, () => setSkuMore((st) => flip(st, key)))}
            <Tip text="Remove SKU"><button type="button" aria-label={`Remove SKU ${n + 1}`} onClick={() => { if (!preview) removeItem(i, k) }}
              className="inline-flex h-8 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
              <Trash2 size={14} />
            </button></Tip>
          </span>
        </div>
        {missing.length > 0 && !preview && <ErrLine className={`mt-1.5 ${growLook ? '' : 'pl-10'}`}>Required: {missing.join(', ')}</ErrLine>}
        {det.node}
      </div>
    )
  }
  /** a new Package Id, kept once the box is left — the open package and its card follow it; never blank, never another's */
  const renamePackage = (i: number, id: string) => {
    const old = parcels[i]?.packageId
    if (!old || id === old) return
    if (parcels.some((x, j) => j !== i && x.packageId === id)) { toast.error(`Package Id ${id} is already used by another package`); return }
    setParcel(i, { packageId: id })
    if (openPkgId === old) setOpenPkgId(id)
  }
  /** a package's own fields — type · quantity · L × W × H · weight (+ tracking / Package Id / description / pallet in place),
      in the package's units */
  const packageFields = (p: Parcel, i: number, below?: ReactNode, adder?: ReactNode) => {
    const isCustom = packageValue(p, packageTypes) === CUSTOM_PACKAGE
    const u = unitsOf(p)
    /* owner, 2026-10-06 ("reduce quantity and weight width; Package Id in the line without expanding"): one wrapping row,
       each field its own width — Quantity and Weight narrow */
    const PKG_KEY: Record<string, string> = { type: 'pkgType', qty: 'pkgQty', dims: 'pkgDimensions', weight: 'pkgWeight', tr: 'pkgTracking', pid: 'pkgId', de: 'pkgDescription', ps: 'pkgPalletSpace' }
    /* owner, 2026-10-28 ("in Package and SKU too the builder's sizes should follow"): the package's fields sit in the same
       field grid as every card — S half a field · M one · L two · Full the row. L × W × H starts at L (three boxes). */
    const PKG_DEFAULT_W: Record<string, FieldWidth> = { dims: 'l' }
    const cell = (id: string) => {
      const w = rules[PKG_KEY[id] ?? id]?.width ?? PKG_DEFAULT_W[id] ?? 'm'
      return (id === 'dims' ? DIMS3 : SPAN3)[w]
    }
    const pkgEntries: RevealEntry[] = [
      /* 2026-10-07: every package field is a builder field — Package Type hidden = a Custom package (its size typed),
         Quantity hidden = one box per line, weight / size hidden = not asked */
      !hid('pkgType') && ['pkgType', <div key="type" className={cell('type')} title={packageTypeTitle}>
        <F fieldKey="pkgType" label={lbl('pkgType')} required value={packageValue(p, packageTypes)} options={packageTypeOpts} onChange={(v) => pickPackageType(i, v)} />
      </div>, true],
      /* "Barcode on every box" on (the Handling switch): a line is ONE box — its quantity stays 1 */
      !hid('pkgQty') && ['pkgQty', <div key="qty" className={cell('qty')} title={barcodeEach ? 'One box with its own barcode — Barcode on every box is on' : undefined}>
        <FNum fieldKey="pkgQty" label={lbl('pkgQty')} required integer min={1} blankZero placeholder="eg, 1" value={p.quantity}
          error={err(!(p.quantity > 0))} disabled={barcodeEach && p.quantity <= 1} onChange={(q) => setParcel(i, { quantity: q })} />
      </div>, true],
      /* a preset fills its master size, and it stays editable (owner, 2026-10-07: "dimension can be edited here") */
      !hid('pkgDimensions') && ['pkgDimensions', growLook ? (
        /* Grow (owner, 2026-10-27, the Grow team's form): Length · Width · Height as three fields */
        <div key="dims" className="flex-[3_1_330px] max-w-[440px] max-sm:basis-full">
          <Configurable fieldKey="pkgDimensions">
            <div className="grid grid-cols-3 gap-x-3">
              {(['l', 'w', 'h'] as const).map((k) => {
                const req = isCustom && need('pkgDimensions')
                return (
                  <label key={k} className="block min-w-0">
                    <span className="field-label mb-1.5 block break-words">{{ l: 'Length', w: 'Width', h: 'Height' }[k]} ({u.d}){req && <span className="req-star">*</span>}</span>
                    <NumBox blankZero placeholder={`eg, ${k === 'l' ? 30 : k === 'w' ? 20 : 15}`} value={u.toD(p[k])} precision={u.precision}
                      error={showErrors && req && !(p[k] > 0) ? 'x' : undefined} onChange={(n) => setParcel(i, { [k]: u.fromD(n) })} />
                  </label>
                )
              })}
            </div>
          </Configurable>
        </div>
      ) : <div key="dims" className={cell('dims')}>
        <SFld fieldKey="pkgDimensions" label={`${ownLbl('pkgDimensions', 'Dimensions')} (${u.d})`} required={isCustom && need('pkgDimensions')}
          error={isCustom && need('pkgDimensions') && !(p.l > 0 && p.w > 0 && p.h > 0)} helper={isCustom ? undefined : 'Filled from the package type — edit if this box differs'}>
          <DimsBox units={u} l={p.l} w={p.w} h={p.h} error={isCustom && need('pkgDimensions')} onChange={(d) => setParcel(i, d)} />
        </SFld>
      </div>, p.l > 0],
      !hid('pkgWeight') && ['pkgWeight', <div key="weight" className={cell('weight')}>
        <FNum fieldKey="pkgWeight" label={`${ownLbl('pkgWeight', 'Weight')} (${u.w})`} required={need('pkgWeight')} placeholder="eg, 10" blankZero value={u.toW(p.weight)} precision={u.precision}
          unit={growLook ? u.w.toUpperCase() : undefined}
          error={err(need('pkgWeight') && !(p.weight > 0))} onChange={(w) => setParcel(i, { weight: u.fromW(w), weightMode: 'manual' })} />
      </div>, p.weight > 0],
      !hid('pkgTracking') && ['pkgTracking', <div key="tr" className={cell('tr')}>
        <F fieldKey="pkgTracking" label={lbl('pkgTracking')} value={p.trackingNumber ?? ''} disabled={!!fromOverage && i === 0}
          helper={fromOverage && i === 0 ? 'The overage scan barcode' : undefined} onChange={(v) => setParcel(i, { trackingNumber: v })} />
      </div>, filled(p.trackingNumber)],
      /* owner, 2026-10-06: optional (one is minted for every package); Grow keeps it under "More package details" */
      !hid('pkgId') && ['pkgId', <div key="pid" className={cell('pid')}>
        <SFld fieldKey="pkgId" label={lbl('pkgId')}>
          <CommitBox key={p.packageId} value={p.packageId ?? ''} onCommit={(v) => renamePackage(i, v)} />
        </SFld>
      </div>],
      !hid('pkgDescription') && ['pkgDescription', <div key="de" className={cell('de')}>
        <F fieldKey="pkgDescription" label={lbl('pkgDescription')} value={p.description ?? ''} onChange={(v) => setParcel(i, { description: v })} />
      </div>, filled(p.description)],
      !hid('pkgPalletSpace') && ['pkgPalletSpace', <div key="ps" className={cell('ps')}>
        <F fieldKey="pkgPalletSpace" label={lbl('pkgPalletSpace')} value={p.palletSpace ?? ''} placeholder="eg, 10" onChange={(v) => setParcel(i, { palletSpace: v })} />
      </div>, filled(p.palletSpace)],
    ]
    /* Grow (owner, 2026-10-27, the Grow team's form): Weight right after Quantity, then Length · Width · Height */
    if (growLook) {
      const wi = pkgEntries.findIndex((e) => !!e && e[0] === 'pkgWeight')
      const di = pkgEntries.findIndex((e) => !!e && e[0] === 'pkgDimensions')
      if (wi > di && di >= 0) pkgEntries.splice(di, 0, ...pkgEntries.splice(wi, 1))
    }
    const r = arrange(sortApi, 'package', pkgEntries, inMore, secOpen(`pkg:${i}`), undefined, cell)
    return (
      <>
        {/* owner, 2026-09-29: the package's details chevron sits IN its field row (at the end, level with the
            inputs: label 20 + 6px gap, then centred on the 32px control) — like a SKU row's chevron */}
        <div className="relative">
        {/* owner, 2026-10-28 ("Quantity: S is extra small, M too large"): a package's fields are short, so its row is denser than a
            card's — by the card's own width, 2 · 4 · 6 fields a row (M ≈ a sixth of a wide card, S half that, L two) */}
        <GridColsCtx.Provider value={GRID_OWN}><div className="@container pr-10">
          <div className={`fgrid3-cq grid grid-cols-1 items-end ${FIELD_GAPS} @min-[380px]:grid-cols-6 @min-[640px]:grid-cols-12 @min-[960px]:grid-cols-18`}>{r.nodes}</div>
        </div></GridColsCtx.Provider>
        <RevealToggle open={secOpen(`pkg:${i}`)} onToggle={() => toggleSec(`pkg:${i}`)} waiting={r.waiting} waitingFilled={r.waitingFilled}
          label="package details" iconOnly className="absolute right-1 top-7" />
        </div>
        {below}
        {adder && <div className="mt-4">{adder}</div>}
      </>
    )
  }
  /* ---- the package list (owner, 2026-10-05: "show package and SKU info in less space — 100 packages is too much
     scroll; and what if every field is shown"): ONE package is open for editing; every other one is a single
     row — its type · count × size · weight · SKUs, the total on the right, "Incomplete" after an Add attempt.
     Click a row to open it (the open one folds). The open card carries its totals and its units in its header (no
     footer row), Duplicate (a copy right below — the quick way to many similar boxes) and Remove. Past PKG_PAGE rows the
     list stops at "Show all". However many fields the builder shows, they live only in the open package. */
  const firstPkgId = parcels[0]?.packageId ?? '0'
  /* the builder's preview always has a package open (its fields are what gets clicked) */
  const openId = parcels.length === 1 ? firstPkgId : openPkgId ?? (editing ? firstPkgId : null)
  const pkgIdOf = (p: Parcel, i: number) => p.packageId ?? String(i)
  const skusOf = (p: Parcel) => (p.items ?? []).filter((it) => !isBlankItem(it))
  /* a new package takes the last one's units */
  const addParcel = () => {
    const np: Parcel = { ...newParcel(), barcodeEach, ...(() => { const l = parcels[parcels.length - 1]; return l ? { unitSystem: l.unitSystem, weightUnit: l.weightUnit, dimUnit: l.dimUnit } : {} })() }
    setFocusLine(null); setParcels((ps) => [...ps, np]); setOpenPkgId(np.packageId ?? null)
  }
  /** a copy right below — new id, no tracking number (it is per box); its SKUs and units too */
  const duplicateParcel = (i: number) => {
    const src = parcels[i]
    if (!src) return
    const copy: Parcel = { ...src, packageId: newPackageId(), trackingNumber: '', items: separateLayout ? [] : (src.items ?? []).map((it) => ({ ...it })) }
    setParcels((ps) => [...ps.slice(0, i + 1), copy, ...ps.slice(i + 1)])
    setOpenPkgId(copy.packageId ?? null)
  }
  const pkgLine = (p: Parcel) => {
    const u = unitsOf(p)
    const items = skusOf(p)
    const type = packageValue(p, packageTypes) === CUSTOM_PACKAGE ? 'Custom' : p.packageTypeName
    return [type, `${p.quantity || 0} × ${u.toD(p.l)} × ${u.toD(p.w)} × ${u.toD(p.h)} ${u.d}`, p.weight ? `${round2(u.toW(p.weight))} ${u.w} each` : 'no weight',
      skusAsked && items.length ? `${plural(items.length, 'SKU')}: ${items.map((it) => it.skuCode || it.name).join(', ')}` : '',
      filled(p.trackingNumber) ? `#${p.trackingNumber}` : ''].filter(Boolean).join(' · ')
  }
  const packageCard = (p: Parcel, i: number, body: ReactNode) => {
    const id = pkgIdOf(p, i)
    const open = id === openId
    const many = parcels.length > 1
    const bad = showErrors && !pkgOk(p)
    const u = unitsOf(p)
    const total = p.weight ? `${round2(u.toW(p.weight * p.quantity))} ${u.w}` : '-'
    const actions = (
      <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {/* owner, 2026-10-06: the package's units — its weight, its size and its SKUs follow */}
        {open && !separateLayout && !growLook && <span className="mr-2"><UnitPick units={u} label={`Package ${i + 1} units`} onChange={(patch) => setParcel(i, patch)} /></span>}
        {!editing && <Tip text="Duplicate — a copy right below"><button type="button" aria-label={`Duplicate package ${i + 1}`} onClick={() => duplicateParcel(i)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink">
          <Copy size={14} />
        </button></Tip>}
        {(many || (growLook && !editing)) && <Tip text={!many ? 'Clear this package' : separateLayout ? 'Remove package — its SKUs move to the first package' : 'Remove package'}><button type="button"
          aria-label={`Remove package ${i + 1}`} onClick={() => (many ? removeParcel(i) : setParcels([newParcel()]))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
          {growLook ? <X size={15} /> : <CircleMinus size={14} />}
        </button></Tip>}
        {many && <button type="button" aria-label={open ? `Fold package ${i + 1}` : `Open package ${i + 1}`} aria-expanded={open}
          onClick={() => setOpenPkgId(open ? null : id)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-2 hover:bg-warm-100 hover:text-ink">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>}
      </span>
    )
    if (!open) return (
      <div key={id} role="button" tabIndex={0} aria-label={`Package ${i + 1} — open`} onClick={() => setOpenPkgId(id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenPkgId(id) } }}
        className={`mt-1.5 flex cursor-pointer items-center gap-4 rounded-lg border bg-surface py-1 pl-4 pr-2 transition-colors first:mt-0 hover:border-warm-400
          focus:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/20 ${bad ? 'border-danger-fg/50' : 'border-warm-200'}`}>
        <span className="w-[84px] shrink-0 text-[13px] font-bold text-ink">Package {i + 1}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2" title={pkgLine(p)}>{pkgLine(p)}</span>
        {bad && <span className="shrink-0 rounded-full bg-danger-bg px-2 text-[11px] font-bold leading-5 text-danger-fg">Incomplete</span>}
        <span className="w-20 shrink-0 text-right text-[13px] tabular-nums text-ink">{total}</span>
        {actions}
      </div>
    )
    const vol = p.l * p.w * p.h
    const n = skusOf(p).length
    return (
      <div key={id} className="mt-2 overflow-hidden rounded-lg border border-warm-200 first:mt-0">
        <div className={`flex items-center gap-4 py-1.5 pl-4 pr-2 ${growLook ? 'bg-surface pt-3' : 'bg-warm-50'} ${many ? 'cursor-pointer' : ''}`}
          onClick={many ? () => setOpenPkgId(null) : undefined}>
          <span className="shrink-0 text-[13px] font-bold text-ink">Package {i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">
            {['Total ' + total, vol ? `${round2(u.toV(vol * p.quantity)).toLocaleString()} ${u.d}³` : '', skusAsked ? plural(n, 'SKU') : ''].filter(Boolean).join(' · ')}
          </span>
          {actions}
        </div>
        <div className="px-4 py-4">{body}</div>
      </div>
    )
  }
  /** the package rows on screen: the first PKG_PAGE, plus the open one and any incomplete one, until "Show all" */
  const pkgShown = (p: Parcel, i: number) => allPkgs || parcels.length <= PKG_PAGE + 1 || i < PKG_PAGE
    || pkgIdOf(p, i) === openId || (showErrors && !pkgOk(p))
  const hiddenPkgs = parcels.filter((p, i) => !pkgShown(p, i)).length
  const packageList = (body: (p: Parcel, i: number) => ReactNode) => (
    <div>
      {parcels.map((p, i) => (pkgShown(p, i) ? packageCard(p, i, body(p, i)) : null))}
      {(hiddenPkgs > 0 || (allPkgs && parcels.length > PKG_PAGE + 1)) && (
        <button type="button" onClick={() => setAllPkgs((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-warm-300 py-2 text-[13px] font-bold text-ink-2 hover:border-warm-400 hover:text-ink">
          {hiddenPkgs > 0 ? <>Show all {parcels.length} packages <span className="font-normal text-ink-3">({hiddenPkgs} more)</span><ChevronDown size={14} /></>
            : <>Show fewer<ChevronUp size={14} /></>}
        </button>
      )}
    </div>
  )
  const pieces = parcels.reduce((n, p) => n + (p.quantity || 0), 0)
  /* the total in lb when every package is in lb, else kg */
  /* the total in the packages' unit when they all share one, else kg */
  const barU = parcels.length && parcels.every((p) => unitsOf(p).w === unitsOf(parcels[0]).w) ? unitsOf(parcels[0]) : METRIC
  const addPackageBar = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      {growLook
        /* Grow (owner, 2026-10-27, the Grow team's form): a plain "+ Add Package" link and the totals on the right */
        ? <button type="button" onClick={addParcel} className="inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-bold text-ink hover:bg-warm-50 hover:text-brand-500">
            <Plus size={15} />Add Package
          </button>
        : <AddMoreButton label="Add Package" onClick={addParcel} />}
      {/* one package: its header already carries the totals (Grow says them anyway) */}
      {(parcels.length > 1 || growLook) && (
        <span className="text-[13px] text-ink-2">
          {plural(pieces, 'piece')} · {round2(barU.toW(parcels.reduce((n, p) => n + (p.weight || 0) * (p.quantity || 0), 0)))} {barU.w} in {plural(parcels.length, 'package')}
        </span>
      )}
    </div>
  )
  /* the separate list stops at PKG_PAGE + 2 lines until "Show all" — an incomplete line (after an Add attempt) and the
     line just added always show */
  const skuShown = (it: ParcelItem, i: number, k: number, n: number) => allSkus || skuLines.length <= PKG_PAGE + 3 || n < PKG_PAGE + 2
    || (focusLine?.i === i && focusLine.k === k) || (showErrors && !(skuLineOk(it) && skuRuleOk(it)))
  /* the SKU list in its own order (a SKU a package picks keeps its place) */
  const sepLines = sepSort(skuLines, (l) => l.it)
  const hiddenSkus = sepLines.filter(({ it, i, k }, n) => !skuShown(it, i, k, n)).length
  /* "SKUs in this package": Package 1 holds every SKU not put in another package; any other package ticks the SKUs packed in it */
  const packable = sepLines.filter(({ it }) => !isBlankItem(it))
  const packLabel = (it: ParcelItem) => {
    const n = sepLines.findIndex((l) => l.it === it)
    return `${n + 1} · ${it.skuCode || it.name || 'SKU'}${it.skuCode && filled(it.name) ? ` — ${it.name}` : ''} × ${it.quantity || 0}`
  }
  const packPicker = (p: Parcel, i: number) => {
    const mine = skusOf(p)
    const names = mine.map((it) => it.skuCode || it.name).join(', ')
    /* every package can ADD a SKU to itself (owner, 2026-10-07: "in this package I cannot add a SKU line item") — it is listed in the
       SKU list above with its number, and ticked in this package; the first package also holds every SKU nobody else took */
    if (parcels.length === 1 || i === 0) return (
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className="text-[13px] text-ink-2">
          <span className="font-bold text-ink">{parcels.length === 1 ? 'Holds every SKU' : 'Holds every SKU not put in another package'}</span>
          {names ? ` — ${names}` : ''}
        </p>
        <AddRowLink label="Add SKU to this package" onClick={() => addItem(i)} />
      </div>
    )
    return (
      <div className="mt-5 lg:w-1/2">
        <p className="mb-1.5 field-label">SKUs in this package</p>
        <MultiSelectDropdown options={packable.map(({ it }) => packLabel(it))} values={mine.map(packLabel)} noun="SKUs" searchPlaceholder="Search the SKUs above"
          placeholder={packable.length ? 'Pick the SKUs packed in it' : 'No SKUs yet — add one below'}
          onChange={(vals) => packInto(i, vals.map((v) => packable.find(({ it }) => packLabel(it) === v)?.it).filter((x): x is ParcelItem => !!x))} />
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
          <AddRowLink label="Add SKU to this package" onClick={() => addItem(i)} />
          <p className="text-[12px] text-ink-3">A SKU you take out goes back to Package 1.</p>
        </div>
      </div>
    )
  }
  /* the separate list's one unit: every package shares it (the SKU list sits above all of them) */
  const sepUnits = unitsOf(parcels[0])
  const setAllUnits = (patch: { weightUnit?: WeightUnit; dimUnit?: DimUnit }) => setParcels((ps) => ps.map((x) => ({ ...x, ...patch })))
  /* SKUs, then packages: the SKU list, then the boxes — each box picks what is packed in it */
  const separateBlock = (
    <div>
      <SubTitle>SKUs</SubTitle>
      {sepLines.length > 0
        ? skuTable(sepLines.map(({ it, i, k }, n) => (skuShown(it, i, k, n) ? skuRow(it, i, k, n) : null)), sepUnits)
        : editing ? skuTable(skuRow(blankItem(), 0, 0, 0, true), sepUnits) : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <AddRowLink label="Add SKU" onClick={() => addItem(0)} />
        {(hiddenSkus > 0 || (allSkus && skuLines.length > PKG_PAGE + 2)) && (
          <button type="button" onClick={() => setAllSkus((v) => !v)}
            className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-2 hover:text-ink">
            {hiddenSkus > 0 ? <>Show all {skuLines.length} SKUs <span className="font-normal text-ink-3">({hiddenSkus} more)</span><ChevronDown size={14} /></>
              : <>Show fewer SKUs<ChevronUp size={14} /></>}
          </button>
        )}
      </div>
      <div className="mt-6"><SubTitle>Packages</SubTitle></div>
      {packageList((p, i) => <>
        {packageFields(p, i)}
        {packPicker(p, i)}
      </>)}
      {addPackageBar}
    </div>
  )
  /* each package: its fields, then (unless the builder hid the SKUs) its SKUs and Add SKU under them */
  const packagesBlock = (
    <div>
      {packageList((p, i) => packageFields(p, i,
        !skusAsked ? null
          : (p.items ?? []).length > 0 ? <div className="mt-6">{skuTable((p.items ?? []).map((it, k) => skuRow(it, i, k, k)), unitsOf(p))}</div>
          /* the builder shows a sample SKU line, so its fields can be set without adding one */
          : editing ? <div className="mt-6">{skuTable(skuRow(blankItem(), i, 0, 0, true), unitsOf(p))}</div> : null,
        skusAsked ? <AddRowLink label="Add SKU" quiet={growLook} onClick={() => addItem(i)} /> : undefined))}
      {addPackageBar}
    </div>
  )
  /* while the form is edited: the card's two sections, each with its eye (owner, 2026-10-06: "in the form builder we can
     hide the SKU section or the package section") — they stay here when hidden, so they can come back */
  const sectionChip = (k: string, icon: ReactNode) => (
    <Configurable key={k} fieldKey={k}>
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-warm-300 bg-surface px-3 text-[13px] text-ink">{icon}{lbl(k)}</span>
    </Configurable>
  )
  const packagesSection = (
    <FormCard id="sec-packages" title="Package & SKU"
      caption={typeRule.goodsOptional ? 'Parts or goods to carry for the visit — optional for a Service.'
        : useItems ? 'Pick the SKUs and how many — sizes and weights come from the SKU master, or type a new SKU.'
        : !skusAsked ? 'Each package — its type, size and weight.'
        : separateLayout ? 'List the SKUs, then the packages — each package picks the SKUs packed in it.'
        : "Each package, and the SKUs packed in it. A package's weight adds up from its type and SKUs unless you type one."}
      action={useItems && !editing ? <UnitPick units={iu} onChange={(patch) => setItemUnit((x) => ({ ...x, ...patch }))} label="Units of the SKUs" />
        : separateLayout && !editing ? <UnitPick units={sepUnits} onChange={setAllUnits} label="Units of the SKUs and packages" />
        : editing && !isFtl ? optsButton('packages', 'Sections') : undefined}>
      {editing && !isFtl && cardOpts === 'packages' && (
        <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg bg-warm-50 px-4 pb-3 pt-4">
          <span className="text-[13px] font-bold text-ink">Sections</span>
          {sectionChip(PKG_SECTION, <Package size={14} className="text-ink-3" />)}
          {sectionChip(SKU_SECTION, <Barcode size={14} className="text-ink-3" />)}
          {!pkgOff && !skuOff && (
            <LayoutSeg label="SKU list" value={layout.skuList} onChange={(v) => setDraftLayout((l) => ({ ...l, skuList: v }))} options={[
              { value: 'under', label: 'Under each package', tip: 'Each package, with its SKUs right under it' },
              { value: 'separate', label: 'Separate list', tip: 'The SKU list first, then the packages — each package picks its SKUs' },
            ]} />
          )}
          <span className="text-[12px] text-ink-3">
            {pkgOff ? 'SKUs and how many — the packages are worked out' : skuOff ? 'Packages only — no SKUs'
              : layout.skuList === 'separate' ? 'The SKU list first, then the packages' : 'Each package with its SKUs'}
          </span>
        </div>
      )}
      {useItems ? itemsBlock : separateLayout ? separateBlock : packagesBlock}
      {/* Grow (owner, 2026-10-27, the Grow team's form): the merchant declares there is nothing dangerous inside */}
      {merchantMode && (
        <div className="mt-6 border-t border-warm-200 pt-4">
          <Checkbox checked={!!c.dgDeclared} onChange={(v) => setC({ dgDeclared: v })}
            label={<span className="text-[14px] text-ink">I declare that this shipment does not have Dangerous goods<span className="req-star">*</span></span>} />
          {showErrors && !c.dgDeclared && <ErrLine className="mt-1.5">Confirm the dangerous-goods declaration.</ErrLine>}
        </div>
      )}
    </FormCard>
  )

  /* ------------------------------------------------------------ 3b · Vehicle Details — the second branch's vehicle
     selection (owner, 2026-10-06), shared by the console's full-truck form and Grow's Dedicate Truck: one line per vehicle
     type — how many, the estimated load, the Ship To addresses it serves; the console reads the vehicle master, Grow the
     Ship From hub's fleet (with its rate per vehicle) */
  const addressLabels = addressOptions.map((o) => o.label)
  type VehicleChoice = { code: string; name: string; capacity?: string; rate?: number }
  const vehicleTable = (types: VehicleChoice[], payload: (code: string) => number) => {
    const typeOf = (code: string) => types.find((t) => t.code === code)
    const vs = vehicles.filter((v) => !!v.vehicleType)
    const load = totalLoadKg(vs)
    const cap = vs.reduce((n, v) => n + payload(v.vehicleType), 0)
    const over = vs.filter((v) => payload(v.vehicleType) > 0 && v.actualLoadKg > payload(v.vehicleType))
    const notServed = allDrops.map((_, i) => i).filter((i) => !vs.some((v) => v.addressIdx.includes(i)))
    return (
      <>
        <div className="rounded-lg border border-warm-200">
          <div className="grid grid-cols-[1.4fr_120px_150px_1.3fr_32px] gap-3 rounded-t-lg bg-warm-50 px-4 py-3 text-[13px] text-ink">
            <span>Vehicle Type<span className="req-star">*</span></span><span>No. of Vehicles<span className="req-star">*</span></span>
            <span>Est. Load<span className="req-star">*</span></span><span>Deliver To<span className="req-star">*</span></span><span />
          </div>
          {rows.map((r, i) => {
            const each = payload(r.vehicleType)
            const rowCap = each * Math.max(1, r.count)
            const heavy = rowCap > 0 && r.loadKg > rowCap
            const t = typeOf(r.vehicleType)
            const note = [each ? `Up to ${each.toLocaleString()} kg each` : t?.capacity || 'Capacity not configured',
              t?.rate ? `${money(t.rate, currency)} / vehicle` : ''].filter(Boolean).join(' · ')
            return (
              <div key={i} className="grid grid-cols-[1.4fr_120px_150px_1.3fr_32px] items-start gap-3 border-t border-warm-200 px-4 py-3">
                <div className="min-w-0">
                  <MenuSelect value={r.vehicleType} placeholder={types.length ? 'eg, 8 Ton Truck' : 'Enter Ship From first'} options={types.map((x) => x.code)}
                    labels={(v) => typeOf(v)?.name ?? v} searchable onChange={(v) => setRow(i, { vehicleType: v })} />
                  {/* "Required field." only after an Add Order / Continue attempt, like every other field */}
                  {!r.vehicleType
                    ? (showErrors ? <p className="mt-1.5 pl-2 text-[12px] text-danger-fg">Required field.</p> : null)
                    : <p className={`mt-1 text-[12px] ${heavy ? 'text-danger-fg' : 'text-ink-3'}`}>
                        {heavy ? `${r.loadKg.toLocaleString()} kg exceeds ${rowCap.toLocaleString()} kg` : note}
                      </p>}
                </div>
                <NumBox integer min={1} value={r.count} onChange={(n) => setRow(i, { count: Math.max(1, n) })} />
                <div>
                  <NumBox unit="kg" blankZero value={r.loadKg} error={err(!(r.loadKg > 0))} onChange={(n) => setRow(i, { loadKg: n })} />
                  {showErrors && !(r.loadKg > 0) && <p className="mt-1.5 pl-2 text-[12px] text-danger-fg">Required field.</p>}
                </div>
                {/* one Ship To address: nothing to choose — it is the one */}
                {addressLabels.length === 1 && r.addressIdx.includes(0)
                  ? <ReadBox value={addressLabels[0]} />
                  : <MultiSelectDropdown size="sm" options={addressLabels} noun="addresses" placeholder="Ship To addresses"
                      values={r.addressIdx.map((a) => addressLabels[a]).filter(Boolean)}
                      onChange={(vals) => setRow(i, { addressIdx: vals.map((v) => addressLabels.indexOf(v)).filter((a) => a >= 0).sort((x, y) => x - y) })} />}
                <Tip text="Remove vehicle"><button type="button" aria-label={`Remove vehicle row ${i + 1}`} disabled={rows.length === 1} onClick={() => removeVehicle(i)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40">
                  <X size={14} />
                </button></Tip>
              </div>
            )
          })}
        </div>
        <div className="mt-4"><AddMoreButton label="Add vehicle" onClick={addVehicle} /></div>
        <p className="mt-3 text-[12px] text-ink-3">
          {plural(vs.length, 'vehicle')} · {loadText(load)} of {cap.toLocaleString()} kg
          {over.length > 0 && <span className="text-danger-fg"> · {over.length} overloaded</span>}
          {notServed.length > 0
            ? <span className="text-danger-fg"> · {notServed.map((i) => `Address ${i + 1}`).join(', ')} not assigned to a vehicle</span>
            : <span> · every address has a vehicle</span>}
        </p>
      </>
    )
  }
  /* 2026-10-07: the card is a builder field (`vehicleDetails`) — rename it, or hide it: the carrier then picks the vehicle
     (one of the Ship From hub's vehicles carries the whole load to every Ship To address) */
  const vehicleSection = (
    <FormCard id="sec-vehicle" title={lbl('vehicleDetails')}
      caption={`A full-truck booking — book the vehicles that fit the load for ${consoleFtl}. Each one is dedicated to this order.`}>
      <Configurable fieldKey="vehicleDetails">
        {vehicleTable(vehicleOpts.map((x) => ({ code: x.code, name: vehicleTypeOf(masters.vehicleTypes, x.code)?.name ?? x.code,
          capacity: vehicleTypeOf(masters.vehicleTypes, x.code)?.capacity })), payloadOf)}
      </Configurable>
    </FormCard>
  )
  /* Grow, Dedicate Truck on: the same table on the Ship From hub's fleet */
  const growVehicleSection = (
    <FormCard id="sec-vehicle" title={lbl('vehicleDetails')}
      caption={`${mode !== 'ftl' ? 'Shown when Dedicate Truck is on. ' : ''}A full vehicle just for this order — book the vehicles that fit the load, and the Ship To addresses each one serves.${fleetNote ? ` ${fleetNote}` : ''}`}>
      <Configurable fieldKey="vehicleDetails">
        {vehicleTable(fleet, (code) => fleet.find((v) => v.code === code)?.payloadKg ?? 0)}
      </Configurable>
    </FormCard>
  )

  /* ------------------------------------------------------------ 5 · Instructions & services
     Only what is left once every handling question sits where it belongs (owner, 2026-09-29): a note for
     the carrier, and any service on top of the delivery. */
  const extrasReveal = arrange(sortApi, 'instructions', [
    !hid('specialInstructions') && ['specialInstructions', <F key="si" fieldKey="specialInstructions" label={lbl('specialInstructions')} multiline rows={2}
      value={c.specialInstructions ?? ''} placeholder="eg, Call the customer 30 minutes before arriving"
      onChange={(v) => setC({ specialInstructions: v })} />, filled(c.specialInstructions)],
  ], inMore, secOpen('sec-service'))
  const vasOpts = merchantMode
    ? VAS_SERVICES.map((v) => ({ value: v, label: laneVasPrice(v, currency) ? `${v} · ${money(laneVasPrice(v, currency), currency)}` : v }))
    : VAS_OPTS
  /** a VAS line's default widths (3 units a field): the service and the remark wider, the time narrow */
  const VAS_LINE_W: Record<string, FieldWidth> = { service: 'l', vasTime: 's', vasRemark: 'l' }
  /* the builder shows one sample service line (owner, 2026-10-05) — the real list otherwise */
  const vasShown: VasLine[] = (c.vas ?? []).length || !editing ? (c.vas ?? []) : [{ ...newVas(), level: isFtl ? 'CONSIGNMENT' : 'SKU' }]
  /* owner, 2026-09-29: a block whose fields are all hidden leaves no divider and no space */
  /* `below` = something sits above it in the card (the service fields, or + Add field while editing): only then the
     divider. Owner, 2026-10-06: with VAS alone on Grow, the card showed an empty band and a rule above it. */
  const addVasButton = <AddMoreButton label="Add service" onClick={() => setC({ vas: [...(c.vas ?? []),
    isFtl ? { ...newVas(), level: 'CONSIGNMENT' } : { ...newVas(), level: skuLineOpts.length ? 'SKU' : 'PACKAGE', packageId: goods.length === 1 ? goods[0].packageId : undefined }] })} />
  /** the VAS list — under the instructions, or (Grow, owner 2026-10-27) the whole of its own card */
  function vasBlock(alone: boolean, below: boolean) {
    return !hid('vas') && (
      <div className={below ? 'mt-6' : ''}>
        {!alone && <SubTitle right={addVasButton}>{lbl('vas')}</SubTitle>}
        {vasShown.length === 0
          ? (alone ? <p className="text-[13px] text-ink-3">No services added.</p> : null)
          : (
            /* owner, 2026-10-28: each VAS line is a field row like a package's — its field names above, one zone (`vas-line`): drag,
               S / M / L / Full; Time and Remark are builder fields (show · Required) */
            <div className="grid gap-3">
              {vasShown.map((v, i) => {
                const missing = [!v.service && 'service', need('vasTime') && !(v.serviceTimeMin > 0) && 'time', need('vasRemark') && !filled(v.remark) && 'remark', v.level === 'SKU' && !v.skuCode && 'SKU', v.level === 'PACKAGE' && !v.packageId && 'package'].filter(Boolean) as string[]
                const sample = editing && !(c.vas ?? []).length
                const ln = arrange(sortApi, 'vas-line', [
                  [null, <SFld key="level" label="Added to" required>{isFtl
                    ? <ReadBox value="Whole booking" />
                    : <MenuSelect value={v.level} options={['PACKAGE', 'SKU']} labels={(x) => (x === 'SKU' ? 'SKU' : 'Package')}
                        onChange={(x) => setVas(i, { level: x as VasLine['level'], skuCode: '', packageId: x === 'PACKAGE' && goods.length === 1 ? goods[0].packageId : undefined })} />}
                  </SFld>],
                  [null, <SFld key="target" label={isFtl ? 'Booking' : v.level === 'SKU' ? 'SKU' : 'Package'} required>{isFtl ? <ReadBox value="Every vehicle" />
                    : v.level === 'SKU'
                      ? <MenuSelect value={v.skuCode} placeholder={skuLineOpts.length ? 'Pick a SKU' : 'Add a SKU first'} searchable={skuLineOpts.length > 8}
                          options={skuLineOpts.map((o) => o.value)} labels={(x) => skuLineOpts.find((o) => o.value === x)?.label ?? x} onChange={(x) => setVas(i, { skuCode: x })} />
                      : <MenuSelect value={v.packageId ?? ''} placeholder="Pick a package"
                          options={goods.map((g) => g.packageId ?? '').filter(Boolean)}
                          labels={(x) => { const n = goods.findIndex((g) => g.packageId === x); const g = goods[n]; return g ? `Package ${n + 1} · ${g.packageTypeName === CUSTOM_PACKAGE_NAME ? (g.items?.[0]?.name || 'Custom') : g.packageTypeName} × ${g.quantity}` : x }}
                          onChange={(x) => setVas(i, { packageId: x })} />}
                  </SFld>],
                  [null, <SFld key="service" label="Service" required>
                    <MenuSelect value={v.service} placeholder="Pick a service" searchable options={vasOpts.map((o) => o.value)}
                      labels={(x) => vasOpts.find((o) => o.value === x)?.label ?? x} onChange={(x) => setVas(i, { service: x })} />
                  </SFld>],
                  !hid('vasTime') && ['vasTime', <SFld key="vasTime" fieldKey="vasTime" label={lbl('vasTime')} required={need('vasTime')}>
                    <NumBox integer blankZero placeholder="0" unit="min" value={v.serviceTimeMin} onChange={(n) => setVas(i, { serviceTimeMin: n })} />
                  </SFld>, v.serviceTimeMin > 0],
                  !hid('vasRemark') && ['vasRemark', <SFld key="vasRemark" fieldKey="vasRemark" label={lbl('vasRemark')} required={need('vasRemark')}>
                    <Input value={v.remark} placeholder="eg, Second floor" onChange={(x) => setVas(i, { remark: x })} />
                  </SFld>, filled(v.remark)],
                ], () => false, true, undefined, (id) => SPAN3[rules[id]?.width ?? VAS_LINE_W[id] ?? 'm'])
                return (
                  <div key={i} className={`rounded-lg border border-line px-4 pb-4 pt-3 ${sample ? 'bg-warm-25' : 'bg-surface'}`}>
                    <div className="mb-3 flex min-h-8 items-center gap-3">
                      <span className="text-[13px] font-bold text-ink">Service {i + 1}</span>
                      {sample && <span className="rounded-full border border-line bg-surface px-1.5 text-[11px] leading-4 text-ink-3">Sample line — how a service is added (not saved)</span>}
                      <span className="ml-auto"><Tip text="Remove service"><button type="button" aria-label={`Remove service ${i + 1}`} onClick={() => setC({ vas: (c.vas ?? []).filter((_, j) => j !== i) })}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
                        <Trash2 size={14} />
                      </button></Tip></span>
                    </div>
                    <GridColsCtx.Provider value={GRID_OWN}><div className="@container"><div className={ROW3}>{ln.nodes}</div></div></GridColsCtx.Provider>
                    {missing.length > 0 && <ErrLine className="mt-2">Required: {missing.join(', ')}</ErrLine>}
                  </div>
                )
              })}
            </div>
          )}
      </div>
      )
  }

  /* ------------------------------------------------------------ 4 · Service
     How it moves: the service, the load type, the vehicle — and the two questions about the MOVE itself:
     clearance on the way, and the loading time a full vehicle needs. */
  /* one zone for the card's fields — the console's Service Type, Load type and Vehicle Type join the label / loading
     time / own fields (Grow asks its service in its own card, so only the latter are on Grow) */
  const svcReveal = arrange(sortApi, 'service', [
    /* owner, 2026-10-06: the load type is a toggle (the second branch's Dedicate Truck), as wide as the fields beside it —
       off = a shared vehicle, on = a full one; no hint line (only when the service decides it) */
    /* owner, 2026-10-27: how it moves is ONE switch (it replaced the Shipment legs pills under the addresses) — on = through a
       hub, the legs follow Ship From and Ship To; off = Pick & Del, one trip, no hub. The line under it says what is created. */
    /* owner, 2026-10-27 (aligned with the Grow team's form): NO Vehicle Type field — Dedicate Truck alone says "a whole
       vehicle"; which vehicle is assigned when it is planned, from the Ship From hub's fleet (its line says so) */
    !hid('labelFormat') && ['labelFormat', <F key="lf" fieldKey="labelFormat" label={lbl('labelFormat')} value={c.labelFormat ?? ''} placeholder="eg, PDF"
      options={opts(LABEL_FORMATS)} onChange={(v) => setC({ labelFormat: v })} />, !!c.labelFormat],
    !hid('totalLoadingTime') && ['totalLoadingTime', <FNum key="lt" fieldKey="totalLoadingTime" label={custom('totalLoadingTime', 'Total Loading Time (minutes)', 'Total Loading Time')}
      blankZero integer unit="min" placeholder="minutes" value={c.totalLoadingTime ?? 0} onChange={(n) => setC({ totalLoadingTime: n || null })} />, (c.totalLoadingTime ?? 0) > 0],
    ...customEntries('sec-service'),
  ], inMore, secOpen('sec-service'))
  /* ------------------------------------------------------------ 6 · Carriers — LAST (owner, 2026-09-29):
     the carrier is chosen once everything it has to carry is known */
  const carrierSection = (
    <FormCard id="sec-carrier" title="Carriers" count={CARRIERS.length}
      caption="Who carries this consignment — pick one.">
      {/* pills on the card — the Handling chips' look (the chosen one: ink border, warm-50, bold, a check) */}
      <div>
        <Configurable fieldKey="carrier">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Carriers">
          {CARRIERS.map((k) => {
            const on = c.carrier === k.code
            return (
              <button key={k.code} type="button" role="radio" aria-checked={on} onClick={() => setC({ carrier: k.code })}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors
                  ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
                {on && <Check size={13} strokeWidth={3} className="text-brand-500" />}{k.code}
              </button>
            )
          })}
        </div>
        </Configurable>
        {need('carrier') && !c.carrier && <ErrLine className="mt-3">Pick a carrier.</ErrLine>}
      </div>
    </FormCard>
  )

  /* ============================================================ Grow (merchant): the console's Handling card with the
     load type asked in it · Service & instructions (label, note, VAS) · Service Type (the lane's cards, LAST) */
  /* owner, 2026-10-27 (the Grow team's form): ONE "Handling & Instructions" card — the handling, then the label and the
     note for the carrier; the value-added services are a card of their own */
  const instrNodes = [...svcReveal.nodes, ...extrasReveal.nodes]
  const instrWaiting = svcReveal.waiting + extrasReveal.waiting
  const merchantHandlingSection = (
    <FormCard id="sec-handling" title="Handling & Instructions" caption="How the goods must be handled on the way, how they travel, and anything the carrier should know.">
      {/* the console's Handling content; its switches row always shows on Grow — the load type is on it */}
      {handlingSection.props.children}
      {instrNodes.length > 0 && <SGrid className="mt-6">{instrNodes}</SGrid>}
      <RevealToggle open={secOpen('sec-service')} onToggle={() => toggleSec('sec-service')} waiting={instrWaiting}
        waitingFilled={svcReveal.waitingFilled + extrasReveal.waitingFilled} className="mt-4" />
    </FormCard>
  )
  const merchantVasSection = hid('vas') ? null : (
    <FormCard id="sec-extras" title={lbl('vas')} action={editing ? undefined : addVasButton}
      caption="Any service on top of the delivery — installation, assembly, a tail-lift…">
      {vasBlock(true, false)}
    </FormCard>
  )
  /* Grow · Payment (owner, 2026-10-07: "Payment Mode, COD, COD Amount, remarks — asked in the same flow as the form"):
     its own card on step 1, configured like every field (hide · Required · rename · order, zone `payment`). Checkout
     only asks HOW the merchant pays. COD Amount shows for a COD order; hidden Payment Mode = Prepaid. */
  const payReveal = arrange(sortApi, 'payment', [
    !hid('paymentMode') && typeRule.payment && ['paymentMode', <F key="pm" fieldKey="paymentMode" label={lbl('paymentMode')} value={growPayMode}
      options={opts(['Prepaid', 'COD'])} onChange={(v) => setC({ paymentMode: v, ...(v === 'COD' ? {} : { orderAmount: null }) })}
      helper={growPayMode === 'COD' ? 'Cash is collected from the receiver at delivery' : undefined} />, true],
    !hid('paymentMode') && !hid('orderAmount') && typeRule.payment && (growPayMode === 'COD' || editing) && ['orderAmount',
      <FNum key="oa" fieldKey="orderAmount" label={`${custom('orderAmount', 'Order Amount', 'COD Amount')} (${currency})`} required={codAsked} blankZero
        placeholder="eg, 1500" value={c.orderAmount ?? 0} error={err(codAsked && !((c.orderAmount ?? 0) > 0))}
        helper={editing && growPayMode !== 'COD' ? 'Shown for a COD order' : undefined}
        onChange={(n) => setC({ orderAmount: n || null })} />, (c.orderAmount ?? 0) > 0],
    !hid('remarks') && ['remarks', <F key="rm" fieldKey="remarks" label={lbl('remarks')} multiline rows={2} value={c.remarks ?? ''}
      placeholder="Remarks for the driver or the receiver" className="sm:col-span-4" onChange={(v) => setC({ remarks: v })} />, filled(c.remarks)],
  ], inMore, secOpen('sec-payment'))
  const paymentSection = !(payReveal.nodes.length > 0 || payReveal.waiting > 0) ? null : (
    <FormCard id="sec-payment" title="Payment" caption="Prepaid or cash on delivery, and a note for the driver or the receiver.">
      <SGrid>{payReveal.nodes}</SGrid>
      <RevealToggle open={secOpen('sec-payment')} onToggle={() => toggleSec('sec-payment')} waiting={payReveal.waiting} waitingFilled={payReveal.waitingFilled} className="mt-6" />
    </FormCard>
  )
  /* Grow, Service Type hidden: the merchant books the default service without choosing (the card leaves the form; a full
     vehicle's vehicles are in Vehicle Details); the builder's preview keeps the whole card, faded, so it can be selected */
  const serviceChooser = (
    <ServiceTypeChooser hideMode vehiclesElsewhere ready={ready} mode={mode} onMode={changeMode} modeLocked={!!fromOverage || pr?.shipmentType === 'FTL'}
      quotes={quotes} selected={selected} onSelect={setService} currency={currency} fleet={fleet} counts={{}} onCount={() => undefined}
      fleetNote={fleetNote} showErrors={showErrors} serviceLocked={serviceHidden} eta={layout.serviceEta} price={layout.servicePrice} compact
      layout={layout.services} carrier={mode === 'ftl' ? '2GO Logistics' : '2GO Express'} />
  )
  const merchantServiceSection = (
    <FormCard id="sec-svctype" title={lbl('serviceType')}
      count={layout.services === 'grid' && quotes.length > 1 ? quotes.length : undefined}
      action={editing ? (
        <LayoutSeg label="Show as" value={layout.services} onChange={(v) => setDraftLayout((l) => ({ ...l, services: v }))} options={[
          { value: 'grid', label: 'Cards', tip: 'One full-width card per service — radio, name, carrier, rate' },
          { value: 'menu', label: 'Dropdown', tip: 'One compact dropdown — the shortest step' },
        ]} />
      ) : undefined}
      caption="The services on this route, with the estimated rate and delivery — pick one.">
      {editing ? <Configurable fieldKey="serviceType">{serviceChooser}</Configurable> : serviceChooser}
      {showErrors && !ready && (
        <ErrLine className="mt-3">Add {[!laneReady(sender) && 'a Ship From address', !allDrops.every(laneReady) && 'a Ship To address',
          !weightOk && 'a weight or size for every package'].filter(Boolean).join(', ')} to see the services.</ErrLine>
      )}
    </FormCard>
  )

  /* Grow · Payment (owner, 2026-10-27, the Grow team's one-page form): what it costs and HOW it is paid — the old checkout's
     Payment Summary + "How you pay" (Wallet · Card · Pay later on a Postpaid account (the monthly credit) · COD for a COD order) */
  /* owner, 2026-10-28 ("merge Handling with Service & instructions, VAS its own section, Service Type as cards or a dropdown
     in the form builder") — both forms: Handling & Instructions (the handling, then how it moves, the label and the note for
     the carrier) · Value Added Services · Service Type. The console's Service Type card lists the services as cards (with
     their days) or one dropdown — the builder's choice (`layout.services`); Grow's is its priced card. */
  const svcList = isFtl ? FTL_SERVICE_CODES : SERVICE_TYPES
  const svcValue = isFtl ? ftlService : service
  const svcPick = isFtl ? pickFtlService : setService
  const svcAsMenu = layout.services === 'menu'
  /* the builder's per-form switches for the cards' price and ETA — set from the Ops form for both forms */
  const svcFlagPills = (flag: 'servicePrice' | 'serviceEta', what: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[12px] text-ink-3">{what}</span>
      {(['console', 'grow'] as const).map((p) => {
        const who = p === 'grow' ? 'Grow' : 'Ops'
        const on = draft.layout[p][flag]
        return (
          <Tip key={p} text={on ? `${what} shows on the ${who} form — click to hide it` : `${what} is hidden on the ${who} form — click to show it`}>
            <button type="button" aria-pressed={on} onClick={() => setLayoutOf(p, (l) => ({ ...l, [flag]: !on }))}
              className={`inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[11px] font-bold transition-colors
                ${on ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-line bg-surface text-ink-3 hover:text-ink'}`}>
              {on ? <Eye size={11} /> : <EyeOff size={11} />}{who}
            </button>
          </Tip>
        )
      })}
    </span>
  )
  const svcShowAs = editing ? (
    <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      {svcFlagPills('servicePrice', 'Price')}
      {svcFlagPills('serviceEta', 'ETA')}
      <LayoutSeg label="Show as" value={svcAsMenu ? 'menu' : 'grid'} onChange={(v) => setDraftLayout((l) => ({ ...l, services: v }))} options={[
        { value: 'grid', label: 'Cards', tip: 'One card per service — name, price, days' },
        { value: 'menu', label: 'Dropdown', tip: 'One compact dropdown' },
      ]} />
    </span>
  ) : undefined
  /* owner, 2026-10-28 ("services should be like this"): the same Services card as Grow — two a row, radio + name, the price
     over "Est. n days" (each shown or not per form: `layout.servicePrice` / `serviceEta`) */
  const consoleSvcCards = (
    <div role="radiogroup" aria-label={lbl('serviceType')} className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
      {svcList.map((code) => {
        const sv = SERVICES.find((x) => x.code === code)
        return (
          <ServiceChoice key={code} q={{ code, name: code, net: sv?.price ?? 0, days: sv?.days ?? 0 }} carrier="" currency={currency}
            compact price={layout.servicePrice} eta={layout.serviceEta} selected={svcValue === code} inert={false} onClick={() => svcPick(code)} />
        )
      })}
    </div>
  )
  const consoleSvcTypeSection = (
    <FormCard id="sec-svctype" title={lbl('serviceType')} count={svcAsMenu ? undefined : svcList.length} caption="How it travels and how fast — pick one." action={svcShowAs}>
      {svcAsMenu
        ? <SGrid><F fieldKey="serviceType" label={lbl('serviceType')} required value={svcValue} options={opts(svcList)} placeholder="eg, Service" searchable={!isFtl} onChange={svcPick} /></SGrid>
        : editing ? <Configurable fieldKey="serviceType">{consoleSvcCards}</Configurable> : consoleSvcCards}
    </FormCard>
  )
  /* owner, 2026-10-28 ("Load type should be in the top section — fix this section's design"): Handling & Instructions in three
     parts, each with a small heading — Handling (the chips; Delivery type with the switches; tags; own fields) · Instructions
     (label, loading time, special instructions and own fields). Load type is in Consignment details. */
  const partHead = (t: string, first: boolean) => (
    <p className={`mb-3 text-[13px] font-bold uppercase tracking-wide text-ink-3 ${first ? '' : 'mt-6 border-t border-line pt-5'}`}>{t}</p>
  )
  const handlingBody = handlingSection.props.children
  const handlingHas = handlingVisible && (handlingChipsVisible || handlingTogglesVisible || handlingCustom.nodes.length > 0 || handlingCustom.waiting > 0 || editing)
  const instrHas = instrNodes.length > 0 || instrWaiting > 0
  const handlingInstrSection = (
    <FormCard id="sec-handling" title="Handling & Instructions" caption="How it moves, how the goods must be handled, and anything the carrier should know.">
      {handlingHas && <>{partHead('Handling', true)}{handlingBody}</>}
      {instrHas && (
        <>
          {partHead('Instructions', !handlingHas)}
          {instrNodes.length > 0 && <SGrid>{instrNodes}</SGrid>}
          <RevealToggle open={secOpen('sec-service')} onToggle={() => toggleSec('sec-service')} waiting={instrWaiting}
            waitingFilled={svcReveal.waitingFilled + extrasReveal.waitingFilled} className="mt-4" />
        </>
      )}
    </FormCard>
  )
  const growPaySection = (
    <FormCard id="sec-pay" title="Payment" caption="What this consignment costs, and how you pay — one way or split over several.">
      {growQuote ? (
        <div className="grid gap-6 @min-[760px]:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0"><SplitPaymentSheet split={pay} compact /></div>
          <div className="space-y-1.5 self-start rounded-lg bg-warm-50 px-4 py-3 text-[13px] text-ink">
            <div className="flex justify-between"><span className="text-ink-3">Shipping charges · {growQuote.name}</span><span>{money(growRate, currency)}</span></div>
            <div className="flex justify-between"><span className="text-ink-3">Taxes</span><span>{money(growTax, currency)}</span></div>
            <div className="flex justify-between border-t border-line pt-2 text-[15px] font-bold"><span>Payable Amount</span><span>{money(growPayable, currency)}</span></div>
          </div>
        </div>
      ) : <p className="text-[13px] text-ink-3">Choose a service to see what you pay.</p>}
      {showErrors && growQuote && !pay.choice.ready && <ErrLine className="mt-3">{pay.choice.reason ?? 'Choose how you pay.'}</ErrLine>}
      {showErrors && !growQuote && <ErrLine className="mt-3">Choose a service first.</ErrLine>}
    </FormCard>
  )

  /* ============================================================ Summary (2026-10-05, owner: "allow to show summary or not … for
     both consignment and Grow portal — their summary section can be different"): a card at the end that adds the
     consignment up while it is filled. The console's lines are the ops view, Grow's the merchant view; the builder
     switches the card on / off and picks its lines for each portal on its own, and the lines take the field order
     (zone `summary`, drag to reorder). */
  const goodsPieces = goods.reduce((n, p) => n + (p.quantity || 0), 0)
  const skuUnits = goods.reduce((n, p) => n + (p.quantity || 0) * (p.items ?? []).filter((it) => !isBlankItem(it)).reduce((m, it) => m + (it.quantity || 0), 0), 0)
  const fullVehicle = merchantMode ? mode === 'ftl' : isFtl || dedicated
  const etaDays = merchantMode ? quote?.days ?? null : svc.days
  /* ---- the Summary, in icons (owner, 2026-10-28) — every icon names itself in a tooltip and jumps to its card ---- */
  const summaryTitle = merchantMode ? 'Shipment Summary' : 'Consignment Summary'
  /* owner, 2026-10-28 ("mix of icons and text; leg-wise still confusing"): every row is an icon WITH its words. The route is
     a vertical timeline — each stop (Ship From, a hub, Ship To) a node with its name, each leg on the line between two
     stops with its icon, name and what happens on it. A click on a row's item jumps to its card. */
  const jumpBtn = (jump: string | null | undefined, label: string, children: ReactNode, className = '') => (
    <button type="button" aria-label={label} title={label} disabled={!jump || editing} onClick={() => jump && jumpTo(jump)}
      className={`min-w-0 text-left transition-colors disabled:cursor-default enabled:hover:bg-warm-100 ${className}`}>{children}</button>
  )
  const legList2: LegKind[] = legsDirect ? ['pickAndDeliver'] : legList
  const partyName = (p: Party) => p.businessName?.trim() || p.name?.trim() || p.line1?.trim() || ''
  const placeOf = (p: Party) => [p.city, p.state].filter((x) => filled(x)).join(', ')
  type Stop = { key: string; icon: typeof Truck; title: string; name: string; sub: string; set: boolean; jump: string }
  const stops: Stop[] = [{
    key: 'from', icon: fromIsAddress ? MapPin : Warehouse, title: 'Ship From', name: partyName(sender), sub: placeOf(sender),
    set: filled(sender.name) || filled(sender.line1), jump: 'sec-parties',
  }]
  legList2.forEach((k, i) => {
    if (i === legList2.length - 1) return
    /* the stop after a leg: First Mile ends at the origin hub, Line Haul at the destination hub */
    const code = k === 'pickup' ? originHub : destHub
    stops.push({ key: `hub${i}`, icon: Warehouse, title: 'Hub', name: code ? hubName(code, stores) : 'From the address', sub: '', set: !!code, jump: 'sec-parties' })
  })
  stops.push({
    key: 'to', icon: toIsAddress ? House : Warehouse, title: allDrops.length > 1 ? `Ship To · ${allDrops.length} addresses` : 'Ship To',
    name: partyName(receiver), sub: allDrops.length > 1 ? `+ ${allDrops.length - 1} more` : placeOf(receiver),
    set: filled(receiver.name) || filled(receiver.line1), jump: growLook ? 'sec-to' : 'sec-parties',
  })
  const LEG_ICON: Record<LegKind, typeof Truck> = { pickup: Bike, linehaul: Truck, delivery: Bike, pickAndDeliver: Zap }
  const routeTimeline = (
    <ol className="flex flex-col">
      {stops.map((st, i) => {
        const leg = i < stops.length - 1 ? legList2[i] : null
        const Icon = st.icon
        const LegIcon = leg ? LEG_ICON[leg] : null
        return (
          <li key={st.key} className="flex gap-3">
            <div className="flex w-8 shrink-0 flex-col items-center">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${st.set ? 'border-ink bg-surface text-ink' : 'border-dashed border-warm-300 text-warm-400'}`}>
                <Icon size={15} strokeWidth={1.9} />
              </span>
              {leg && <span className="my-1 w-0 flex-1 border-l-2 border-dashed border-warm-300" />}
            </div>
            <div className={`min-w-0 flex-1 ${leg ? 'pb-3' : ''}`}>
              {jumpBtn(st.jump, `Edit ${st.title}`, (
                <>
                  <p className="text-[12px] font-bold leading-4 text-ink-3">{st.title}</p>
                  <p className={`truncate text-[14px] leading-5 ${st.name ? 'font-bold text-ink' : 'text-ink-3'}`}>{st.name || 'Not set yet'}</p>
                  {st.sub && <p className="truncate text-[12px] leading-4 text-ink-3">{st.sub}</p>}
                </>
              ), '-mx-1 block w-full rounded-md px-1 py-0.5')}
              {leg && LegIcon && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2 text-[12px] font-bold text-brand-600">
                    <LegIcon size={13} strokeWidth={2} />Leg {i + 1} · {LEG_INFO[leg].name}
                  </span>
                  <span className="truncate text-[12px] text-ink-3" title={LEG_INFO[leg].hint}>{LEG_INFO[leg].rail}</span>
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
  const legCount = legList2.length
  const activeHandling = [
    ...GOODS_CATEGORIES.filter(({ name }) => categories.includes(name) && !isHidden(catKey(name)))
      .map(({ name, icon }) => ({ key: name, icon, label: name, warn: name === 'Hazmat' || name === 'Fragile' })),
    ...(c.scannable && !isHidden('scannable') ? [{ key: 'scan', icon: ScanBarcode, label: 'Barcode per box', warn: false }] : []),
    ...(c.splittable && !isHidden('splittable') ? [{ key: 'split', icon: Split, label: 'Delivered in parts', warn: false }] : []),
    ...(c.clearanceRequired && !isHidden('clearanceRequired') ? [{ key: 'clr', icon: ShieldCheck, label: 'Clearance', warn: false }] : []),
    ...(c.schedulingConfirmation && !isHidden('schedulingConfirmation') ? [{ key: 'sch', icon: CalendarCheck, label: 'Scheduling confirmation', warn: false }] : []),
  ]
  const serviceName = merchantMode ? quote?.name ?? '' : isFtl ? consoleFtl : consoleService
  const TaskIcon = ({ Forward: ArrowRight, Reverse: Undo2, Exchange: Repeat, Service: Wrench, Transfer: ArrowLeftRight } as Record<string, typeof Truck>)[ctype] ?? ArrowRight
  const chip = (key: string, Icon: typeof Truck, text: string, tone: 'plain' | 'on' | 'warn' = 'plain', jump?: string | null) => (
    <span key={key}>{jumpBtn(jump, text, (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold">
        <Icon size={15} strokeWidth={1.9} className="shrink-0" />{text}
      </span>
    ), `inline-flex h-8 items-center rounded-lg border px-2.5 ${tone === 'warn' ? 'border-danger-fg/30 bg-danger-bg text-danger-fg'
      : tone === 'on' ? 'border-brand-100 bg-brand-50 text-brand-600' : 'border-line bg-warm-50 text-ink'}`)}</span>
  )
  const stat = (key: string, Icon: typeof Truck, n: string | number, label: string, jump: string, dim = false) => (
    <span key={key} className="min-w-0">{jumpBtn(jump, `${n} ${label}`, (
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <Icon size={16} strokeWidth={1.75} className={`shrink-0 ${dim ? 'text-warm-400' : 'text-ink-2'}`} />
          <span className={`text-[15px] font-bold leading-5 tabular-nums ${dim ? 'text-ink-3' : 'text-ink'}`}>{n}</span>
        </span>
        <span className="block text-[12px] leading-4 text-ink-3">{label}</span>
      </span>
    ), 'block w-full rounded-lg bg-warm-50 px-2.5 py-2')}</span>
  )
  const infoRow = (key: string, Icon: typeof Truck, label: string, value: ReactNode, strong = false) => (
    <div key={key} className="flex items-center gap-2.5 text-[13px]">
      <Icon size={16} strokeWidth={1.9} className="shrink-0 text-ink-3" />
      <span className="text-ink-2">{label}</span>
      <span className={`ml-auto min-w-0 truncate text-right ${strong ? 'text-[15px] font-bold text-ink' : 'font-bold text-ink'}`}>{value}</span>
    </div>
  )
  const sumHead: Record<string, ReactNode> = {
    route: legCount ? <span className="text-[12px] text-ink-3">{plural(legCount, 'leg')}{movementType ? ` · ${MOVEMENT_LABEL[movementType]}` : ''}</span> : null,
  }
  const sumRow: Record<string, ReactNode> = {
    route: routeTimeline,
    task: (
      <div className="flex flex-wrap gap-2">
        {chip('type', TaskIcon, ctype, 'plain', 'sec-consignment')}
        {chip('load', fullVehicle ? Truck : Boxes, fullVehicle ? 'Full vehicle' : 'Shared vehicle', 'plain', 'sec-consignment')}
        {/* the task type (owner, 2026-10-28: "it is the task type"): one trip with no hub, or through a hub */}
        {!isHidden('hubProcessing') && chip('task', RouteIcon, legsDirect ? 'Pick & deliver' : 'Through a hub', 'plain', 'sec-handling')}
      </div>
    ),
    goods: (
      <div className="grid grid-cols-3 gap-2">
        {isFtl ? stat('veh', Truck, vehicles.length, vehicles.length === 1 ? 'vehicle' : 'vehicles', 'sec-vehicle')
          : stat('pkg', Package, goodsPieces, goodsPieces === 1 ? 'package' : 'packages', 'sec-packages', !goodsPieces)}
        {stat('sku', Boxes, skuUnits, skuUnits === 1 ? 'SKU' : 'SKUs', 'sec-packages', !skuUnits)}
        {stat('vas', Sparkles, vasNames.length, 'VAS', 'sec-extras', !vasNames.length)}
      </div>
    ),
    handling: activeHandling.length ? (
      <div className="flex flex-wrap gap-2">{activeHandling.map((h) => chip(h.key, h.icon, h.label, h.warn ? 'warn' : 'on', 'sec-handling'))}</div>
    ) : <p className="flex items-center gap-2 text-[13px] text-ink-3"><ShieldCheck size={15} className="shrink-0" />No special handling</p>,
    service: (
      <div className="grid gap-2">
        {infoRow('svc', Zap, 'Service', serviceName || <span className="font-normal text-ink-3">Not chosen yet</span>)}
        {infoRow('car', Truck, 'Carrier', (merchantMode ? (mode === 'ftl' ? '2GO Logistics' : '2GO Express') : c.carrier) || <span className="font-normal text-ink-3">Not chosen yet</span>)}
        {infoRow('eta', Clock, 'ETA (est.)', etaDays != null ? plural(etaDays, 'day') : <span className="font-normal text-ink-3">—</span>)}
        {merchantMode && infoRow('price', Banknote, quote ? 'Total, before tax' : 'From', quote ? money(quote.net, currency) : cheapest != null ? money(cheapest, currency) : '—', true)}
      </div>
    ),
  }
  /* Show on Ops / Show on Grow — the whole Summary and each row, per form (edited from the Ops form) */
  const sumOn = (p: FormPortal) => draft.summary[p].enabled
  const rowOn = (p: FormPortal, key: string) => !draft.summary[p].hidden.includes(key)
  const setSum = (p: FormPortal, f: (x: FormSummary) => FormSummary) => setDraft((d) => ({ ...d, summary: { ...d.summary, [p]: f(d.summary[p]) } }))
  const sumPills = (isOn: (p: FormPortal) => boolean, flip: (p: FormPortal, on: boolean) => void, what: string) => (
    <span className="inline-flex shrink-0 items-center gap-1">
      {(['console', 'grow'] as const).map((p) => {
        const who = p === 'grow' ? 'Grow' : 'Ops'
        const on = isOn(p)
        return (
          <Tip key={p} text={on ? `${what} shows on the ${who} form — click to hide it there` : `${what} is hidden on the ${who} form — click to show it`}>
            <button type="button" aria-pressed={on} onClick={() => flip(p, !on)}
              className={`inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[11px] font-bold transition-colors
                ${on ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-line bg-surface text-ink-3 hover:text-ink'}`}>
              {on ? <Eye size={11} /> : <EyeOff size={11} />}{who}
            </button>
          </Tip>
        )
      })}
    </span>
  )
  /* a row hidden on both forms leaves the card while editing too (back, faded, with "Show hidden fields") */
  const sumLines = summaryLinesOf(formPortal).filter((l) => (editing
    ? showHidden || (['console', 'grow'] as const).some((p) => !draft.summary[p].hidden.includes(l.key))
    : !summaryCfg.hidden.includes(l.key)))
  const summarySection = (
    <section id="sec-summary" aria-label={summaryTitle} className="rounded-xl bg-surface px-5 pb-5 pt-4">
      <div className="flex items-center gap-2 pb-4">
        <h2 className="min-w-0 flex-1 text-[15px] font-bold text-ink">{summaryTitle}</h2>
        {editing && sumPills(sumOn, (p, on) => setSum(p, (x) => ({ ...x, enabled: on })), 'The Summary')}
      </div>
      <div className={`grid gap-4 [&>*+*]:border-t [&>*+*]:border-line [&>*+*]:pt-4 ${editing && !sumOn('console') && !sumOn('grow') ? 'opacity-50' : ''}`}>
        {sumLines.map((l) => (
          <div key={l.key} className={editing && !rowOn('console', l.key) && !rowOn('grow', l.key) ? 'opacity-50' : ''}>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="shrink-0 text-[13px] font-bold text-ink">{l.label}</span>
              <span className="min-w-0 flex-1 truncate text-right">{!editing && sumHead[l.key]}</span>
              {editing && sumPills((p) => rowOn(p, l.key), (p, on) => setSum(p, (x) => ({ ...x, hidden: on ? x.hidden.filter((k) => k !== l.key) : [...x.hidden, l.key] })), l.label)}
            </div>
            {sumRow[l.key]}
          </div>
        ))}
      </div>
    </section>
  )

  /* ============================================================ the Simplified form — as it was, restyled:
     Consignment (3 columns, the window on the Ship By Date) · Ship From → Ship To (the address cards + popup) ·
     Package & SKU (one table) · Carriers. No builder rules, no Handling / VAS / legs panel. */
  const setWindowTime = (which: 'windowStart' | 'windowEnd', t: string) =>
    setReceiver((r) => ({ ...r, [which]: t ? `${c.shipByDate || today()}T${t}` : '' }))
  const setSimpleShipBy = (d: string) => {
    setC({ shipByDate: d })
    if (d) setReceiver((r) => ({
      ...r, ...(r.windowStart ? { windowStart: `${d}T${timeOf(r.windowStart)}` } : {}), ...(r.windowEnd ? { windowEnd: `${d}T${timeOf(r.windowEnd)}` } : {}),
    }))
  }
  const simpleConsignment = (
    <FormCard id="sec-consignment" title="Consignment details">
      <SGrid cols={3}>
        <F label="Merchant" required value={merchant?.code ?? ''} placeholder="eg, ELEX"
          options={masters.merchants.map((m) => ({ value: m.code, label: m.name }))} error={err(!merchant)} onChange={(v) => setMerchantCode(v || null)} />
        {/* the Reference Number still copies this — silently (owner, 2026-09-29: no hint line) */}
        <F label={lbl('orderNumber')} required value={c.orderNumber ?? ''} placeholder="eg, ABC0001" error={err(!filled(c.orderNumber))}
          onChange={(v) => setC({ orderNumber: v })} />
        <F label={lbl('consignmentType')} required value={ctype} options={opts(CONSIGNMENT_TYPES)} onChange={changeType} />
        {isFtl
          ? <F label={lbl('serviceType')} required value={ftlService} options={opts(FTL_SERVICE_CODES)} onChange={pickFtlService} />
          : <F label={lbl('serviceType')} required value={service} options={opts(SERVICE_TYPES)} searchable onChange={setService} />}
        {!isFtl && (
          <SFld label="Load type">
            <SwitchBox icon={Truck} label="Dedicate Truck" checked={dedicated} disabled={!!fromOverage} onChange={setDedicateTruck}
              title={dedicated ? 'Full vehicle (FTL / FCL)' : 'Shared vehicle (LTL / LCL)'} />
          </SFld>
        )}
        <F label={lbl('shipByDate')} required type="date" value={c.shipByDate ?? ''} error={err(!filled(c.shipByDate))} onChange={setSimpleShipBy} />
        {/* Start / End Time share one cell and ARE the delivery window on the Ship By Date */}
        <div className="grid grid-cols-2 gap-3">
          <SFld label="Start Time" required error={!filled(timeOf(receiver.windowStart))}>
            <TimeBox value={timeOf(receiver.windowStart)} placeholder="Start" onChange={(v) => setWindowTime('windowStart', v)} />
          </SFld>
          <SFld label="End Time" required error={!filled(timeOf(receiver.windowEnd))}>
            <TimeBox value={timeOf(receiver.windowEnd)} placeholder="End" onChange={(v) => setWindowTime('windowEnd', v)} />
          </SFld>
        </div>
        <SFld label={lbl('tags')}>
          <MultiSelectDropdown size="sm" options={TAG_OPTIONS} values={c.tags ?? []} noun="tags" placeholder="Add tags" onChange={(v) => setC({ tags: v })} />
        </SFld>
      </SGrid>
    </FormCard>
  )
  const simpleParties = (
    <FormCard id="sec-parties" title="Ship From → Ship To">
      <div className="grid gap-y-8 lg:grid-cols-2">
        <div className="min-w-0 lg:pr-8">{addressSlot('from', 0, 'Ship From')}</div>
        <div className="min-w-0 border-t border-warm-200 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">{addressSlot('to', 0, 'Ship To')}</div>
      </div>
      {addressModal}
    </FormCard>
  )
  const SIMPLE_COLS = 'grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_88px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(128px,auto)] items-start gap-x-3'
  const simplePackages = (
    <FormCard id="sec-packages" title="Package & SKU">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className={`${SIMPLE_COLS} border-b border-warm-200 pb-2 text-[13px] text-ink-2`}>
            <span>Package ID</span><span>Package Type</span><span>Quantity<span className="req-star">*</span></span>
            <span>Tracking ID</span><span>SKU Code</span><span>SKU Name</span><span />
          </div>
          {parcels.map((p, i) => {
            const items: (ParcelItem | undefined)[] = p.items?.length ? p.items : [undefined]
            return items.map((it, k) => (
              <div key={`${p.packageId ?? i}-${k}`} className={`${SIMPLE_COLS} ${k === items.length - 1 ? 'border-b border-warm-200' : ''} py-2.5`}>
                {k === 0 ? <>
                  <ReadBox value={p.packageId ?? ''} />
                  <MenuSelect value={packageValue(p, packageTypes)} options={packageTypeOpts.map((o) => o.value)}
                    labels={(v) => packageTypeOpts.find((o) => o.value === v)?.label ?? v} onChange={(v) => pickPackageType(i, v)} />
                  <NumBox value={p.quantity} min={1} integer blankZero placeholder="1" error={err(!(p.quantity > 0))} onChange={(q) => setParcel(i, { quantity: q })} />
                  <Input value={p.trackingNumber ?? ''} placeholder="Optional" disabled={!!fromOverage && i === 0} onChange={(v) => setParcel(i, { trackingNumber: v })} />
                </> : <><span /><span /><span /><span /></>}
                <SkuCode item={it ?? blankItem()} skus={masters.skus} onPick={(sk) => pickSku(i, k, sk)} onUnlink={() => setItem(i, k, { skuCode: null })}
                  onCustom={(code) => setItem(i, k, { skuCode: code })} autoFocus={focusLine?.i === i && focusLine.k === k} />
                <Input value={it?.name ?? ''} placeholder="eg, Refrigerator 300 L" disabled={!!it && isMasterSku(it)} onChange={(v) => setItem(i, k, { name: v })} />
                <span className="flex items-center justify-end gap-1">
                  {k === 0 && (
                    <button type="button" onClick={() => addItem(i)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-brand-500 hover:bg-warm-50">
                      <Plus size={13} />SKU
                    </button>
                  )}
                  <Tip text={k === 0 ? 'Remove package' : 'Remove SKU'}><button type="button" aria-label={k === 0 ? `Remove package ${i + 1}` : `Remove SKU ${k + 1}`}
                    onClick={() => (k === 0 ? (parcels.length > 1 ? removeParcel(i) : setParcels([newParcel()])) : removeItem(i, k))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-brand-500">
                    <Trash2 size={14} />
                  </button></Tip>
                </span>
              </div>
            ))
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <AddMoreButton label="Add Package" onClick={() => { setFocusLine({ i: parcels.length, k: 0 }); setParcels((ps) => [...ps, newParcel()]) }} />
        <span className="text-[13px] text-ink-2">{pieces} piece{pieces === 1 ? '' : 's'} in {parcels.length} package{parcels.length === 1 ? '' : 's'}</span>
      </div>
    </FormCard>
  )

  const byId: Record<string, ReactNode> = merchantMode ? {
    'sec-consignment': consignmentSection, 'sec-parties': partiesSection, 'sec-packages': packagesSection,
    'sec-handling': growLook ? merchantHandlingSection : handlingInstrSection, 'sec-vehicle': growVehicleSection,
    'sec-extras': merchantVasSection, 'sec-svctype': merchantServiceSection,
    'sec-to': merchantToSection, 'sec-pay': growPaySection,
    'sec-payment': paymentSection,
    'sec-summary': summarySection,
  } : simple ? {
    'sec-consignment': simpleConsignment, 'sec-parties': simpleParties, 'sec-packages': simplePackages,
    'sec-vehicle': vehicleSection, 'sec-carrier': carrierSection,
  } : {
    'sec-consignment': consignmentSection, 'sec-parties': partiesSection, 'sec-packages': packagesSection, 'sec-handling': handlingInstrSection,
    'sec-vehicle': vehicleSection, 'sec-extras': merchantVasSection, 'sec-svctype': consoleSvcTypeSection, 'sec-carrier': carrierSection, 'sec-summary': summarySection,
  }

  /* owner, 2026-09-29: a back chevron beside the title (PageHeader's back button) + the one-line subtitle */
  const goBack = () => { clearDraftKeys(); nav(backTo) }
  const backBtn = (
    <Tip text="Go back"><button type="button" onClick={goBack} aria-label="Go back"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-2 shadow-ds-1 transition-colors hover:bg-warm-100">
      <ChevronLeft size={16} />
    </button></Tip>
  )
  const SUBTITLE = 'Provide the order details to ensure accurate processing, routing, and billing of the shipment.'
  const customKeys = (card: CustomFieldCard) => customDefs.filter((d) => d.card === card).map((d) => d.key)
  /* every field the builder can change, by the card it sits in — on either form (All fields has a switch per form) */
  const fieldGroups = [
    { id: 'sec-consignment', title: 'Consignment details', keys: ['merchant', 'orderNumber', 'referenceNumber', 'consignmentNumber', 'consignmentType',
      'shipByDate', 'exchangeOrderNumber', 'dedicateTruck', ...(merchantMode ? ['orderAmount'] : ['paymentMode', 'orderAmount']), ...customKeys('sec-consignment')] },
    { id: 'addresses', title: 'Addresses', keys: ['addrName', 'addrCompanyName', 'addrContact', 'addrEmail', 'addrLine1', 'addrLines23', 'addrLandmark',
      'addrCountry', 'addrPostal', 'addrSuburb', 'addrCity', 'addrState', 'addrCoordinates', 'addrFloorLift', 'addrLift', 'addrWindow', 'schedulingConfirmation'] },
    { id: 'sec-packages', title: 'Package & SKU', keys: [PKG_SECTION, SKU_SECTION, 'pkgType', 'pkgQty', 'pkgWeight', 'pkgDimensions', 'pkgTracking', 'pkgId', 'pkgDescription',
      'pkgPalletSpace', 'skuWeight', 'skuDimensions', 'skuCategory', 'skuDescription', 'skuHsn', 'skuOrigin', 'skuUnitCost', 'skuImage'] },
    { id: 'sec-handling', title: 'Handling & Instructions', keys: [...GOODS_CATEGORIES.map(({ name }) => catKey(name)), 'scannable', 'splittable', 'clearanceRequired',
      'tags', 'hubProcessing', 'vehicleDetails', 'labelFormat', 'totalLoadingTime', 'specialInstructions',
      ...customKeys('sec-handling'), ...customKeys('sec-service')] },
    { id: 'sec-extras', title: 'Value Added Services', keys: ['vas', 'vasTime', 'vasRemark'] },
    { id: 'sec-svctype', title: 'Service Type', keys: ['serviceType'] },
    { id: 'sec-carrier', title: 'Carriers', keys: ['carrier'] },
  ].map((g) => ({ ...g, keys: g.keys.filter((k) => known(k) && !(MERCHANT_OFF.has(k) && CONSOLE_OFF.has(k))) }))
  /* a whole card shown or hidden per form (owner, 2026-10-28: "show / hide section also, for Grow and Ops") = its fields'
     Show for Ops / Show for Grow at once. Offered only on a card whose every field can be hidden (Handling, Service &
     instructions) — a card holding a field the system needs cannot go. A hidden field is never required, so a hidden card
     never blocks an order. */
  const groupKeysOf = (id: string) => fieldGroups.find((g) => g.id === (id === 'sec-parties' ? 'addresses' : id))?.keys ?? []
  const cardKeysOn = (id: string, p: FormPortal) => groupKeysOf(id).filter((k) => !offOn(p).has(k))
  /* owner, 2026-10-28 ("hide an entire section — unless a field in it is required"): every card with builder fields offers it;
     a card holding a required field (or one the system needs) cannot be hidden until that field is optional */
  const cardHideable = (id: string) => (['console', 'grow'] as const).some((p) => cardKeysOn(id, p).length > 0)
  const cardBlock = (id: string, p: FormPortal): string | null => {
    const req = cardKeysOn(id, p).find((k) => !hiddenOn(k, p) && (!!lockOn(k) || (requirable(k) && (rulesOf(p)[k]?.required ?? DEFAULT_REQUIRED.has(k)))))
    return req ? `${fieldName(req)} is required — make it optional to hide this card` : null
  }
  const cardShownOn = (id: string, p: FormPortal) => cardKeysOn(id, p).some((k) => !hiddenOn(k, p))
  const setCardShown = (id: string, p: FormPortal, on: boolean) => setDraft((d) => {
    const side = p === 'grow' ? 'grow' : 'con'
    const r = { ...d[side] }
    for (const k of cardKeysOn(id, p)) r[k] = { ...r[k], hidden: !on }
    return { ...d, [side]: r }
  })
  /** the card's two show switches — on its top edge while editing, and on its row in All fields */
  const cardShowTools = (id: string, title: string) => (
    <span className="inline-flex items-center gap-1">
      {(['console', 'grow'] as const).map((p) => {
        const who = p === 'grow' ? 'Grow' : 'Ops'
        const on = cardShownOn(id, p)
        const block = on ? cardBlock(id, p) : null
        return (
          <Tip key={p} text={block ?? (on ? `${title} shows on the ${who} form — click to hide the whole card there` : `${title} is hidden on the ${who} form — click to show it`)}>
            <button type="button" aria-pressed={on} aria-label={`${on ? 'Hide' : 'Show'} ${title} for ${who}`} disabled={!!block}
              onClick={(e) => { e.stopPropagation(); setCardShown(id, p, !on) }}
              className={`inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[11px] font-bold shadow-ds-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50
                ${on ? 'border-brand-200 bg-brand-50 text-brand-600' : 'border-line bg-surface text-ink-3 hover:text-ink'}`}>
              {on ? <Eye size={11} /> : <EyeOff size={11} />}{who}
            </button>
          </Tip>
        )
      })}
    </span>
  )
  /* ONE builder (owner, 2026-10-28): edited on the Ops form; Preview shows either form with the working copy */
  const formName = merchantMode ? 'Grow' : 'Ops'
  const seg = (on: boolean) => `inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] transition-colors
    ${on ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-transparent text-ink-2 hover:bg-warm-50'}`
  /* Preview only: which form it shows */
  const portalSwitch = (
    <div role="radiogroup" aria-label="Which form the preview shows" className="inline-flex shrink-0 gap-1 rounded-lg border border-line bg-surface p-1">
      {([['console', 'Ops form', Monitor, 'What ops see on Add Consignment'], ['grow', 'Grow form', Store, 'What merchants see on Grow Create Order']] as const)
        .map(([p, label, Icon, hint]) => (
          <Tip key={p} text={hint}>
            <button type="button" role="radio" aria-checked={formPortal === p} onClick={() => switchPortal(p)} className={seg(formPortal === p)}>
              <Icon size={14} />{label}
            </button>
          </Tip>
        ))}
    </div>
  )
  /* Edit (click a field to change it — on the Ops form) | Preview (the form exactly as people see it, nothing is created) */
  const modeSwitch = (
    <div role="radiogroup" aria-label="Edit or preview" className="inline-flex shrink-0 gap-1 rounded-lg border border-line bg-surface p-1">
      {([[false, 'Edit', SlidersHorizontal], [true, 'Preview', Eye]] as const).map(([pv, label, Icon]) => (
        <button key={label} type="button" role="radio" aria-checked={previewing === pv} className={seg(previewing === pv)}
          onClick={() => {
            if (!pv && merchantMode) { switchPortal('console', false); return }
            setPreviewing(pv); setSelKey(null); setAllOpen(false); setCardOpts(null); if (!pv) setShowErrors(false)
          }}>
          <Icon size={14} />{label}
        </button>
      ))}
    </div>
  )
  const checkForm = () => {
    setShowErrors(true)
    const first = orderedSections.find((sec) => !doneOf[sec])
    if (first) jumpTo(first)
    else toast.success(`Every required field is filled — the ${formName} form would go through`)
  }
  const resetForm = () => setDraft((d) => ({ ...d, con: {}, layout: { ...d.layout, console: DEFAULT_LAYOUT }, order: {}, summary: { ...d.summary, console: DEFAULT_SUMMARY.console } }))
  const builderBar = merchantMode && !building ? (
    <>
      <div className="mb-4 flex items-start gap-3">
        {backBtn}
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold leading-8 text-ink">Create Order</h1>
          <p className="text-[13px] text-ink-2">{SUBTITLE}</p>
        </div>
      </div>
    </>
  ) : building ? (
    /* the builder's bar (owner, 2026-10-28: "merge, simplify the header") — ONE row: the name with its ⓘ, Edit | Preview, the
       tools of that mode, and Cancel / Save at the end */
    <div className="sticky top-0 z-40 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface px-5 py-3 shadow-ds-1">
      <p className="flex shrink-0 items-center gap-1.5 text-[15px] font-bold text-ink">
        <SlidersHorizontal size={16} className="text-brand-500" />Form builder
        <InfoTip text={previewing
          ? `Preview: exactly what ${merchantMode ? 'merchants see on Grow Create Order' : 'ops see on Add Consignment'}, with your unsaved changes. Fill it in to try it — nothing is created or saved.`
          : 'One builder for the Ops and the Grow form. Click a field to open its settings, or use the small icons on it: ✱ required · ☰ under More · eye show / hide. Name, Required, More, width and explainer apply to both forms; each field has its own Show for Ops and Show for Grow. Preview shows either form as people see it.'} />
      </p>
      {modeSwitch}
      {previewing && portalSwitch}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {previewing
          ? <Button variant="outline" size="sm" icon={<ListChecks size={14} />} onClick={checkForm}>Check required fields</Button>
          : <>
              <Button variant="outline" size="sm" icon={<ListChecks size={14} />} onClick={() => showFieldGroup(null)}>All fields</Button>
              <Tip text="Hidden fields stay in the form, faded, so you can bring them back">
                <InlineSwitch label="Show hidden fields" checked={showHidden} onChange={setShowHidden} />
              </Tip>
              <Tip text="Every field setting, Show for Ops, the field order and the Ops display options back to the start (Show for Grow is kept)">
                <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={resetForm}>Reset to default</Button>
              </Tip>
            </>}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {dirty && <span className="text-[12px] text-ink-3">Unsaved changes</span>}
        <Button variant="outline" onClick={cancelEditing}>Cancel</Button>
        <Button disabled={!dirty} onClick={saveEditing}>Save changes</Button>
      </div>
    </div>
  ) : (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
      {backBtn}
      <div className="min-w-0">
        <h1 className="text-[18px] font-bold leading-8 text-ink">{liveEdit ? 'Modify Consignment' : 'Add Consignment'}{simple && <span className="ml-2 text-[13px] font-normal text-ink-3">· Simplified</span>}</h1>
        <p className="text-[13px] text-ink-2">
          {SUBTITLE}
        </p>
      </div>
      </div>
      {/* owner, 2026-09-29: no old-form link, no change count, no simplified-form note — just the builder entry */}
      {!simple && (
        <div className="flex items-center gap-2">
          {/* owner, 2026-10-27: "Form builder", with the builder's own icon */}
          <Button variant="outline" icon={<LayoutTemplate size={14} />} onClick={startEditing}>Form builder</Button>
        </div>
      )}
    </div>
  )

  /* ============================================================ the builder's field settings (2026-10-05 v3, owner: "I don't
     want the side bar — find another way — but I love the idea"): click a field in the preview and its settings open in
     a CARD RIGHT NEXT TO IT, in plain words; the form-level choices sit on the cards they change (each address, the
     goods, Grow's services); "All fields" (the editing bar) lists every field in one searchable dialog — for hidden
     ones and for an address's own fields while the address is a card. */
  /* Esc closes a field's card (a dialog on top handles its own Esc) */
  useEffect(() => {
    if (!editing) return
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[data-modal-open]')) setSelKey(null) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [editing])
  /** a field's name as the form shows it */
  const fieldName = (k: string) => (k.startsWith('card:') ? `${SECTION_TITLES[k.slice(5)] ?? 'Card'} — info`
    : k === 'dedicateTruck' ? custom('dedicateTruck', 'Dedicate Truck', 'Load type')
    : k === 'scannable' ? custom('scannable', 'Scannable', 'Barcode on every box')
    : k === 'splittable' ? 'Can be delivered in parts' : lbl(k))
  const groupOf = (k: string) => fieldGroups.find((g) => g.keys.includes(k))?.title ?? ''
  /** the system's own name for a field (what an empty rename falls back to) */
  const defaultName = (k: string) => customOf(k)?.label ?? (V2_KEYS.has(k) ? FIELD_DEF.get(k)!.defaultLabel : fieldLabel(k, fieldCfg))
  const pickField = (k: string) => {
    setSelKey(k)
    window.setTimeout(() => fieldEl(k)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30)
  }
  const toggleGroup = (id: string) => setOpenGroups((st) => { const n = new Set(st); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const needle = allQuery.trim().toLowerCase()
  const verb = merchantMode ? 'the order can go to checkout' : 'the consignment can be added'
  /** the Required setting itself (shared) — whether or not the previewed form shows the field */
  const reqSet = (k: string) => requirable(k) && (rules[k]?.required ?? DEFAULT_REQUIRED.has(k))
  const offBoth = (k: string) => hiddenOn(k, 'console') && hiddenOn(k, 'grow')
  /** settings only one field has (Service Type: the service used while it is hidden) */
  const fieldExtra = (k: string): ReactNode => {
    /* Dedicate Truck (2026-10-07): what a hidden switch gives every consignment */
    if (k === 'dedicateTruck') return (
      <div>
        <PanelHeading>While it is hidden</PanelHeading>
        <SFld label="Every consignment books">
          <MenuSelect value={truckDefault ? 'on' : 'off'} options={['off', 'on']}
            labels={(v) => (v === 'on' ? 'A dedicated truck (full vehicle)' : 'A shared vehicle')}
            onChange={(v) => setRule('dedicateTruck', { defaultValue: v })} />
        </SFld>
        <p className="mt-2 text-[12px] text-ink-3">A full-vehicle order or pickup request keeps its own.</p>
      </div>
    )
    if (k !== 'serviceType') return null
    /* the console offers the static list; the Grow form books from the Service Type master's Active rows */
    const list = merchantMode ? services.map((x) => x.code) : SERVICE_TYPES
    const name = (code: string) => services.find((x) => x.code === code)?.name ?? code
    const cur = list.includes(ruleDefault) ? ruleDefault : merchantMode ? (services[0]?.code ?? '') : defaultService
    const growSvcDefault = draft.grow.serviceType?.defaultValue?.trim() ?? ''
    return (
      <div>
        <PanelHeading>While it is hidden</PanelHeading>
        <SFld label="Service every consignment gets">
          <MenuSelect value={cur} options={list} labels={name} searchable={list.length > 8}
            onChange={(v) => setRule('serviceType', { defaultValue: v })} />
        </SFld>
        <p className="mt-2 text-[12px] text-ink-3">
          {merchantMode
            ? 'Merchants are not asked — the order is priced with this service. A full vehicle still picks its vehicles.'
            : `Nobody is asked. A full-vehicle consignment uses ${FTL_SERVICE_CODES.includes(cur) ? cur : DEFAULT_FTL_SERVICE} unless this is a vehicle service. A saved draft keeps its own service.`}
        </p>
        {/* Grow's own Service Type (owner, 2026-10-28: the one setting Grow does not take from the Ops form) */}
        {!merchantMode && (
          <div className="mt-8">
            <PanelHeading>On the Grow form</PanelHeading>
            <div className="grid gap-5">
              <SFld label="Services show as">
                <LayoutSeg label="" value={draft.layout.grow.services === 'menu' ? 'menu' : 'grid'}
                  onChange={(v) => setLayoutOf('grow', (l) => ({ ...l, services: v }))} options={[
                    { value: 'grid', label: 'Cards', tip: 'One full-width card per service — radio, name, carrier, rate' },
                    { value: 'menu', label: 'Dropdown', tip: 'One compact dropdown — the shortest step' },
                  ]} />
              </SFld>
              <SFld label="Service every order gets while it is hidden for Grow">
                <MenuSelect value={services.some((x) => x.code === growSvcDefault) ? growSvcDefault : (services[0]?.code ?? '')}
                  options={services.map((x) => x.code)} labels={name} searchable={services.length > 8}
                  onChange={(v) => setDraft((d) => ({ ...d, grow: { ...d.grow, serviceType: { ...d.grow.serviceType, defaultValue: v } } }))} />
              </SFld>
            </div>
            <p className="mt-2 text-[12px] text-ink-3">Merchants pick a service from priced cards; hidden, the order is priced with this one.</p>
          </div>
        )}
      </div>
    )
  }
  /** a card's ⓘ (owner, 2026-10-28): its text, or none — shared by both forms */
  const cardInfoSettings = (k: string) => {
    const own = fieldEl(k)?.getAttribute('data-default-tip') ?? ''
    const r = rules[k]
    return (
      <BuilderCtx.Provider value={null}>
      <div className="grid gap-6">
        <div className="divide-y divide-line rounded-lg border border-line">
          <SettingRow title="Show the ⓘ" checked={!r?.noTip} onChange={(on) => setRule(k, { noTip: on ? undefined : true })}
            hint={r?.noTip ? 'The card shows no ⓘ.' : 'People see it when they point at the ⓘ.'} />
          <div className="px-4 py-3">
            <p className="text-[13px] text-ink-3">Text — empty = the card’s own{own ? `: “${own}”` : ''}</p>
            <textarea rows={3} maxLength={150} value={r?.tooltip ?? ''} placeholder={own || 'eg, Who it is for and how it is identified'}
              disabled={!!r?.noTip} onChange={(e) => setRule(k, { tooltip: e.target.value })} className={`mt-2 ${TEXTAREA} disabled:opacity-50`} />
            <p className="mt-1 text-right text-[12px] text-ink-3">{(r?.tooltip ?? '').length}/150</p>
          </div>
        </div>
        {(r?.tooltip || r?.noTip) && (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />}
            onClick={() => setRule(k, { tooltip: undefined, noTip: undefined })}>Use the card’s own text</Button>
        )}
      </div>
      </BuilderCtx.Provider>
    )
  }
  /** one field's settings — the same body in the card beside the field and in All fields */
  const fieldSettings = (k: string, close: () => void) => {
    if (k.startsWith('card:')) return cardInfoSettings(k)
    const lock = lockOf(k)
    const cdef = customOf(k)
    const renamable = !GROUP_KEYS.has(k) && !GOODS_SECTIONS.has(k) && k !== 'splittable' && k !== 'vas'
    return (
      <BuilderCtx.Provider value={null}>
      {/* two balanced columns when there is room (the popup); one in All fields' narrow pane */}
      <div className="@container">
      <div className="grid gap-5 @min-[560px]:block @min-[560px]:columns-2 @min-[560px]:gap-6 @min-[560px]:[&>*]:mb-5 @min-[560px]:[&>*]:break-inside-avoid">
        {lock && (
          <p className="flex items-start gap-2 rounded-lg bg-warm-50 px-3 py-2.5 text-[12px] text-ink-2">
            <Lock size={13} className="mt-0.5 shrink-0 text-ink-3" />
            {lock === 'system' ? 'The system needs this field — it is always shown and always required.' : lock === 'last'
              ? 'Packages or SKUs must show — show the other one first to hide this.' : 'This form needs this field — it is always shown.'}
          </p>
        )}
        {renamable && (
          <SFld label="Name on the form" helper={`Empty = “${defaultName(k)}”`}>
            <Input value={rules[k]?.label ?? fieldName(k)} placeholder={defaultName(k)} onChange={(v) => setRule(k, { label: v })} />
          </SFld>
        )}
        {!lock && (
          <div className="divide-y divide-line rounded-lg border border-line">
            {(['console', 'grow'] as const).map((p) => {
              const usual = offOn(p).has(k)
              const par = hiddenWithOn(k, p)
              const off = ownHiddenOn(k, p)
              const plock = lockOn(k)
              return (
                <SettingRow key={p} title={p === 'grow' ? 'Show for Grow' : 'Show for Ops'}
                  checked={!off} disabled={!!plock} onChange={(on) => setShown(k, p, on)}
                  hint={plock === 'last' ? 'Packages or SKUs must show — show the other one first to hide this.'
                    : par && !off ? `On — it shows once ${fieldName(par)} shows on this form.`
                    : usual && !off ? (p === 'grow' ? 'Merchants see it — normally the carrier or ops set it.' : 'Ops see it — normally only merchants are asked.')
                    : usual && off ? (p === 'grow' ? 'Off by default — the carrier or ops set it. Switch on to ask merchants.' : 'Off by default — only merchants are asked. Switch on to ask ops.')
                    : off
                    ? (k === 'serviceType' ? 'Hidden — every consignment gets the service set for this form.'
                      : k === 'dedicateTruck' ? 'Hidden — every consignment gets the load type below.'
                      : k === 'vehicleDetails' ? 'Hidden — the carrier picks the vehicle for a dedicated truck.'
                      : k === 'referenceNumber' ? `Hidden — it copies the ${lbl('orderNumber')}.`
                      : k === 'consignmentType' ? 'Hidden — every consignment is Forward.'
                      : k === 'shipByDate' ? 'Hidden — every consignment ships by the day it is created.'
                      : k === 'paymentMode' ? 'Hidden — every order is Prepaid.'
                      : k === 'merchant' ? 'Hidden — the signed-in merchant is recorded.'
                      : k === PKG_SECTION ? 'Hidden — people enter SKUs and how many; the packages are worked out.'
                      : k === SKU_SECTION ? 'Hidden — people enter packages only.'
                      : 'Hidden — saved consignments keep their answer.')
                    : p === 'grow' ? 'Merchants see it on Create Order.' : 'Ops see it on Add Consignment.'} />
              )
            })}
            {requirable(k) && (
              <SettingRow title="Required" checked={reqSet(k)} disabled={offBoth(k)} onChange={(on) => setRule(k, { required: on })}
                hint={merchantMode && GROW_OWN_KEYS.has(k) ? `On the Grow form, it must be filled before ${verb}.`
                  : 'On both forms — wherever it shows, it must be filled.'} />
            )}
            {movable(k) && (
              <SettingRow title="Put under “More”" checked={inMore(k)} disabled={offBoth(k) || reqSet(k) || (growLook && GROW_FIXED_PLACE.has(k))} onChange={(on) => setRule(k, { more: on })}
                hint={reqSet(k) ? 'A required field always stays in the main form.'
                  : growLook && GROW_FIXED_PLACE.has(k) ? 'The Grow form keeps it in its own place (its SKU table) — set this on the Ops form.'
                  : SKU_ROW_KEYS.has(k) ? 'It shows only when someone opens a SKU line’s details (the chevron at its end).'
                  : 'It shows only when someone clicks More in this section.'} />
            )}
          </div>
        )}
        {fieldExtra(k)}
        {/* owner, 2026-10-28: no Position row (a field is dragged in the form); the explainer is one plain field */}
        {(widthable(k) || textField(k)) && (
          <div className="divide-y divide-line rounded-lg border border-line">
            {widthable(k) && (
              <SettingRow title="Width" hint="How much of its row it takes."
                control={<LayoutSeg label="" value={rules[k]?.width ?? DEFAULT_WIDTH[k] ?? 'm'} onChange={(v) => setRule(k, { width: v === (DEFAULT_WIDTH[k] ?? 'm') ? undefined : v })} options={FIELD_WIDTHS} />} />
            )}
            {textField(k) && (
              <SettingRow title="Character limit" hint="Blank for no limit."
                control={<div className="w-24"><NumBox integer blankZero min={0} value={rules[k]?.maxLength ?? 0}
                  onChange={(n) => setRule(k, { maxLength: n > 0 ? Math.min(500, n) : undefined })} /></div>} />
            )}
          </div>
        )}
        {!GOODS_SECTIONS.has(k) && (
          <SFld label="Explainer (ⓘ beside the name)">
            <Input value={rules[k]?.tooltip ?? ''} placeholder="eg, The number on the merchant's invoice"
              onChange={(v) => setRule(k, { tooltip: v.slice(0, 150) })} />
          </SFld>
        )}
        {formatable(k) && (
          <div>
            <PanelHeading>What can be typed</PanelHeading>
            <FormatEditor key={k} value={fmtOf(k)} onChange={(f) => setRule(k, { format: f })} />
          </div>
        )}
        {cdef && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-4 py-3">
            <span className="text-[12px] text-ink-3">
              {CUSTOM_FIELD_KINDS.find((x) => x.value === cdef.kind)?.label}{cdef.kind === 'list' ? ` · ${(cdef.options ?? []).join(', ')}` : ''}
            </span>
            <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => { removeCustom(k); close() }}>Remove field</Button>
          </div>
        )}
      </div>
      </div>
      </BuilderCtx.Provider>
    )
  }
  const fieldHead = (k: string, close: () => void) => (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-ink">{fieldName(k)}</p>
        <p className="mt-0.5 text-[12px] text-ink-3">{[groupOf(k), customOf(k) ? 'your own field' : ''].filter(Boolean).join(' · ')}</p>
      </div>
      <Tip text="Close"><button type="button" aria-label="Close" onClick={close}
        className="-mr-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-warm-100 hover:text-ink">
        <X size={15} />
      </button></Tip>
    </div>
  )
  /* the card beside the selected field */
  const fieldCard = editing && selKey ? (
    <AnchoredCard anchorKey={selKey} onClose={() => setSelKey(null)}>
      <div className="border-b border-line px-5 py-4">{fieldHead(selKey, () => setSelKey(null))}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{fieldSettings(selKey, () => setSelKey(null))}</div>
      <div className="flex justify-end border-t border-line px-5 py-3">
        <Button variant="outline" size="sm" onClick={() => setSelKey(null)}>Done</Button>
      </div>
    </AnchoredCard>
  ) : null
  /* All fields — every field by card, a show / hide switch on each, the picked one's settings beside the list */
  const allFieldsDialog = (
    <Modal open={editing && allOpen} wide title="All fields"
      subtitle="Every field on both forms. Ops and Grow switch it on or off on each form; click its name for the rest — those settings apply to both." 
      onClose={() => setAllOpen(false)}
      footer={<>
        <span className="mr-auto"><AddRowLink label="Add field" onClick={() => setAddCard(null)} /></span>
        <Button onClick={() => setAllOpen(false)}>Done</Button>
      </>}>
      <div className="grid gap-6 pb-4 pt-1 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <SearchInput value={allQuery} onChange={setAllQuery} placeholder="Find a field" />
          <div className="mt-3 flex flex-col">
            {fieldGroups.map((g) => {
              const keys = needle ? g.keys.filter((k) => fieldName(k).toLowerCase().includes(needle)) : g.keys
              if (!keys.length) return null
              const open = !!needle || openGroups.has(g.id)
              const hiddenN = g.keys.filter((k) => isHidden(k)).length
              const reqN = g.keys.filter((k) => need(k) || lockOf(k) === 'system').length
              return (
                <div key={g.id} className="border-b border-line last:border-b-0">
                  <button type="button" aria-expanded={open} onClick={() => toggleGroup(g.id)}
                    className="flex w-full items-center gap-2 py-2.5 text-left">
                    {open ? <ChevronDown size={14} className="shrink-0 text-ink-3" /> : <ChevronRight size={14} className="shrink-0 text-ink-3" />}
                    <span className="text-[13px] font-bold text-ink">{g.title}</span>
                    <span className="text-[12px] text-ink-3">{keys.length}</span>
                    <span className="ml-auto truncate text-[12px] text-ink-3">
                      {[reqN ? `${reqN} required` : '', hiddenN ? `${hiddenN} hidden` : ''].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  {cardHideable(g.id) && (
                    <div className="flex items-center justify-end gap-2 pb-2 pr-1">
                      <span className="text-[12px] text-ink-3">Whole card</span>{cardShowTools(g.id, g.title)}
                    </div>
                  )}
                  {open && (
                    <ul className="pb-2">
                      {keys.map((k) => (
                        <li key={k} className={`flex items-center gap-2 rounded-md py-1 pl-6 pr-1 ${allKey === k ? 'bg-warm-50' : 'hover:bg-warm-50'}`}>
                          <button type="button" aria-pressed={allKey === k} onClick={() => setAllKey(k)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left text-[13px] text-ink">
                            <span className={`min-w-0 truncate ${isHidden(k) ? 'text-ink-3' : ''} ${allKey === k ? 'font-bold' : ''}`}>{fieldName(k)}</span>
                            {(need(k) || lockOf(k) === 'system') && <span className="shrink-0 text-danger-fg">*</span>}
                          </button>
                          <FieldChips k={k} hideHidden />
                          {(['console', 'grow'] as const).map((p) => {
                            const who = p === 'grow' ? 'Grow' : 'Ops'
                            const par = hiddenWithOn(k, p)
                            const on = !ownHiddenOn(k, p)
                            return lockOn(k) === 'system' || lockOn(k) === 'form'
                              ? <span key={p} className="w-[76px] shrink-0 text-center text-[12px] text-ink-3">{who} · always</span>
                              : <Tip key={p} text={par && on ? `Show for ${who} — on; it shows once ${fieldName(par)} does` : `Show for ${who} — ${on ? 'on' : 'off'}`}>
                                  <span className="inline-flex w-[76px] shrink-0 items-center justify-end gap-1.5 text-[12px] text-ink-3">{who}
                                    <Toggle checked={on} disabled={!!lockOn(k)} onChange={(v) => setShown(k, p, v)} /></span>
                                </Tip>
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            {needle && fieldGroups.every((g) => !g.keys.some((k) => fieldName(k).toLowerCase().includes(needle))) && (
              <p className="py-3 text-[13px] text-ink-3">No field is called “{allQuery.trim()}”.</p>
            )}
          </div>
        </div>
        <div className="min-w-0 self-start rounded-lg border border-line md:sticky md:top-0">
          {allKey
            ? <>
                <div className="border-b border-line px-4 py-3">{fieldHead(allKey, () => setAllKey(null))}</div>
                <div className="px-4 py-5">{fieldSettings(allKey, () => setAllKey(null))}</div>
              </>
            : <p className="px-4 py-6 text-[13px] text-ink-3">Click a field’s name to change it — its name, whether it is required, what can be typed.</p>}
        </div>
      </div>
    </Modal>
  )

  return (
    <BuilderCtx.Provider value={builder}>
    <SortCtx.Provider value={sortApi}>
    <ShowErrorsCtx.Provider value={showErrors}>
    <div className={merchantMode && !setup ? 'pb-6' : 'px-6 pb-10 pt-2'}>
      {builderBar}
      {merchantMode && pr && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <Truck size={15} className="shrink-0 text-info-fg" />
          <span>Creating an order for <b>{pr.number}</b>{pr.ftlServiceType ? ` · ${pr.ftlServiceType}` : ''} · window {prWindow(pr)}</span>
          <Link to={prPath(pr.id)} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}
      {fromPr && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <Truck size={15} className="shrink-0 text-info-fg" />
          <span>Creating the FTL order for <b>{fromPr.number}</b>
            {fromPr.ftlServiceType ? ` · ${fromPr.ftlServiceType}` : ''}
            {fromPr.vehicleType ? ` · ${(fromPr.vehicleUnit ?? 1) > 1 ? `${fromPr.vehicleUnit} × ` : ''}${fromPr.vehicleType}` : ''} · window {prWindow(fromPr)}</span>
          <Link to={prPath(fromPr.id)} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}
      {fromOverage && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-info-bg px-4 py-2.5 text-[13px] text-ink">
          <ScanBarcode size={15} className="shrink-0 text-info-fg" />
          <span>Creating the order for overage scan <b className="font-mono">{fromOverage.scan.barcode}</b> from <b>{fromOverage.pr.number}</b>
            {fromOverage.scan.weightKg != null ? ` · ${fromOverage.scan.weightKg} kg` : ''}</span>
          <Link to={prPath(fromOverage.pr.id)} className="font-bold text-brand-500 hover:text-brand-600">View pickup request</Link>
        </div>
      )}

      {/* owner, 2026-10-06: the Summary is a vertical card — beside the form while the form area is at least 1000px wide
          (container query, so a collapsed sidebar counts), else under the cards. One element, placed by the grid. */}
      <div className="@container">
      <div className={summaryShown ? 'grid items-start gap-4 @min-[1000px]:grid-cols-[minmax(0,1fr)_300px]' : ''}>
      <div className="grid min-w-0 gap-4">
        {orderedSections.filter((id) => byId[id]).map((id, n, list) => (
          <div key={id} className={`group/card relative min-w-0 ${editing && growOnlyCard(id) ? '[&>section]:opacity-60' : ''}`}>
            {editing && !merchantMode && cardHideable(id) && (
              <span className="absolute -top-[11px] left-5 z-20 inline-flex items-center gap-1.5 rounded-full bg-surface pl-1 pr-1">
                <span className="text-[11px] text-ink-3">Card</span>{cardShowTools(id, SECTION_TITLES[id] ?? 'this card')}
                {growOnlyCard(id) && <span className={`${CHIP} bg-brand-50 font-bold text-brand-600`}>Grow only</span>}
              </span>
            )}
            {editing && !simple && list.length > 1 && (
              <SectionMover title={SECTION_TITLES[id] ?? 'this card'} first={n === 0} last={n === list.length - 1}
                onMove={(dir) => {
                  const next = [...list]
                  const j = n + dir
                  ;[next[n], next[j]] = [next[j], next[n]]
                  setDraftOrder((o) => ({ ...o, [SECTION_ZONE]: next }))
                }} />
            )}
            {byId[id]}
          </div>
        ))}
      </div>
      {summaryShown && (
        <aside className="min-w-0 @min-[1000px]:sticky @min-[1000px]:top-4 @min-[1000px]:max-h-[calc(100vh-2rem)] @min-[1000px]:overflow-y-auto">
          {summarySection}
        </aside>
      )}
      </div>
      </div>
      {fieldCard}
      {allFieldsDialog}

      {/* sticky footer — the form switch (owner, 2026-09-29: where the section strip was), then Go Back + Add Order */}
      <div data-form-footer className="sticky bottom-0 z-30 mt-4 flex items-center gap-x-4 rounded-xl border border-warm-200 bg-surface px-6 py-3 shadow-ds-1">
        {merchantMode ? (
          /* Grow step 1 (owner, 2026-10-07: "remove the estimate from the bar below"): no price here — the rate is shown where the
             service is chosen, on the next step. Only what STOPS an order is said: no vehicle, or no bookable service. */
          /* owner, 2026-10-27 (the Grow team's form): how far the required fields are, then what STOPS the order */
          <div className="flex min-w-0 items-center gap-3">
            {!editing && (
              <span className="flex shrink-0 items-center gap-2 text-[13px] text-ink-2">
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-warm-100">
                  <span className={`block h-full rounded-full ${canSubmit ? 'bg-success-fg' : 'bg-brand-500'}`}
                    style={{ width: `${allReq.length ? Math.round((filledCount / allReq.length) * 100) : 100}%` }} />
                </span>
                <span><b className="text-ink">{filledCount}/{allReq.length}</b> required</span>
              </span>
            )}
            {mode && ready && !ftlOk ? <p className="min-w-0 truncate text-[13px] text-ink-3">Add a vehicle</p>
              : mode && ready && ftlOk && !quotes.length ? <p className="min-w-0 truncate text-[13px] text-ink-3">No service can be booked on this route — please contact support</p>
              : null}
          </div>
        ) : (
          /* the Simplified switch is gone (owner, 2026-10-27) */
          null
        )}
        {/* the actions never wrap away from each other — the strip gives way first */}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {editing
            ? <span className="text-[13px] text-ink-2">Save or cancel the form changes first</span>
            : building && previewing && !(showErrors && !canSubmit) ? <span className="text-[13px] text-ink-2">Preview — nothing is created</span>
            : showErrors && !canSubmit && (
              /* a way back to the gaps once the page has scrolled away from them */
              <button type="button" onClick={() => { const first = orderedSections.find((s) => !doneOf[s]); if (first) jumpTo(first) }}
                className="text-[13px] font-bold text-danger-fg hover:underline">
                {missingCount} field{missingCount === 1 ? '' : 's'} to fill or fix
              </button>
            )}
          {/* Grow (owner, 2026-10-27, the Grow team's form): Save for later · Go Back · Create Consignment */}
          {merchantMode && <Button variant="outline" onClick={saveForLater} disabled={building}>Save for later</Button>}
          {!building && <Button variant="ghost" onClick={goBack}>Go Back</Button>}
          {/* enabled: a click with gaps shows them (errors appear only after this attempt) */}
          <Button onClick={proceed} disabled={building}>{merchantMode
            ? (paidNowOf(pay.choice.parts) > 0 && growQuote && pay.choice.ready ? `Pay ${money(paidNowOf(pay.choice.parts), currency)} and create` : 'Create Consignment')
            : liveEdit ? 'Save changes' : 'Add Order'}</Button>
        </div>
      </div>

      {/* the builder's dialogs (2026-10-05) — plain fields, outside the builder's label tools */}
      <BuilderCtx.Provider value={null}>
      {addCard !== false && (
        <AddFieldDialog card={addCard} portal={formPortal} taken={customDefs.map((d) => d.label.toLowerCase())}
          onClose={() => setAddCard(false)}
          onAdd={(def, required, alsoOther) => {
            setDraftCustom((ds) => [...ds, def])
            if (required) setRule(def.key, { required: true })
            if (!alsoOther) setShown(def.key, otherPortal, false)
            setAddCard(false)
            /* the new field opens, ready to be set up — in All fields when it was added from there */
            if (allOpen) setAllKey(def.key); else pickField(def.key)
            toast.success(`${def.label} added to ${CUSTOM_FIELD_CARDS[def.card]} — Save changes to keep it`)
          }} />
      )}
      </BuilderCtx.Provider>
    </div>
    </ShowErrorsCtx.Provider>
    </SortCtx.Provider>
    </BuilderCtx.Provider>
  )
}

/* ================================================================ the builder's field settings (2026-10-05 v3) ==== */

/** One switch in a field's settings: what it does in words, the switch on the right (greyed when it cannot change). */
function SettingRow({ title, hint, checked = false, onChange, disabled, control }: {
  title: string; hint: string; checked?: boolean; onChange?: (v: boolean) => void; disabled?: boolean
  /** a choice instead of the switch (Width, Position) — the same row */
  control?: ReactNode
}) {
  return (
    <div className={`flex items-start gap-4 px-4 py-3 ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>
      </div>
      {control ? <span className="shrink-0">{control}</span>
        : <span className={`mt-0.5 shrink-0 ${disabled ? 'pointer-events-none' : ''}`}><Toggle checked={checked} onChange={onChange ?? (() => undefined)} /></span>}
    </div>
  )
}
/** A heading inside a field's settings. */
function PanelHeading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
      <p className="text-[12px] font-bold uppercase tracking-wide text-ink-3">{children}</p>
      {right}
    </div>
  )
}

/**
 * The builder's settings card for one field, anchored to the field in the preview (2026-10-05 v3, owner: "no side bar") —
 * portaled to <body> (cards are overflow-clipped), below the field when there is room, else above it, kept inside the
 * screen and following the field as the page scrolls. A click outside closes it; a click on another field moves it there;
 * a menu's list or a dialog opened from it does not count as outside.
 */
/** a field's element in the preview — the one in an open dialog first (the address pop-up while the form is edited), never the
    same field behind it */
const fieldEl = (k: string) => {
  const sel = `[data-field="${CSS.escape(k)}"]`
  return document.querySelector(`[data-modal-open] ${sel}`) ?? document.querySelector(sel)
}
/* owner, 2026-10-28 ("see everything in one go without much of a scroll"): wide enough for two columns of settings */
const CARD_W = 680
function AnchoredCard({ anchorKey, onClose, children }: { anchorKey: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  /* the field sits in a dialog (the address pop-up): the card goes above it, and the rest of that dialog is "outside" */
  const inModal = useRef(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number; modal: boolean } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const vw = window.innerWidth, vh = window.innerHeight
      const el = fieldEl(anchorKey)
      const modal = el ? !!el.closest('[data-modal-open]') : !!document.querySelector('[data-modal-open]')
      inModal.current = modal
      /* the field left the preview (hidden while "Show hidden fields" is off): the card waits in the middle */
      if (!el) { setPos({ top: 120, left: Math.max(16, (vw - CARD_W) / 2), maxHeight: vh - 160, modal }); return }
      const r = el.getBoundingClientRect()
      const gap = 14
      /* the form's sticky footer covers the bottom of the screen — the card stays above it (a pop-up sits over the footer) */
      const foot = modal ? 0 : (document.querySelector('[data-form-footer]') as HTMLElement | null)?.getBoundingClientRect().height ?? 0
      const below = vh - r.bottom - gap - 16 - foot
      const above = r.top - gap - 16
      const left = Math.min(Math.max(16, r.left - 6), vw - CARD_W - 16)
      /* neither side has room for the whole card: it takes the screen's height (over the field) rather than scroll */
      const room = 440
      setPos(below >= room ? { top: r.bottom + gap, left, maxHeight: below, modal }
        : above >= room ? { bottom: vh - r.top + gap, left, maxHeight: above, modal }
        : { top: 16, left, maxHeight: vh - 32 - foot, modal })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [anchorKey])
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t || ref.current?.contains(t)) return
      if (t.closest?.('[role="listbox"], [data-field]')) return
      /* a dialog opened from the card is not outside — the dialog the FIELD sits in is */
      if (!inModal.current && t.closest?.('[data-modal-open]')) return
      onClose()
    }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [onClose])
  if (!pos) return null
  const { modal, ...box } = pos
  return createPortal(
    /* above the nueva Modal (z-70) when its field is in one; menus (z-95) and tooltips (z-100) stay above it */
    <div ref={ref} role="dialog" aria-label="Field settings" style={{ ...box, width: CARD_W }}
      className={`fe-nueva fixed ${modal ? 'z-[80]' : 'z-[60]'} flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-ds-overlay`}>
      {children}
    </div>,
    document.body,
  )
}
/** An in-place choice on a card while the form is edited — how an address, the goods or the services are shown. */
function LayoutSeg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; tip: string }[]; onChange: (v: T) => void
}) {
  /* ONE look for every builder choice (owner, 2026-10-07: "make sure the controls look consistent"): a segmented control at
     input height, the chosen one border-ink + warm-50 — the same everywhere (addresses, services, SKU list, field width) */
  return (
    <span className="inline-flex items-center gap-3">
      {label && <span className="text-[13px] text-ink-2">{label}</span>}
      <span role="radiogroup" aria-label={label || undefined} className="inline-flex h-8 shrink-0 gap-0.5 rounded-md border border-line bg-surface p-0.5">
        {options.map((o) => (
          <Tip key={o.value} text={o.tip}>
            <button type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
              className={`inline-flex h-full items-center whitespace-nowrap rounded border px-2.5 text-[12px] transition-colors
                ${value === o.value ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-transparent text-ink-2 hover:bg-warm-50 hover:text-ink'}`}>
              {o.label}
            </button>
          </Tip>
        ))}
      </span>
    </span>
  )
}

/**
 * What may be typed in one field — edited live in the field's settings card: Any text (no check), a preset (numbers only, an
 * email, a phone number…) or the account's own regular expression, an optional length, the message people see, and
 * a "Try it" box.
 */
function FormatEditor({ value, onChange }: { value: FieldFormat | undefined; onChange: (f: FieldFormat | undefined) => void }) {
  const f: FieldFormat = value ?? { preset: 'any' }
  const [sample, setSample] = useState('')
  const set = (patch: Partial<FieldFormat>) => {
    const next = { ...f, ...patch }
    onChange(next.preset === 'any' ? undefined : next)
  }
  const preset = FORMAT_PRESETS.find((p) => p.value === f.preset) ?? FORMAT_PRESETS[0]
  const bad = patternError(f)
  const lenBad = !!f.minLength && !!f.maxLength && f.minLength > f.maxLength
  const tried = sample.trim() && f.preset !== 'any' ? formatError(f, sample) : null
  const num = (v: string) => { const n = Math.round(Number(v)); return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined }
  return (
    <div className="grid gap-y-6">
      <SFld label="Allowed">
        <MenuSelect value={f.preset} options={FORMAT_PRESETS.map((p) => p.value)}
          labels={(v) => FORMAT_PRESETS.find((p) => p.value === v)?.label ?? v}
          onChange={(v) => set({ preset: v as FormatPreset })} />
      </SFld>
      {f.preset === 'custom' && (
        <SFld label="Pattern (regular expression)" error={bad && f.pattern ? bad : undefined} errorNow
          helper={bad ? undefined : 'eg, ^ORD[0-9]{6}$ = ORD + 6 digits'}>
          <Input value={f.pattern ?? ''} placeholder="^ORD[0-9]{6}$" onChange={(v) => set({ pattern: v })} />
        </SFld>
      )}
      {f.preset !== 'any' && <>
        <div className="grid grid-cols-2 gap-x-3">
          <SFld label="Shortest" error={lenBad ? 'Longer than the longest' : undefined} errorNow>
            <Input type="number" value={f.minLength ? String(f.minLength) : ''} placeholder="Any" onChange={(v) => set({ minLength: num(v) })} />
          </SFld>
          <SFld label="Longest">
            <Input type="number" value={f.maxLength ? String(f.maxLength) : ''} placeholder="Any" onChange={(v) => set({ maxLength: num(v) })} />
          </SFld>
        </div>
        <SFld label="Message when it does not match">
          <Input value={f.message ?? ''} placeholder={formatMessage({ ...f, message: '' }) || 'Does not match the required format'}
            onChange={(v) => set({ message: v })} />
        </SFld>
        <div className="rounded-lg bg-warm-50 p-3">
          <p className="mb-2 text-[13px] font-bold text-ink">Try it</p>
          <Input value={sample} placeholder={preset.example ? `eg, ${preset.example}` : 'Type a sample value'} onChange={setSample} />
          <p className={`mt-2 flex items-center gap-1.5 text-[12px] ${!sample.trim() || bad ? 'text-ink-3' : tried ? 'text-danger-fg' : 'text-success-fg'}`}>
            {!sample.trim() || bad ? 'Type a value to see if it passes.'
              : tried ? <><X size={13} />{tried}</> : <><Check size={13} />Looks good — this value passes.</>}
          </p>
        </div>
      </>}
    </div>
  )
}

/**
 * Add field — the account's own field in a card: its name, what kind of answer it takes, and whether it is required.
 * One choice only for the other form: show it there too (on by default).
 */
function AddFieldDialog({ card, portal, taken, onAdd, onClose }: {
  /** the card it was opened from; null = from All fields, the dialog asks where it goes */
  card: CustomFieldCard | null; portal: 'console' | 'grow'; taken: string[]
  onAdd: (def: CustomFieldDef, required: boolean, alsoOther: boolean) => void; onClose: () => void
}) {
  const [where, setWhere] = useState<CustomFieldCard>(card ?? 'sec-consignment')
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<CustomFieldKind>('text')
  const [choices, setChoices] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [required, setRequired] = useState(false)
  const [alsoOther, setAlsoOther] = useState(true)
  const [tried, setTried] = useState(false)
  const options = [...new Set(choices.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))]
  const nameErr = !label.trim() ? 'Give the field a name' : taken.includes(label.trim().toLowerCase()) ? 'A field with this name already exists' : null
  const listErr = kind === 'list' && options.length < 2 ? 'Add at least two choices' : null
  const other = portal === 'grow' ? 'Ops' : 'Grow'
  const add = () => {
    setTried(true)
    if (nameErr || listErr) return
    onAdd({
      key: newCustomKey(), label: label.trim(), kind, card: where,
      ...(kind === 'list' ? { options } : {}),
      ...(placeholder.trim() && kind !== 'yesno' && kind !== 'date' ? { placeholder: placeholder.trim() } : {}),
    }, required && kind !== 'yesno', alsoOther)
  }
  return (
    <Modal open title="Add a field" subtitle={card ? `It appears in ${CUSTOM_FIELD_CARDS[card]}. You can rename it, move it, make it required or check what is typed later.`
      : 'Your own field, beside the system fields. You can rename it, move it, make it required or check what is typed later.'}
      onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={add}>Add field</Button></>}>
      <div className="grid gap-7 pb-4 pt-1">
        <SFld label="Field name" required error={tried && nameErr ? nameErr : undefined} errorNow>
          <Input value={label} placeholder="eg, PO Number" onChange={setLabel} />
        </SFld>
        {!card && (
          <SFld label="Where it shows">
            <MenuSelect value={where} options={Object.keys(CUSTOM_FIELD_CARDS)} labels={(v) => CUSTOM_FIELD_CARDS[v as CustomFieldCard]}
              onChange={(v) => setWhere(v as CustomFieldCard)} />
          </SFld>
        )}
        <div>
          <p className="mb-1.5 text-[13px] text-ink">Answer type</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Answer type">
            {CUSTOM_FIELD_KINDS.map((k) => (
              <button key={k.value} type="button" role="radio" aria-checked={kind === k.value} onClick={() => setKind(k.value)}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] transition-colors
                  ${kind === k.value ? 'border-ink bg-warm-50 font-bold text-ink' : 'border-line bg-surface text-ink-2 hover:border-warm-300 hover:text-ink'}`}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
        {kind === 'list' && (
          <SFld label="Choices" required error={tried && listErr ? listErr : undefined} errorNow helper={tried && listErr ? undefined : 'One per line, or separated by commas'}>
            <textarea rows={3} value={choices} placeholder={'eg, Morning\nAfternoon\nEvening'} onChange={(e) => setChoices(e.target.value)} className={TEXTAREA} />
          </SFld>
        )}
        {(kind === 'text' || kind === 'number' || kind === 'list') && (
          <SFld label="Hint inside the box (optional)">
            <Input value={placeholder} placeholder={kind === 'list' ? 'eg, Select a slot' : 'eg, PO-12345'} onChange={setPlaceholder} />
          </SFld>
        )}
        <div className="grid gap-3">
          {kind !== 'yesno' && <InlineSwitch label="Required" title="It must be filled before the consignment can be added" checked={required} onChange={setRequired} />}
          <InlineSwitch label={`Show for ${other} too`} title={`Off: only on the ${portal === 'grow' ? 'Grow' : 'Ops'} form`}
            checked={alsoOther} onChange={setAlsoOther} />
        </div>
      </div>
    </Modal>
  )
}
