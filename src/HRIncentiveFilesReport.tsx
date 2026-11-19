import { useEffect, useState } from 'react';
import { bulk, bulkFiles } from './lib/bulkReports';
import { Eye, EyeOff } from 'lucide-react';
import { card } from './AssessmentStaff';
import { officeFetch } from './lib/officeApi';
import { downloadBlob } from './lib/downloadBlob';
import { PeriodPicker, type Period } from './PeriodPicker';
import { PrintMenu } from './PrintMenu';

// Reports > Incentive Maybank Files: the allowance bank file of the month for Kajang and Seri Kembangan, each shown on the page as a table, with Print and Download beside the
// filters. Download lists the two files to choose from. The files are made on the server from the saved claims; nothing is changed here.
type Bank = { company: string; file: string; csv: string; count: number; total: number; problems: string[] };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const field = 'mt-1 block h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm';
const money = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mask = (value: string) => value.length > 4 ? `${'•'.repeat(value.length - 4)}${value.slice(-4)}` : value;
const csvRows = (text: string) => text.split(/\r?\n/).map((line) => { const cells: string[] = []; let cur = '', quoted = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (quoted) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c; } else if (c === '"') quoted = true; else if (c === ',') { cells.push(cur); cur = ''; } else cur += c; } cells.push(cur); return cells; });

export function HRIncentiveFilesReport({ onError }: { onError: (message: string) => void }) {
  const [period, setPeriod] = useState<Period | null>(null);
  const [company, setCompany] = useState<string>(bulk.active ? bulk.company : '');
  const [show, setShow] = useState(false);
  const [files, setFiles] = useState<Bank[] | null>(null);
  const [message, setMessage] = useState('');
  const month = period ? (period.to.slice(0, 7) < '2026-10' ? '2026-10' : period.to.slice(0, 7)) : '';
  useEffect(() => {
    if (!month) return;
    let live = true; setFiles(null); setMessage('');
    (async () => {
      const finance = await (await officeFetch(`/api/status?resource=hr&action=incentive_finance&month=${month}`)).json();
      if (finance.error) throw new Error(finance.error);
      const out: Bank[] = [];
      for (const place of (company ? [company] : ['KJ', 'SK'])) {
        const result = await (await officeFetch(`/api/status?resource=hr&action=incentive_bank&month=${month}&company=${place}&valueDate=${finance.paidOn}`)).json();
        if (!result.error) out.push({ company: place, ...result });
      }
      if (live) { setFiles(out); if (!out.length) setMessage(`No incentive bank file for ${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}: no approved claims yet for these options.`); }
    })().catch((cause: Error) => { if (live) { setFiles([]); onError(cause.message); } });
    return () => { live = false; };
  }, [month, company]);
  if (bulk.active && files?.length) bulkFiles.set('incentive-files', files.map((item) => ({ name: item.file, text: item.csv })));
  const items = (files || []).map((item) => ({ label: `Maybank file ${item.company} (${item.file})`, onClick: () => downloadBlob([item.csv], item.file, 'text/plain') }));
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-end gap-3 print:hidden`}>
      <div className="min-w-[200px] flex-1"><h2 className="text-lg font-semibold">Incentive Maybank Files</h2><p className="text-sm text-slate-500">The allowance bank file of the month for Finance, one for each branch, shown as a table. Open a downloaded file in Notepad and check it before you upload it.</p></div>
      <PeriodPicker onChange={setPeriod} />
      <label className="text-xs font-bold text-slate-600">Company<select aria-label="Company" value={company} onChange={(event) => setCompany(event.target.value)} className={field}><option value="">KJ and SK</option><option value="KJ">KJ · Kajang</option><option value="SK">SK · Seri Kembangan</option></select></label>
      <button type="button" onClick={() => setShow(!show)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0b587b]">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{show ? 'Hide account numbers' : 'Show account numbers'}</button>
      <PrintMenu onPrint={() => window.print()} items={items} disabled={!items.length} onError={onError} />
    </section>
    {!files ? <p className="text-sm text-slate-500">Making the files…</p> : message ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</p> :
      <div className="files-report space-y-5">{files.map((bank) => {
        const lines = csvRows(bank.csv), split = lines.findIndex((cells) => cells[0] === 'Beneficiary Name');
        const head = lines.slice(0, split).filter((cells) => cells[0]), table = lines.slice(split + 1).filter((cells) => cells[0]);
        return <section key={bank.company} className={`${card} space-y-3`}>
          <h3 className="text-base font-semibold">Incentive Maybank file <span className="text-xs font-normal text-slate-400">· {bank.company} · {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)} · {bank.file} · {bank.count} staff · RM {money(bank.total)}</span></h3>
          {bank.problems.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Check: {bank.problems.join('; ')}</p>}
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{head.map((cells) => <div key={cells[0]} className="flex gap-3"><dt className="w-52 shrink-0 text-slate-500">{cells[0].replace(/ :$/, '')}</dt><dd className="font-semibold text-slate-800">{cells[1]}</dd></div>)}</dl>
          <div className="overflow-x-auto"><table className="no-stack w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400">{lines[split]?.map((cell) => <th key={cell} className="py-2 pr-3">{cell}</th>)}</tr></thead>
            <tbody>{table.map((cells, index) => <tr key={index} className="border-t border-slate-100">{cells.map((cell, at) => <td key={at} className={`py-2 pr-3 ${at === 5 ? 'text-right font-semibold tabular-nums text-[#0b587b]' : ''}`}>{(at === 2 || at === 4) && !show ? mask(cell) : cell}</td>)}</tr>)}
              <tr className="border-t-2 border-slate-300 font-bold"><td className="py-2 pr-3" colSpan={5}>Total · {bank.count} staff</td><td className="pr-3 text-right tabular-nums text-[#0b587b]">{money(bank.total)}</td><td colSpan={2} /></tr></tbody></table></div>
        </section>;
      })}</div>}
  </div>;
}
