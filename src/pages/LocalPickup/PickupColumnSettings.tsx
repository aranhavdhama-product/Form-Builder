/**
 * Settings › Pickup columns (`/local/columns/pickup`, owner 2026-10-23) — the Pickup page's column configuration, built
 * from the owner's column sheet (`pickupColumnConfig.PICKUP_COLUMN_SHEET`).
 *
 * Drawn as PRODUCTION's Custom Settings › Base Modules › Consignment Order page (owner: "match its design with production
 * ui"): back arrow + title + one-line description; one card with icon tabs (active = brand text over a thick underline);
 * `Select All │ n/N Selected … Sequence`; a scrolling list of tall rounded checkbox rows, tinted when on, a grey sequence
 * pill on the right (the locked row is the grey one); and the footer `Reset … Auto Increment Sequence · Edit Sequence ·
 * Save Settings`. Order is changed the production way — Edit Sequence makes the pills editable numbers, Auto Increment
 * renumbers 1..n. The sheet's three flags are the three tabs. Save = every visitor's Pickup page.
 */
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ListFilter, Search, Table2, type LucideIcon } from 'lucide-react'
import { toast } from '../../nueva/toast'
import { defaultPickupColumns, loadPickupColumns, savePickupColumns, type PickupColumnSetting } from './pickupColumnConfig'

type TabId = 'table' | 'filters' | 'search'
/* owner, 2026-10-23: the table configuration's text — Lato 14 / 20, weight 400, no tracking, #4C5761 */
const TEXT = "font-['Lato'] text-[14px] leading-[20px] font-normal tracking-normal text-[#4C5761]"

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'table', label: 'Table Configuration', icon: Table2 },
  { id: 'filters', label: 'On Page Filters', icon: ListFilter },
  { id: 'search', label: 'Search', icon: Search },
]

export default function PickupColumnSettings() {
  const nav = useNavigate()
  const [tab, setTab] = useState<TabId>('table')
  const [cols, setCols] = useState<PickupColumnSetting[]>(loadPickupColumns)
  const [saved, setSaved] = useState(() => JSON.stringify(loadPickupColumns()))
  /* Edit Sequence: the typed numbers, applied as an order when editing ends (or on Save / Auto Increment) */
  const [seqDraft, setSeqDraft] = useState<Record<string, string> | null>(null)

  const flag = (c: PickupColumnSetting) => (tab === 'table' ? c.show : tab === 'filters' ? c.filter : c.search)
  const offered = (c: PickupColumnSetting) => (tab === 'table' ? true : tab === 'filters' ? c.canFilter : c.canSearch)
  const locked = (c: PickupColumnSetting) => tab === 'table' && !!c.locked
  const rows = cols.filter(offered)
  const on = rows.filter(flag)
  const allOn = rows.every((c) => flag(c) || locked(c))
  /* the sequence = the place among the ticked rows, in column order — what the Pickup page draws */
  const seq = new Map(on.map((c, i) => [c.key, i + 1]))

  const patchFlag = (keys: Set<string>, v: boolean) => setCols((cs) => cs.map((c) => (keys.has(c.key) && !locked(c)
    ? { ...c, ...(tab === 'table' ? { show: v } : tab === 'filters' ? { filter: v } : { search: v }) } : c)))

  /* a typed number MOVES that column to that position among the shown ones (production's Edit Sequence); the rest keep
     their order around it. Hidden columns keep their places. */
  const reorderShown = (cs: PickupColumnSetting[], draft: Record<string, string>): PickupColumnSetting[] => {
    const shown = cs.filter((c) => c.show)
    const moved = shown.map((c, i) => ({ c, to: Number(draft[c.key]), from: i + 1 }))
      .filter((x) => Number.isFinite(x.to) && x.to > 0 && x.to !== x.from).sort((x, y) => x.to - y.to)
    const order = shown.filter((c) => !moved.some((m) => m.c.key === c.key))
    moved.forEach((m) => order.splice(Math.min(m.to - 1, order.length), 0, m.c))
    let k = 0
    return cs.map((c) => (c.show ? order[k++] : c))
  }
  const applySeq = (draft: Record<string, string>) => setCols((cs) => reorderShown(cs, draft))
  const toggleEdit = () => {
    if (seqDraft) { applySeq(seqDraft); setSeqDraft(null) } else setSeqDraft(Object.fromEntries([...seq].map(([k, n]) => [k, String(n)])))
  }
  const autoIncrement = () => {
    if (seqDraft) applySeq(seqDraft)
    setSeqDraft(null)
    toast.info('Sequence renumbered 1 to ' + on.length + '.')
  }

  const current = seqDraft ? null : JSON.stringify(cols)
  const dirty = !!seqDraft || current !== saved
  const save = () => {
    const next = seqDraft ? reorderShown(cols, seqDraft) : cols
    if (seqDraft) { setCols(next); setSeqDraft(null) }
    savePickupColumns(next)
    setSaved(JSON.stringify(next))
    toast.success('Pickup columns saved — the Pickup page shows them this way for everyone.')
  }
  const reset = () => { setSeqDraft(null); setCols(defaultPickupColumns()) }

  return (
    <div className="p-6">
      {/* production's header: back arrow · title · one-line description */}
      <div className="mb-4 flex items-start gap-3">
        <button type="button" onClick={() => nav('/local/pickup')} aria-label="Back to Pickup"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-warm-50">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-[18px] font-bold leading-tight text-ink">Pickup</h1>
          <p className="mt-0.5 text-[14px] text-ink-2">Control which columns and filters are displayed, their sequence, and what the search matches.</p>
        </div>
      </div>

      <div className="flex flex-col rounded-xl border border-line bg-surface shadow-ds-1">
        {/* icon tabs — the active one brand-coloured over a thick underline */}
        <div role="tablist" className="flex gap-1 border-b border-line px-5">
          {TABS.map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button key={t.id} type="button" role="tab" aria-selected={active}
                onClick={() => { setTab(t.id); setSeqDraft(null) }}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-3 text-[14px] transition-colors
                  ${active ? 'border-brand-500 font-bold text-brand-500' : 'border-transparent text-ink-2 hover:text-ink'}`}>
                <Icon size={16} />{t.label}
              </button>
            )
          })}
        </div>

        {/* Select All │ n/N Selected … Sequence */}
        <div className="flex items-center justify-between px-5 pb-2.5 pt-4">
          <div className={`flex items-center gap-3 ${TEXT}`}>
            <button type="button" className="text-brand-500 hover:text-brand-600"
              onClick={() => patchFlag(new Set(rows.map((c) => c.key)), !allOn)}>{allOn ? 'Clear All' : 'Select All'}</button>
            <span className="border-l border-line pl-3">{on.length}/{rows.length} Selected</span>
          </div>
          <span className={`pr-[30px] ${TEXT}`}>Sequence</span>
        </div>

        <div className="max-h-[calc(100vh-330px)] min-h-[240px] space-y-2 overflow-y-auto px-5 pb-4">
          {rows.map((c) => {
            const ticked = flag(c)
            const lock = locked(c)
            return (
              <div key={c.key}
                className={`flex items-center gap-3 rounded-lg border px-4 py-2 transition-colors
                  ${lock ? 'border-line bg-warm-100' : ticked ? 'border-brand-100 bg-brand-50/70' : 'border-line bg-surface'}`}>
                <Tick checked={ticked} disabled={lock} label={c.label}
                  onChange={() => patchFlag(new Set([c.key]), !ticked)} />
                <span className={`min-w-0 flex-1 truncate ${TEXT}`} title={c.description}>{c.label}</span>
                {tab === 'filters' && ticked && (
                  <span className={`shrink-0 ${TEXT}`}>
                    {c.key === 'window' ? 'Date range' : c.key === 'status' || c.key === 'hub' ? 'On the filter line' : 'In More filters'}
                  </span>
                )}
                {seqDraft && tab === 'table' && ticked ? (
                  <input type="number" min={1} value={seqDraft[c.key] ?? ''} aria-label={`Sequence of ${c.label}`}
                    onChange={(e) => setSeqDraft((d) => ({ ...(d ?? {}), [c.key]: e.target.value }))}
                    className={`h-8 w-16 shrink-0 rounded-md border border-brand-500 bg-surface text-center outline-none ${TEXT}`} />
                ) : (
                  <span className={`grid h-8 w-16 shrink-0 place-items-center rounded-md bg-warm-100 ${TEXT}`}>
                    {ticked ? seq.get(c.key) : ''}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Reset … Auto Increment Sequence · Edit Sequence · Save Settings */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
          <FootBtn kind="grey" onClick={reset}>Reset</FootBtn>
          <div className="flex items-center gap-3">
            <FootBtn kind="grey" onClick={autoIncrement} disabled={tab !== 'table'}>Auto Increment Sequence</FootBtn>
            <FootBtn kind="outline" onClick={toggleEdit} disabled={tab !== 'table'}>{seqDraft ? 'Done' : 'Edit Sequence'}</FootBtn>
            <FootBtn kind="primary" onClick={save} disabled={!dirty}>Save Settings</FootBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ bits --- */

/** production's square brand checkbox (greyed when locked) */
function Tick({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
      title={disabled ? 'Always shown — it is how a pickup is found' : undefined}
      className={`grid h-4 w-4 shrink-0 place-items-center rounded border-[1.5px] transition-colors
        ${checked ? (disabled ? 'border-brand-300 bg-brand-300' : 'border-brand-500 bg-brand-500') : 'border-warm-300 bg-surface'}
        ${disabled ? 'cursor-not-allowed' : ''}`}>
      {checked && <svg viewBox="0 0 16 16" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 8.5l3 3 7-7" /></svg>}
    </button>
  )
}

function FootBtn({ kind, onClick, disabled, children }: { kind: 'grey' | 'outline' | 'primary'; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  const style = kind === 'primary' ? 'bg-brand-500 text-white hover:bg-brand-600'
    : kind === 'outline' ? 'border border-brand-500 bg-surface text-brand-500 hover:bg-brand-50'
      : 'border border-line bg-warm-100 text-ink-2 hover:bg-warm-200'
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`h-9 rounded-md px-4 text-[14px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${style}`}>
      {children}
    </button>
  )
}
