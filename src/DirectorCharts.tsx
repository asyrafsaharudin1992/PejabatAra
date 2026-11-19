import { lazy, Suspense, useState } from 'react';
import { SubTabs } from './SubTabs';
import { ChartsBody } from './CeoCharts';
import { OrgChartPage } from './OrgChart';

// The Charts page of every director (CEO, COO, CPO, CHRO, CFO): the same page in each office, in four parts. Operation: time, attendance and incentives. HR: people and reviews. Procurement: what is bought and what is owed. Finance: pay, tax and the 12-month payroll cost. Organization chart: the chart of the company, side by side with them. Totals only, never one person's pay. Only HR changes the organisation chart.
const ProcurementCharts = lazy(() => import('./ProcurementCharts'));
type Part = 'operation' | 'hr' | 'procurement' | 'finance' | 'org';
export function DirectorCharts({ onError, start = 'operation', canEditOrg = false }: { onError: (message: string) => void; start?: Part; canEditOrg?: boolean }) {
  const [part, setPart] = useState<Part>(start);
  return <div className="space-y-5">
    <SubTabs label="Charts" active={part} onSelect={setPart} tabs={[{ id: 'operation', label: 'Operation' }, { id: 'hr', label: 'HR' }, { id: 'procurement', label: 'Procurement' }, { id: 'finance', label: 'Finance' }, { id: 'org', label: 'Organization chart', short: 'Org chart' }]} />
    {part === 'operation' && <ChartsBody onError={onError} source="hr" part="operation" />}
    {part === 'hr' && <ChartsBody onError={onError} source="hr" part="hr" />}
    {part === 'org' && <OrgChartPage onError={onError} source="hr" readOnly={!canEditOrg} />}
    {part === 'procurement' && <Suspense fallback={<p role="status" className="text-sm text-slate-500">Opening the Procurement charts…</p>}><ProcurementCharts onError={onError} /></Suspense>}
    {part === 'finance' && <ChartsBody onError={onError} source="hr" part="finance" />}
  </div>;
}
