import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Employee } from './HRProfiles';
import { card, input } from './AssessmentStaff';
import { emptyTaxDetails } from './lib/hrTaxDetails';

const dateLabel = (date?: string | null) => date ? date.split('-').reverse().join('/') : '—';
const yesNo = (value: unknown) => typeof value === 'boolean' ? value ? 'YES' : 'NO' : '—';
const spouseStatus = (e: Employee) => e.maritalStatus === 'Married' ? e.spouseWorking === null ? 'Married' : e.spouseWorking ? 'Married — spouse working' : 'Married — spouse not working' : e.maritalStatus || '';

export function HRTaxDetails({ employee: e, onChange, reveal = false }: { employee: Employee; onChange?: (employee: Employee) => void; reveal?: boolean }) {
  const details = e.taxDetails || emptyTaxDetails();
  const payroll = e.payroll || {};
  const setPayroll = (key: string, value: string | boolean) => onChange?.({ ...e, payroll: { ...payroll, [key]: value } });
  const setDetails = (patch: Partial<typeof details>) => onChange?.({ ...e, taxDetails: { ...details, ...patch } });
  const field = (label: string, value: string, control?: ReactNode) => <div><span className="mb-1.5 block text-xs font-bold text-slate-700">{label}</span>{control || <p className="text-sm text-slate-700">{value || '—'}</p>}</div>;
  const bool = (label: string, value: unknown, change: (next: boolean) => void) => field(label, yesNo(value), onChange ? <select aria-label={label} className={input} value={typeof value === 'boolean' ? String(value) : ''} onChange={(event) => change(event.target.value === 'true')}><option value="" disabled>Choose…</option><option value="true">YES</option><option value="false">NO</option></select> : undefined);
  const children = details.childExemptions;
  const updateChildren = (next: typeof children) => setDetails({ childExemptions: next });
  return <section className={`${card} lg:col-span-2`}>
    <h3 className="font-semibold">Tax Details</h3>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {field('PCB No.', reveal || onChange ? e.taxNo : e.taxNo ? '••••' : '—', onChange ? <input aria-label="PCB No." className={input} value={e.taxNo} onChange={(event) => onChange({ ...e, taxNo: event.target.value })} /> : undefined)}
      {bool('Resident Status', payroll.taxResident, (next) => setPayroll('taxResident', next))}
      {field('Resident Type', String(payroll.taxType || ''), onChange ? <input aria-label="Resident Type" list="tax-resident-types" className={input} value={String(payroll.taxType || '')} onChange={(event) => { setPayroll('taxType', event.target.value); }} /> : undefined)}
      {bool('Tax Disable Person', details.disabled, (next) => setDetails({ disabled: next }))}
      {field('Tax Spouse Status', spouseStatus(e), onChange ? <select aria-label="Tax Spouse Status" className={input} value={e.maritalStatus === 'Married' ? e.spouseWorking === null ? 'Married' : e.spouseWorking ? 'working' : 'not-working' : e.maritalStatus} onChange={(event) => { const value = event.target.value; onChange({ ...e, maritalStatus: value === 'working' || value === 'not-working' ? 'Married' : value as Employee['maritalStatus'], spouseWorking: value === 'working' ? true : value === 'not-working' ? false : null }); }}><option value="">Choose…</option><option>Single</option><option value="Married">Married — working status not set</option><option value="working">Married — spouse working</option><option value="not-working">Married — spouse not working</option><option>Divorced</option><option>Widowed</option></select> : undefined)}
      {bool('Tax Spouse Disabled', details.spouseDisabled, (next) => setDetails({ spouseDisabled: next }))}
      {field('Employee Status', e.employmentType, onChange ? <select aria-label="Employee Status" className={input} value={e.employmentType} onChange={(event) => onChange({ ...e, employmentType: event.target.value })}>{['Permanent', 'Contract', 'Part-time', 'Locum', 'Intern', ...(!['Permanent', 'Contract', 'Part-time', 'Locum', 'Intern'].includes(e.employmentType) ? [e.employmentType] : [])].map((value) => <option key={value}>{value}</option>)}</select> : undefined)}
      {field('Date of Retirement / End of Contract', dateLabel(e.retirementDate), onChange ? <input aria-label="Date of Retirement / End of Contract" type="date" className={input} value={e.retirementDate || ''} onChange={(event) => onChange({ ...e, retirementDate: event.target.value || null })} /> : undefined)}
    </div>
    {onChange ? <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={typeof payroll.pcbApplied === 'boolean' ? payroll.pcbApplied : true} onChange={(event) => setPayroll('pcbApplied', event.target.checked)} />Apply MTD/PCB in salary</label> : <p className="mt-4 text-sm text-slate-700">Apply MTD/PCB in salary: {yesNo(typeof payroll.pcbApplied === 'boolean' ? payroll.pcbApplied : true)}</p>}
    <div className="mt-6 border-t border-slate-100 pt-4">
      <h4 className="text-sm font-semibold">Child Details for Tax Exemption</h4>
      <p className="mt-1 text-xs text-slate-500">Categories and percentages are kept for HR reference. Payroll child relief uses the children recorded under Family.</p>
      <div className="mt-3 overflow-x-auto"><table className="no-stack w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2">Category</th><th className="p-2">Percentage</th>{onChange && <th className="p-2 text-right">Delete</th>}</tr></thead><tbody>
        {!children.length && !onChange && <tr><td className="p-2">NONE</td><td className="p-2">NONE</td></tr>}
        {children.map((child, index) => <tr key={index}><td className="min-w-[240px] p-2">{onChange ? <input aria-label={`Child tax category ${index + 1}`} list="child-tax-categories" className={input} value={child.category} onChange={(event) => updateChildren(children.map((row, at) => at === index ? { ...row, category: event.target.value, ...(event.target.value.toUpperCase() === 'NONE' ? { percentage: null } : {}) } : row))} /> : child.category}</td><td className="min-w-[150px] p-2">{onChange ? <select aria-label={`Child tax percentage ${index + 1}`} className={input} value={child.percentage ?? ''} disabled={child.category.toUpperCase() === 'NONE'} onChange={(event) => updateChildren(children.map((row, at) => at === index ? { ...row, percentage: event.target.value ? Number(event.target.value) : null } : row))}><option value="">NONE</option><option value="50">50%</option><option value="100">100%</option></select> : child.percentage === null ? 'NONE' : `${child.percentage}%`}</td>{onChange && <td className="p-2 text-right"><button type="button" aria-label={`Delete child tax exemption ${index + 1}`} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" onClick={() => updateChildren(children.filter((_, at) => at !== index))}><Trash2 className="h-4 w-4" /></button></td>}</tr>)}
      </tbody></table></div>
      {onChange && <button type="button" disabled={children.length >= 20} onClick={() => updateChildren([...children, { category: 'NONE', percentage: null }])} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b587b] disabled:opacity-50"><Plus className="h-3.5 w-3.5" />Add child exemption</button>}
    </div>
    {onChange && <><datalist id="tax-resident-types"><option value="Normal Remuneration" /></datalist><datalist id="child-tax-categories"><option value="NONE" /></datalist></>}
  </section>;
}
