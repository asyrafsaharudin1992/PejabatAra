import { newCode } from './shiftCodes';

// Shared by the report preview, printout and Excel export, including Infotech aliases.
export const rosterColors = [
  { codes: ['AM', 'AM-9'], label: 'AM / AM-9', backgroundColor: '#DCFCE7', textColor: '#14532D' },
  { codes: ['AM-12'], label: 'AM-12', backgroundColor: '#ECFCCB', textColor: '#365314' },
  { codes: ['AM-6'], label: 'AM-6', backgroundColor: '#CCFBF1', textColor: '#134E4A' },
  { codes: ['AM-5'], label: 'AM-5', backgroundColor: '#DBEAFE', textColor: '#1E3A8A' },
  { codes: ['OH'], label: 'OH', backgroundColor: '#CFFAFE', textColor: '#164E63' },
  { codes: ['PM'], label: 'PM', backgroundColor: '#FFEDD5', textColor: '#7C2D12' },
  { codes: ['OFF'], label: 'OFF', backgroundColor: '#F1F5F9', textColor: '#475569' },
  { codes: ['REST'], label: 'REST', backgroundColor: '#E2E8F0', textColor: '#334155' },
  { codes: ['AL'], label: 'AL', backgroundColor: '#E0E7FF', textColor: '#3730A3' },
  { codes: ['MC', 'ML', 'UPL', 'EL'], label: 'MC / ML / UPL / EL', backgroundColor: '#FFE4E6', textColor: '#881337' },
  { codes: ['PH'], label: 'PH', backgroundColor: '#F3E8FF', textColor: '#581C87' },
];
export function rosterShiftColor(value: string | number) {
  const code = newCode(String(value).trim().toUpperCase().replace(/^\*+/, '').split(/[\s(]/)[0]);
  return rosterColors.find((color) => color.codes.includes(code));
}
