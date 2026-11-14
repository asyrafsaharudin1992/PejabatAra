import { useEffect, useState } from 'react';
import { BarsChart, LinesChart, COLOR, money, plain } from './CeoChartKit';
import { officeFetch } from './lib/officeApi';

// The CPO's charts: what was bought each month, who we buy from, what is owed and for how long, what the stock is worth, what sells, and what expires soon.
// Kajang (blue) and Seri Kembangan (orange) keep their colours. Read once when the tab opens.
type Split = Record<'KJ' | 'SK', number[]>;
type Data = {
  asOf: string | null; months: string[]; spendByMonth: Split;
  topSuppliers: { name: string; KJ: number; SK: number }[];
  owedByAge: { labels: string[] } & Split;
  stockByType: { name: string; KJ: number; SK: number }[];
  quarterSales: { labels: string[]; KJ: { revenue: number[]; cost: number[] }; SK: { revenue: number[]; cost: number[] } };
  expiring: { labels: string[] } & Split;
};
const NAMES = { KJ: 'Kajang (KJ)', SK: 'Seri Kembangan (SK)' };
const monthName = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const short = (name: string) => { const clean = name.replace(/\b(SDN\.?|BHD\.?|BERHAD|\(M\)|\(MALAYSIA\))\b/gi, '').replace(/\s+/g, ' ').trim(); return clean.length > 14 ? `${clean.slice(0, 13)}…` : clean; };
const margin = (revenue: number, cost: number) => revenue > 0 ? Math.round((revenue - cost) / revenue * 1000) / 10 : null;

export default function ProcurementCharts({ onError }: { onError: (message: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { officeFetch('/api/status?resource=procurement&action=charts').then((response) => response.json()).then((result) => { if (result.error) throw new Error(result.error); setData(result); }).catch((cause: Error) => onError(cause.message)); }, []);
  if (!data) return <p role="status" className="rounded-xl bg-white p-4 text-sm text-slate-500">Loading the charts…</p>;
  const two = (kj: number[], sk: number[]) => [{ name: NAMES.KJ, color: COLOR.KJ, values: kj }, { name: NAMES.SK, color: COLOR.SK, values: sk }];
  const q = data.quarterSales;
  return <div className="space-y-5">
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <BarsChart title="Bought each month" note="Permanent supplier orders, by clinic." categories={data.months.map(monthName)} series={two(data.spendByMonth.KJ, data.spendByMonth.SK)} format={money} firstColumn="Month" empty="No orders yet." />
      <BarsChart title="Who we buy from" note="The 8 biggest suppliers this year, by what we bought." categories={data.topSuppliers.map((row) => short(row.name))} series={two(data.topSuppliers.map((row) => row.KJ), data.topSuppliers.map((row) => row.SK))} stacked format={money} firstColumn="Supplier" empty="No orders yet." />
      <BarsChart title="What is owed, and for how long" note="Not marked paid in Plato, by the age of the invoice. Old ones are often paid but not marked, so please check them." categories={data.owedByAge.labels} series={two(data.owedByAge.KJ, data.owedByAge.SK)} format={money} firstColumn="Age" empty="Nothing owed." />
      <BarsChart title="What the stock is worth" note={`At cost, by type of item${data.asOf ? `, as of ${data.asOf.slice(8, 10)}/${data.asOf.slice(5, 7)}/${data.asOf.slice(2, 4)}` : ''}.`} categories={data.stockByType.map((row) => row.name)} series={two(data.stockByType.map((row) => row.KJ), data.stockByType.map((row) => row.SK))} stacked format={money} firstColumn="Type" empty="No stock." />
      <BarsChart title="Sales by quarter" note="From the Plato product sales report. The last quarter runs to 14 November." categories={q.labels} series={two(q.KJ.revenue, q.SK.revenue)} format={money} firstColumn="Quarter" empty="No sales yet." />
      <LinesChart title="Margin by quarter" note="Sales less cost, as a share of sales (%)." categories={q.labels} series={[{ name: NAMES.KJ, color: COLOR.KJ, values: q.labels.map((_, i) => margin(q.KJ.revenue[i], q.KJ.cost[i])) }, { name: NAMES.SK, color: COLOR.SK, values: q.labels.map((_, i) => margin(q.SK.revenue[i], q.SK.cost[i])) }]} format={(value) => `${plain(value)}%`} firstColumn="Quarter" empty="No sales yet." />
      <BarsChart title="Items about to expire" note="Number of stocked items whose earliest batch expires that month, next 6 months." categories={data.expiring.labels} series={two(data.expiring.KJ, data.expiring.SK)} format={plain} firstColumn="Month" empty="Nothing about to expire." />
    </div>
  </div>;
}
