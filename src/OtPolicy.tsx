// The company's OT rules, shown on the OT request page and in HR's OT tab.
// Sources: memo HSO/MEMO/SM/2026/0011 (5 Aug 2026) and the letter HSOMEMOSM2026011/HR-NOV (10 Nov 2026, the later one: Normal Day and Off Day are separate, and 1 hour of rest is not counted). Employment Act 1955.
const cell = 'border border-slate-300 p-1 sm:p-2';
// The policy text on its own (HR's OT tab opens it from a button beside the filters).
export function OtPolicyBody() {
  return <>
      <p><b className="text-slate-800">Counting:</b> OT is counted in whole hours, rounded down (for example 3 h 40 m counts as 3 h). The minimum is 1 hour. OT is extra pay, on top of the monthly salary.</p>

      <div className="overflow-hidden rounded-xl border border-slate-300">
        <table className="w-full table-fixed border-collapse text-center text-[10px] leading-tight sm:text-xs">
          <thead><tr><th className={`${cell} bg-amber-400 text-slate-900`}>Hours of work</th><th className={`${cell} bg-green-200 text-slate-900`}>Normal Day</th><th className={`${cell} bg-green-300 text-slate-900`}>Off Day</th></tr></thead>
          <tbody className="text-slate-700">
            <tr><td className={`${cell} font-semibold`}>Complete shift</td><td className={cell}>Normal rate</td><td rowSpan={2} className={`${cell} font-semibold`}>1.5 x HRP per hour</td></tr>
            <tr><td className={`${cell} font-semibold`}>After complete shift</td><td className={`${cell} font-semibold`}>1.5 x HRP per hour</td></tr>
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-300">
        <table className="w-full table-fixed border-collapse text-center text-[10px] leading-tight sm:text-xs">
          <thead><tr><th className={`${cell} bg-amber-400 text-slate-900`}>Hours of work</th><th className={`${cell} bg-sky-300 text-slate-900`}>Rest Day</th><th className={`${cell} bg-orange-300 text-slate-900`}>Public Holiday</th></tr></thead>
          <tbody className="text-slate-700">
            <tr><td className={`${cell} font-semibold`}>First 4 hours</td><td className={cell}>0.5 x ORP</td><td rowSpan={2} className={`${cell} font-semibold`}>2 x ORP</td></tr>
            <tr><td className={`${cell} font-semibold`}>Next 4 hours</td><td className={cell}>1 x ORP</td></tr>
            <tr><td className={`${cell} font-semibold`}>After 8 hours</td><td className={`${cell} font-semibold`}>2 x HRP per hour</td><td className={`${cell} font-semibold`}>3 x HRP per hour</td></tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl bg-slate-50 p-3 text-xs">
        <p><b className="text-slate-800">ORP</b> (Ordinary Rate of Pay) = 1 day salary = 1 month salary ÷ 26.</p>
        <p className="mt-1"><b className="text-slate-800">HRP</b> (Hourly Rate of Pay) = ORP ÷ 8.</p>
        <p className="mt-1">Rest Day and Public Holiday up to 8 hours are paid as a fixed amount for the day, not by the hour: for example up to 4 hours on a Rest Day is 0.5 x ORP, and any time up to 8 hours on a Public Holiday is 2 x ORP.</p>
        <p className="mt-1"><b className="text-slate-800">Rest Day</b> is the last day off of the week, once a week. Other days off are Off Days.</p>
      </div>

      <div>
        <p className="font-semibold text-slate-800">1 hour of rest is not counted</p>
        <p className="mt-1">For working hours and OT, the 1 hour rest is not counted as work if you are free to use that time and are not asked to do any work. This applies on a Normal Day, Off Day, Rest Day and Public Holiday, so a long OT of more than 5 hours has 1 hour taken off (for example 12 hours counts as 11 hours). If you are told to work, or are not free to use that time, it is judged under the law.</p>
      </div>

      <div>
        <p className="font-semibold text-slate-800">What staff must do</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs"><li>Clock in and out accurately.</li><li>Take the rest time the company sets.</li><li>Claim OT based on the records and the rules above.</li><li>Ask HR if something does not match.</li></ol>
      </div>

      <p>This applies to permanent, full-time staff earning RM4,000 and below, under the Employment Act 1955. Rates in an older offer letter or handbook that differ from this no longer apply.</p>
      <p className="text-xs text-slate-400">Memo HSO/MEMO/SM/2026/0011, 5 August 2026, and letter HSOMEMOSM2026011/HR-NOV, 10 November 2026, Human Resources.</p>
  </>;
}

export function OtPolicy({ className }: { className: string }) {
  return <details className={className}>
    <summary className="cursor-pointer font-semibold">OT policy <span className="text-xs font-normal text-slate-400">· how OT is counted and paid</span></summary>
    <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600"><OtPolicyBody /></div>
  </details>;
}
