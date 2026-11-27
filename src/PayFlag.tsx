// The mark beside the name of a staff member whose payslip has a payslip 2 (the month worked out again): paid too much or too little.
export type PayFlagKind = 'over' | 'under' | '';
export const payFlagOf = (result?: Record<string, unknown> | null): PayFlagKind => {
  const again = result?.recalculated as { net?: number } | undefined;
  return again ? (Number(result?.net) >= Number(again.net) ? 'over' : 'under') : '';
};
export function PayFlag({ kind }: { kind?: PayFlagKind }) {
  if (!kind) return null;
  return <span title="This payslip has a payslip 2 (Pengiraan semula). Open the Preview or Salary adjustment to see the difference." className={`ml-1.5 inline-block whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-[10px] font-bold ${kind === 'over' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>⚑ {kind === 'over' ? 'Lebih bayar' : 'Kurang bayar'}</span>;
}
