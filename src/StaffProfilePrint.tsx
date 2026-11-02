import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Employee, CareerEntry } from './HRProfiles';

export function useStaffProfilePrint(active: boolean, title: string, onDone: () => void) {
  useEffect(() => {
    if (!active) return;
    const previous = document.title;
    document.title = title.replace(/[\\/:*?"<>|]/g, '');
    document.body.classList.add('staff-profile-printing');
    const done = () => { document.body.classList.remove('staff-profile-printing'); document.title = previous; onDone(); };
    window.addEventListener('afterprint', done, { once: true });
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void Promise.all([document.fonts.ready, ...Array.from(document.querySelectorAll<HTMLImageElement>('.staff-profile-print img'), (image) => image.decode())]).then(() => { if (!cancelled) window.print(); }).catch(() => { if (!cancelled) { window.alert('The report logo could not be loaded. Please try printing again.'); done(); } });
    }, 80);
    return () => { cancelled = true; window.clearTimeout(timer); window.removeEventListener('afterprint', done); document.body.classList.remove('staff-profile-printing'); document.title = previous; };
  }, [active]);
}

const dmy = (value: string | null) => value ? value.split('-').reverse().join('/') : '—';
const money = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`;

// A separate print document keeps office navigation and editable controls off the page.
// Private fields follow the same reveal state as the profile on screen.
type ProfilePrintProps = { employee: Employee; reveal: boolean; career: CareerEntry[] };

export function StaffProfilePrint(props: ProfilePrintProps) {
  return createPortal(<StaffProfileDocument {...props} />, document.body);
}

export function StaffProfileDocument({ employee: e, reveal, career }: ProfilePrintProps) {
  const secret = (value: string | number | null) => !value ? '—' : reveal ? String(value) : '••••';
  const row = (label: string, value: ReactNode) => <div className="sp-row" key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>;
  const section = (title: string, rows: [string, ReactNode][]) => <section className="sp-section"><h3>{title}</h3><dl>{rows.map(([label, value]) => row(label, value))}</dl></section>;
  const heading = (continuation = false) => <header><img src="/ara-logo.png" alt="Klinik ARA 24 Jam" /><div><p>KLINIK ARA 24 JAM · HUMAN RESOURCES</p><h1>Staff Profile{continuation ? ' · continued' : ''}</h1><h2>{e.fullName}</h2><p>{e.company} · {e.employeeCode} · {e.status}</p><small>Printed {new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })} · Private details {reveal ? 'included' : 'hidden'}</small></div></header>;
  return <article className="staff-profile-print">
    <div className="sp-page">{heading()}
    {section('Personal & contact', [
      ['IC no.', secret(e.icNo)], ['Passport no.', secret(e.passportNo)], ['Foreign ID no.', secret(e.foreignIdNo)],
      ['Nationality', e.nationality], ['Gender', e.gender], ['Date of birth', dmy(e.dateOfBirth)], ['Religion', e.religion], ['Race', e.race],
      ['Phone', secret(e.phone)], ['Email', secret(e.email)], ['Address', e.address],
    ])}
    {section('Employment', [
      ['Company', e.company], ['Branch', e.branch], ['Department', e.department], ['Designation', e.designation], ['Employment type', e.employmentType],
      ['Joined', dmy(e.joinDate)], ['Confirmed', dmy(e.confirmDate)], ['Left', dmy(e.resignDate)], ['Leave group', e.leaveGroup],
    ])}
    {section('Pay & statutory', [
      ['Basic salary', reveal ? money(e.basicSalary) : '••••'], ['Fixed allowances', reveal ? e.fixedAllowances.map((item) => `${item.name}: ${money(item.amount)}`).join('; ') || 'None' : '••••'],
      ['Bank', e.bankName], ['Account no.', secret(e.bankAccount)], ['KWSP no.', secret(e.epfNo)], ['PERKESO no.', secret(e.socsoNo)], ['Income tax no.', secret(e.taxNo)],
    ])}
    </div>
    <div className="sp-page">{heading(true)}
    {section('Family & emergency', [
      ['Marital status', e.maritalStatus], ['Spouse', e.spouseName], ['Spouse IC no.', secret(e.spouseIc)], ['Spouse occupation', e.spouseEmployer], ['Spouse phone', secret(e.spousePhone)],
      ['Spouse working', e.spouseWorking === null ? '—' : e.spouseWorking ? 'Yes' : 'No'],
      ['Children', e.children.map((child) => `${child.name}${child.dateOfBirth ? ` (${dmy(child.dateOfBirth)})` : ''}${child.studying ? ', studying' : ''}${child.disabled ? ', OKU' : ''}`).join('; ') || 'None'],
      ['Emergency contact', [e.emergencyName, e.emergencyRelation, secret(e.emergencyPhone)].filter(Boolean).join(' · ')],
    ])}
    {section('Education', e.education.length ? e.education.map((item, index) => [`Education ${index + 1}`, [item.level, item.course, item.institution, item.year].filter(Boolean).join(' · ')]) : [['Education', '—']])}
    {section('Employment history', career.length ? career.map((entry, index) => {
      const isPay = /increment|salary|hourly|bonus/i.test(`${entry.kind} ${entry.detail}`);
      const value = (text: string) => text && isPay && !reveal ? '••••' : text;
      const change = entry.from && entry.to && entry.to !== '0.00' ? `${value(entry.from)} → ${value(entry.to)}` : value(entry.to || entry.from);
      return [`${dmy(entry.date)} · ${entry.kind} (${index + 1})`, [entry.detail, change, entry.amount ? reveal ? money(entry.amount) : '••••' : ''].filter(Boolean).join(' · ')];
    }) : [['History', 'No history recorded.']])}
    {e.remarks && section('Remarks', [['Remarks', e.remarks]])}
    </div>
  </article>;
}
