/**
 * Carrier allocation rules (SED-14605) — no React, so the popup and any page can share them.
 * Production's rule: a carrier can be changed once a consignment is At Facility or Ready For Last Mile Dispatch.
 */
import { growOrderActions, orderById } from '../../growOrders/store'
import type { LocalConsignmentRow } from './adapter'

/** why a consignment cannot take a carrier yet — null when it can */
export function carrierBlock(r: LocalConsignmentRow): string | null {
  if (r.state === 'At Facility' || r.secondaryState === 'Ready For Last Mile Dispatch') return null
  return `${r.state || 'Not at the facility'} — the carrier can be changed once it is At Facility or Ready For Last Mile Dispatch`
}

/** write one carrier onto these consignments; returns how many changed */
export function allocateCarrier(rows: LocalConsignmentRow[], carrier: string): number {
  let n = 0
  for (const r of rows) {
    if (carrierBlock(r)) continue
    const o = orderById(r.orderId)
    if (!o) continue
    growOrderActions.update(o.id, { carrier, ...(o.consignment ? { consignment: { ...o.consignment, carrier } } : {}) })
    n++
  }
  return n
}
