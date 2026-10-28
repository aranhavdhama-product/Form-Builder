/**
 * Allocate carrier (SED-14605, RCBC) — the carrier for the selected / scanned consignments. One popup serves the
 * Pending For Planning selection menu's **Modify Carrier** and the Scan page's **Allocate carrier** button.
 * Production's rule stands: a carrier can be changed once a consignment is At Facility or Ready For Last Mile
 * Dispatch; any other row is listed as skipped with that reason, and nothing happens to it.
 * The write goes to the order AND its consignment block, so View Consignment reads the same carrier as the list.
 */
import { useState } from 'react'
import { Button, Field, MenuSelect, Modal } from '../../nueva/components'
import type { LocalConsignmentRow } from './adapter'
import { allocateCarrier, carrierBlock } from './carrierAllocation'

export default function AllocateCarrierDialog({ rows, carriers, onClose, onDone }: {
  rows: LocalConsignmentRow[]
  /** the carriers on offer (the network's), "No Carrier" excluded by the caller */
  carriers: string[]
  onClose: () => void
  onDone: (changed: number, carrier: string) => void
}) {
  const eligible = rows.filter((r) => !carrierBlock(r))
  const skipped = rows.filter((r) => carrierBlock(r))
  const current = [...new Set(eligible.map((r) => r.carrier).filter((c) => c && c !== 'No Carrier'))]
  const [carrier, setCarrier] = useState(current.length === 1 ? current[0] : '')
  const save = () => { if (carrier && eligible.length) onDone(allocateCarrier(eligible, carrier), carrier) }
  return (
    <Modal open title="Allocate carrier" onClose={onClose}
      subtitle={`${eligible.length} of ${rows.length} consignment${rows.length === 1 ? '' : 's'} can take a carrier`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!carrier || !eligible.length} onClick={save}>{eligible.length > 1 ? `Allocate to ${eligible.length}` : 'Allocate'}</Button></>}>
      <div className="pb-4">
        <Field label="Carrier" required>
          <MenuSelect value={carrier} options={carriers} placeholder={carriers.length ? 'Select carrier' : 'No carriers for this network'} searchable onChange={setCarrier} />
        </Field>
        {current.length > 1 && <p className="mt-2 text-[13px] text-ink-3">These consignments have different carriers today ({current.join(', ')}); all get the one you pick.</p>}
        {skipped.length > 0 && (
          <div className="mt-4 rounded-md border border-line">
            <p className="border-b border-line bg-thead px-3 py-2 text-[13px] font-bold text-ink">Skipped ({skipped.length})</p>
            <ul className="max-h-40 overflow-y-auto px-3 py-2 text-[13px] text-ink-2">
              {skipped.map((r) => <li key={r.id} className="py-0.5"><b className="text-ink">{r.orderNumber}</b> · {carrierBlock(r)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}
