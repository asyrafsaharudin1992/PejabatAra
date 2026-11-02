import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, ArrowRight, Baby, BookOpen, Calculator, ExternalLink, FileText, HelpCircle } from 'lucide-react';
import { medicalResources } from './lib/medicalToolkit';
const PaediatricDoseCalculator = lazy(() => import('./PaediatricDoseCalculator'));

export default function MedicalToolkit() {
  const [calculator, setCalculator] = useState(false);
  if (calculator) return <div className="space-y-5"><button type="button" onClick={() => setCalculator(false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-[#0b587b] shadow-sm"><ArrowLeft size={16} />Medical Toolkit</button><Suspense fallback={<p role="status" className="p-4 text-sm text-slate-500">Opening calculator…</p>}><PaediatricDoseCalculator /></Suspense></div>;
  const card = 'group flex min-h-[155px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-sky-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b587b] sm:p-5';
  return <div className="space-y-5">
    <p className="text-sm leading-6 text-slate-600">Clinical references and a paediatric volume calculator, ready when you need them. Reference links open in a new tab.</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{medicalResources.map((resource) => {
      const Icon = resource.kind === 'calculator' ? Calculator : resource.kind === 'paediatrics' ? Baby : resource.kind === 'guide' ? HelpCircle : resource.title.includes('NAG') ? BookOpen : FileText;
      return <a key={resource.title} href={resource.href} target="_blank" rel="noopener noreferrer" className={card}><span className="mb-5 flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-[#0b587b]"><Icon size={22} /></span><ExternalLink size={16} className="text-slate-400" aria-label="Opens in a new tab" /></span><span><strong className="block text-sm leading-5 text-[#14233b]">{resource.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{resource.description}</span></span></a>;
    })}<button type="button" onClick={() => setCalculator(true)} className={card}><span className="mb-5 flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700"><Calculator size={22} /></span><ArrowRight size={17} className="text-slate-400" /></span><span><strong className="block text-sm text-[#14233b]">Paeds Calculator</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Calculate volume from an entered dose and formulation.</span></span></button></div>
  </div>;
}
