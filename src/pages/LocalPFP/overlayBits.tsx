/**
 * The two pieces both detail drawers are built from — the four-column
 * label/value grid and the titled panel around it.
 *
 * Extracted because a consignment drawer and a pickup drawer must look like the
 * same surface, and the only way to guarantee that is for them to render the
 * same markup rather than two copies that drift (CLAUDE.md: a pattern that
 * repeats twice becomes a component).
 */
import type { ReactNode } from 'react'
import { Panel } from '../../nueva/components'

/** label · value · `wide` = the value takes the whole row (a list of numbers) */
export type Pair = [string, ReactNode] | [string, ReactNode, { wide: boolean }]

export function Grid({ pairs }: { pairs: Pair[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      {pairs.map(([k, v, o]) => (
        <div key={k} className={`min-w-0${o?.wide ? ' sm:col-span-2 lg:col-span-4' : ''}`}>
          <p className="text-[12px] text-ink-3">{k}</p>
          <p className="mt-0.5 text-[13px] font-bold text-ink break-words">{v}</p>
        </div>
      ))}
    </div>
  )
}

export function Section({ title, pairs }: { title: string; pairs: Pair[] }) {
  return <Panel title={title}><Grid pairs={pairs} /></Panel>
}
