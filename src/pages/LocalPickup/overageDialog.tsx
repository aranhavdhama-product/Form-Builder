/**
 * Shipment overage (owner, 2026-10-22): the Pickup grid's overage count opens this popup — every barcode the driver
 * scanned that matched no booking on the request, when it was scanned, its weight and note, and the order it became.
 */
import { Button, Modal } from '../../nueva/components'
import type { GrowOrder, GrowPickupRequest } from '../../growOrders/types'
import { fmtStamp } from './prModel'

export function OverageDialog({ pr, byId, onClose }: {
  pr: GrowPickupRequest
  byId: Map<string, GrowOrder>
  onClose: () => void
}) {
  const n = pr.overages.length
  return (
    <Modal open title={`Shipment overage · ${pr.number}`} onClose={onClose}
      subtitle={`${n} scan${n === 1 ? '' : 's'} that matched no shipment booked on this pickup request`}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="pb-4">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th className="py-2 pr-3 font-bold">Barcode</th>
              <th className="py-2 pr-3 font-bold">Scanned at</th>
              <th className="py-2 pr-3 text-right font-bold">Weight</th>
              <th className="py-2 pr-3 font-bold">Shipment created</th>
              <th className="py-2 font-bold">Note</th>
            </tr>
          </thead>
          <tbody>
            {pr.overages.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-3 font-mono font-bold text-ink">{o.barcode}</td>
                <td className="py-2 pr-3 text-ink-2">{fmtStamp(o.scannedAt)}</td>
                <td className="py-2 pr-3 text-right text-ink-2">{o.weightKg != null ? `${o.weightKg} kg` : '—'}</td>
                <td className="py-2 pr-3 text-ink-2">{o.orderId ? byId.get(o.orderId)?.orderNumber ?? o.orderId : 'Not yet'}</td>
                <td className="py-2 text-ink-2">{o.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
