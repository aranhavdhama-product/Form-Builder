/**
 * Placing a Grow order — ONE function for the one-page Create Order form (owner, 2026-10-27: the Grow team's form,
 * "Create Consignment" on the form itself) and the older step-2 checkout (`CheckoutPage`, still reachable with a session
 * draft). It turns the draft + the chosen service into the order, freezes the quoted charges, records the payment split
 * in the ledger, and links it where it belongs: an overage scan (born Picked Up on that request), a reserved pickup
 * request, or an automatic pickup booking. It clears the draft keys. The caller says so (toast) and navigates.
 */
import { CURRENCY } from '../../growOrders/seed'
import { inboundHubFor } from '../../growOrders/hubs'
import { growOrderActions, newOrderId, newOrderNumber, orderById, pickupRequestById } from '../../growOrders/store'
import type { GrowOrder, PaymentMode } from '../../growOrders/types'
import { recordSplitPayment, type LedgerEntry, type PaymentPart } from '../../growOrders/ledger'
import type { ServiceQuote } from '../../growOrders/rates'
import { clearDraftKeys, quoteOf, vehiclesOf, volKg, type OrderDraft, type OverageSidecar } from '../../growOrders/draft'
import { payNote } from './splitPayment'

/** The draft with the chosen service: what the order is made from, and what Back hands the form. A full vehicle
    also carries it as its `ftlServiceType` and in the synthetic FTL line's description. */
export function withService(d: OrderDraft, q: Pick<ServiceQuote, 'code' | 'net' | 'days'>): OrderDraft {
  if (d.shipmentType !== 'FTL') return { ...d, service: q.code, rate: q.net, etaDays: q.days }
  const types = vehiclesOf(d).map((v) => v.vehicleType)
  return {
    ...d, service: q.code, ftlServiceType: q.code, rate: q.net, etaDays: q.days,
    parcels: d.parcels.map((p, i) => (i === 0 ? { ...p, itemInfo: [q.code, ...types, ...d.additionalServices].join(' · ') } : p)),
  }
}

/** the form's tax rule: 15 %, whole pesos, cents for dollars */
export const taxOf = (rate: number, currency: string) => (currency === '$' ? Math.round(rate * 15) / 100 : Math.round(rate * 0.15))

export interface PlacedOrder {
  order: GrowOrder
  entries: LedgerEntry[]
  /** "Paid ₱X by wallet …" — for the toast */
  paidNote: string
  /** where it went: an overage scan's request, a reserved pickup request, an automatic pickup booking, or nowhere yet */
  linked: { kind: 'overage'; prId: string; barcode: string; prNumber: string } | { kind: 'pickup'; prId: string; prNumber: string }
    | { kind: 'auto'; prNumber: string } | { kind: 'none' }
}

export function placeGrowOrder({ draft, chosen, parts, merchantCode, pickupId, overage }: {
  draft: OrderDraft
  chosen: Pick<ServiceQuote, 'code' | 'net' | 'days'>
  parts: PaymentPart[]
  merchantCode: string | null
  /** the reserved pickup request the order was created for (`DRAFT_PICKUP_KEY`) */
  pickupId?: string | null
  /** the overage scan the order answers (`?fromOverage=`) */
  overage?: OverageSidecar | null
}): PlacedOrder {
  const cur = draft.currency || CURRENCY
  const payment: PaymentMode = draft.consignment?.paymentMode === 'COD' ? 'COD' : 'Prepaid'
  const cod = payment === 'COD' ? draft.consignment?.orderAmount ?? 0 : 0
  const remarks = draft.consignment?.remarks?.trim() ?? ''
  const carrier = draft.shipmentType === 'FTL' ? '2GO Logistics' : '2GO Express'
  const d = withService(draft, chosen)
  const taxes = taxOf(d.rate, cur)
  const p0 = d.parcels[0]
  /* what makes a shipment a Document is the CARGO classification, not the packaging it happens to be in */
  const isDocument = p0.cargoType === 'Document'
  /** Every SKU / custom item across the packages, for the order record. */
  const items = d.parcels.flatMap((p) => p.items ?? [])
  /* resumed draft → update that same order; otherwise create a new one */
  const existing = d.orderId ? orderById(d.orderId) : undefined
  /** what the Create Consignment form collected beyond the legacy draft fields */
  const cf = d.consignment
  const booksVehicle = d.shipmentType === 'FTL' || !!cf?.dedicateTruck || !!d.vehicleType
  const o: GrowOrder = {
    /* newOrderId(), not `o${Date.now()}` — two orders placed inside one millisecond would otherwise share an id */
    id: existing?.id ?? newOrderId(), orderNumber: cf?.orderNumber?.trim() || existing?.orderNumber || newOrderNumber(),
    orderType: cf?.consignmentType === 'Reverse' ? 'Reverse Order' : 'Forward Order',
    createdAt: existing?.createdAt ?? new Date().toISOString(), status: 'Order Created',
    storeCode: d.storeCode, inboundHubCode: inboundHubFor(d.receiver), sender: d.sender, receiver: d.receiver, drops: d.drops, shipmentType: d.shipmentType, vehicleType: booksVehicle ? d.vehicleType : '',
    /* FTL, or a dedicated-truck parcel consignment — both keep the booked vehicles */
    ...(booksVehicle ? { vehicleUnit: d.vehicleUnit, actualLoad: d.actualLoad, additionalServices: d.additionalServices,
      ...(d.vehicles?.length ? { vehicles: d.vehicles } : {}) } : {}),
    pkg: { kind: d.shipmentType === 'FTL' ? 'FTL' : isDocument ? 'Document' : 'Parcel', count: d.parcels.reduce((n, p) => n + p.quantity, 0),
      weightKg: d.parcels.reduce((n, p) => n + Math.max(p.weight, volKg(p)) * p.quantity, 0), lengthCm: p0.l, widthCm: p0.w, heightCm: p0.h,
      description: d.parcels.map((p) => p.itemInfo).filter(Boolean).join('; '),
      declaredValue: (d.sourceParcels ?? d.parcels).reduce((n, p) => n + (p.declaredValue ?? 0) * p.quantity, 0),
      /* carried onto the order so the view page can show what the form collected — the package preset and the SKU rows */
      ...(d.shipmentType === 'FTL' ? {} : { cargoType: p0.cargoType, packageType: p0.packageTypeName ?? '', ...(items.length ? { items } : {}) }) },
    paymentMode: payment, codAmount: payment === 'COD' ? Number(cod) || 0 : 0, currency: cur,
    carrier: cf?.carrier || carrier, serviceType: d.service,
    trackingNumber: p0.trackingNumber?.trim() || '', pickupDate: '',
    /* the merchant is never a form field — it is recorded here, and on `consignment` */
    remarks: [d.authority, d.instructions, remarks,
      cf?.merchantCode || cf?.merchantName ? `Merchant: ${[cf.merchantCode, cf.merchantName].filter(Boolean).join(' · ')}` : ''].filter(Boolean).join(' · '),
    error: '',
    ...(cf ? { consignment: cf } : {}),
    /* paid when it is placed — the order lands on the Ready for Pickup tab */
    paymentStatus: 'Paid', isDraft: false, pickupRequestId: null, pickedInRequestId: null, draft: null,
    /* FREEZE what was quoted. A rate card that changes tomorrow must not retroactively restate what this merchant paid. */
    charges: cur === '$' ? { shipping: d.rate, tax: taxes, total: Math.round((d.rate + taxes) * 100) / 100, service: d.service } : quoteOf(d.rate, d.service),
  }
  /* an order created FOR an overage scan was ALREADY collected — it is born Picked Up on that request, and carries the
     scanned barcode as its tracking number. A stale sidecar (scan resolved elsewhere) falls back to a normal order. */
  const ovPr = overage ? pickupRequestById(overage.prId) : undefined
  const scan = ovPr?.overages.find((v) => v.id === overage?.overageId && !v.orderId)
  if (ovPr && scan) {
    o.trackingNumber = scan.barcode
    o.status = 'Picked Up'
    o.pickupRequestId = ovPr.id
    o.pickedInRequestId = ovPr.id
    o.pickupDate = ovPr.date
  }
  if (existing) growOrderActions.update(o.id, o)
  else growOrderActions.create(o)
  /* the Payments ledger (Wallet): one debit per method used — wallet / card paid, pay later / COD pending */
  const entries = recordSplitPayment(o, parts)
  const paidNote = payNote(parts, cur)
  clearDraftKeys()
  if (ovPr && scan) {
    growOrderActions.resolveOverage(ovPr.id, scan.id, o.id)
    return { order: o, entries, paidNote, linked: { kind: 'overage', prId: ovPr.id, barcode: scan.barcode, prNumber: ovPr.number } }
  }
  /* created FOR a reserved pickup — attach it. A stale key (request cancelled or gone) falls back to the normal exit. */
  const forPr = pickupId ? pickupRequestById(pickupId) : undefined
  if (forPr && growOrderActions.attachOrdersToPickup(forPr.id, [o.id]).length > 0) {
    return { order: o, entries, paidNote, linked: { kind: 'pickup', prId: forPr.id, prNumber: forPr.number } }
  }
  /* autoCreateOnConsignment: the paid order is booked at once (joined to the open request at its store, or a new one) */
  const auto = growOrderActions.autoBookOnConsignment(o.id, merchantCode)
  return { order: o, entries, paidNote, linked: auto ? { kind: 'auto', prNumber: auto.number } : { kind: 'none' } }
}
