import { useState } from 'react';
import { AlertTriangle, Calculator, RotateCcw } from 'lucide-react';
import { calculateDoseVolume } from './lib/medicalToolkit';
const empty = { weight: '', strength: '', volume: '', dose: '' };
export default function PaediatricDoseCalculator() {
  const [values, setValues] = useState(empty);
  const result = calculateDoseVolume(Number(values.weight), Number(values.strength), Number(values.volume), Number(values.dose));
  const fields: { key: keyof typeof empty; label: string; unit: string }[] = [
    { key: 'weight', label: 'Patient weight', unit: 'kg' }, { key: 'strength', label: 'Formulation strength', unit: 'mg' },
    { key: 'volume', label: 'In volume', unit: 'mL' }, { key: 'dose', label: 'Prescribed dose per administration', unit: 'mg/kg/dose' },
  ];
  return <section className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="paeds-calculator-title">
    <header className="flex items-center justify-between gap-3 bg-[#0b3d59] p-5 text-white"><div className="flex items-center gap-3"><Calculator size={24} className="shrink-0 text-sky-200" /><div><h2 id="paeds-calculator-title" className="text-lg font-semibold">Paediatric Volume Calculator</h2><p className="mt-1 text-xs text-sky-200">Using the dose and formulation you enter</p></div></div><button type="button" onClick={() => setValues({ ...empty })} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold hover:bg-white/10"><RotateCcw size={15} />Reset</button></header>
    <div className="space-y-5 p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2">{fields.map(({ key, label, unit }) => <label key={key} className="block text-sm font-semibold text-slate-700">{label}<span className="mt-1 block text-xs font-normal text-slate-500">{unit}</span><input type="number" inputMode="decimal" min="0" step="any" value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-base font-normal text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" placeholder="Enter value" /></label>)}</div>
      <div role="status" aria-live="polite" className="rounded-xl border border-sky-100 bg-sky-50 p-5 text-center"><p className="text-xs font-semibold uppercase tracking-wide text-[#0b587b]">Calculated volume per dose</p>{result === null ? <p className="mt-3 text-sm text-slate-600">Enter a positive value in all four fields.</p> : <><p className="mt-2 break-all text-4xl font-bold text-[#0b3d59]">{result.toLocaleString('en-GB', { maximumSignificantDigits: 4 })}<span className="ml-2 text-lg">mL</span></p><p className="mt-2 text-xs text-slate-600">Weight × dose × formulation volume ÷ strength. Display rounded to 4 significant figures.</p></>}</div>
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><p className="text-xs leading-5">Enter the prescribed <strong>mg/kg per dose</strong>, rather than mg/kg per day. Verify the medication, dosing interval, maximum dose and formulation against the relevant clinical reference before prescribing. This calculator performs arithmetic and does not select a drug or dose.</p></div>
    </div>
  </section>;
}
