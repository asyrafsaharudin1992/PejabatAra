import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AREAS, LEVELS, ReviewFull, areaScore, dmy, percentLabel } from './lib/performanceReview';

// The Performance Assessment Review laid out like the paper form (two A4 pages), filled in with the
// review, for Office HR to print. Nothing shows on screen: printing hides the app and shows only
// this (see .rv-print in index.css). Safari keeps its own page margins, so each page stays inside a
// 180mm wide box and well short of 255mm tall; anything taller would spill onto a blank page.
const BANDS = [
  { value: 4, label: 'Exceeded Expectations', range: '3.50 - 4.00', color: '#92d050' },
  { value: 3, label: 'Successfully Meet Expectation', range: '3.00 - 3.49', color: '#00b0f0' },
  { value: 2, label: 'Partially Meet Expectations', range: '2.00 - 2.99', color: '#ffc000' },
  { value: 1, label: 'Did Not Meet Expectations', range: '1.00 - 1.99', color: '#ff3b30' },
] as const;
const bandOf = (score: number | null) => score === null ? 0 : score >= 3.5 ? 4 : score >= 3 ? 3 : score >= 2 ? 2 : 1;

// Adds the print mode to the page while printing, then removes it and reports back.
export function useReviewPrint(active: boolean, title: string, onDone: () => void) {
  useEffect(() => {
    if (!active) return;
    document.body.classList.add('rv-printing');
    const previous = document.title;
    document.title = title.replace(/[\\/:*?"<>|]/g, '');
    const done = () => { document.body.classList.remove('rv-printing'); document.title = previous; onDone(); };
    window.addEventListener('afterprint', done, { once: true });
    // The logo must be loaded or it would print as an empty box.
    const timer = window.setTimeout(() => { void Promise.all([...document.querySelectorAll<HTMLImageElement>('.rv-print img')].map((image) => image.decode().catch(() => undefined))).then(() => window.print()); }, 80);
    return () => { window.clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('rv-printing'); document.title = previous; };
  }, [active]);
}

// e.g. "28/10/2026 10:32", in Malaysian time.
const signedAt = (value: string) => new Date(value).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' }).replace(',', '');

const Mark = ({ on }: { on: boolean }) => <span className={`rv-mark${on ? ' rv-on' : ''}`} />;

function Lines({ text, min = 6 }: { text: string; min?: number }) {
  const lines = text.split('\n');
  return <div className="rv-lines">{lines.map((line, index) => <p key={index}>{line || ' '}</p>)}{Array.from({ length: Math.max(0, min - lines.length) }, (_, index) => <p key={`blank-${index}`}>&nbsp;</p>)}</div>;
}

export function ReviewSheet({ review }: { review: ReviewFull }) {
  const score = review.totalScore;
  const band = bandOf(score);
  const period = [review.periodStart ? `${dmy(review.periodStart)} - ${dmy(review.periodEnd)}` : '', review.periodLabel ? `(${review.periodLabel})` : ''].filter(Boolean).join(' ');
  return createPortal(<div className="rv-print">
    <section className="rv-page">
      <div className="rv-letterhead"><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" /><div><strong>HSO Healthcare Sdn Bhd</strong><span>Klinik ARA 24 Jam</span></div></div>
      <div className="rv-title">PERFORMANCE ASSESSMENT REVIEW</div>
      <div className="rv-fields">
        <p><span>Name :</span> {review.staffName}</p><p><span>Employee ID :</span> {review.employeeCode}</p>
        <p><span>Position :</span> {review.position}</p><p><span>Department :</span> {review.department}</p>
        <p><span>Immediate Superior :</span> {review.assessorName}</p><p><span>Assessment Period :</span> {period}</p>
      </div>
      <table className="rv-table">
        <colgroup><col style={{ width: '8mm' }} /><col style={{ width: '70mm' }} /><col style={{ width: '17mm' }} />{LEVELS.map((level) => <col key={level.value} style={{ width: '21.25mm' }} />)}</colgroup>
        <thead>
          <tr><th rowSpan={2} colSpan={2}>Key Results Area &amp; Assessment Criteria</th><th rowSpan={2} className="rv-w">Weightage<br />(100%)</th><th colSpan={4}>Demonstrated Results</th></tr>
          <tr>{LEVELS.map((level) => <th key={level.value} className="rv-lv" style={{ background: BANDS.find((b) => b.value === level.value)!.color, color: level.value === 1 ? '#fff' : '#000' }}>{level.label.replace(' Expectations', '')}<br />Expectations</th>)}</tr>
        </thead>
        <tbody>
          {AREAS.map((area) => area.criteria.map((criterion, index) => <tr key={`${area.key}-${index}`}>
            {index === 0 && <td rowSpan={4} className="rv-kra"><span>{area.label}</span></td>}
            <td className="rv-crit">{criterion}</td>
            {index === 0 && <td rowSpan={4} className="rv-w rv-weight">{area.weight}%</td>}
            {LEVELS.map((level) => <td key={level.value} className="rv-box"><Mark on={review.ratings[area.key]?.[index] === level.value} /></td>)}
          </tr>))}
          <tr className="rv-total"><td colSpan={2} className="rv-totalcell" /><td className="rv-w rv-black">100%</td><td colSpan={4}>Total Score: <strong>{score === null ? '' : score.toFixed(2)}</strong> &nbsp;({percentLabel(score)} of 100%)</td></tr>
        </tbody>
      </table>
      <p className="rv-areas">{AREAS.map((area) => { const value = areaScore(review.ratings, area.key); return `${area.label} ${value === null ? '-' : value.toFixed(2)} x ${area.weight}%`; }).join('   |   ')}</p>
      <table className="rv-bands"><tbody>
        <tr><th>Performance Rating</th>{BANDS.map((b) => <td key={b.value} className={band === b.value ? 'rv-hit' : ''} style={{ background: b.color, color: b.value === 1 ? '#fff' : '#000' }}>{b.label}</td>)}</tr>
        <tr><th>Assessment Scoring</th>{BANDS.map((b) => <td key={b.value} className={band === b.value ? 'rv-hit' : ''}>{b.range}</td>)}</tr>
      </tbody></table>
    </section>

    <section className="rv-page">
      <div className="rv-bar">Areas for Improvement</div><Lines text={review.improvement} />
      <div className="rv-bar">Trainings Required / Development Measures</div><Lines text={review.training} />
      <div className="rv-bar">Employee Comments / Feedback</div><Lines text={review.employeeComments} />
      <div className="rv-pip">
        <p><strong>Performance Improvement Plan (PIP)</strong> <em>(Please tick if relevant)</em></p>
        <div className="rv-pipbody">
          <div><p><span className={`rv-check${review.pip === 'required' ? ' rv-on' : ''}`} /> Required</p><p><span className={`rv-check${review.pip === 'not_required' ? ' rv-on' : ''}`} /> Not Required</p><p>Commencement Date : {review.pip === 'required' ? dmy(review.pipStart) : ''}</p></div>
          <div><p>Remarks :</p><p className="rv-remarks">{review.pip === 'required' ? review.pipRemarks : ''}</p></div>
        </div>
      </div>
      <div className="rv-sign">
        {[['Employee Signature', review.staffName, ''], ['Superior/Assessor Signature', review.assessorName, review.submittedAt ? dmy(review.submittedAt.slice(0, 10)) : ''], ['Head of Department Signature', review.hodName, '']].map(([title, name, date], index) => <div key={title}>
          {index === 1 && review.submittedAt ? <span className="rv-sigline rv-esign"><span>{name}</span><small>Digitally signed {signedAt(review.submittedAt)} · Ref {review.id.slice(0, 8).toUpperCase()}</small></span> : <span className="rv-sigline" />}
          <strong>{title}</strong><p>Name : {name}</p><p>Date : {date}</p></div>)}
      </div>
      <div className="rv-hr"><p><strong><em>For Human Resource/Admin Use</em></strong></p><p>Received on : {dmy(review.hrReceivedOn)} &nbsp;&nbsp;&nbsp; Received by : {review.hrReceivedBy}</p><p>Remarks : {review.hrRemarks}</p></div>
    </section>
  </div>, document.body);
}
