// Roster codes. Infotech kept one code per job, company and time; AraOffice keeps one code per time. Rows imported from
// Infotech keep their original code, and screens show the AraOffice code unless HR asks for the original.
// MNG1, MNG2 and KJADMN are matched by their hours (8AM-5PM is AM-5, 9AM-6PM is AM-6).
export const NEW_CODE: Record<string, string> = {
  ASCL1: 'AM-9', ASCL2: 'AM-12', ASCL3: 'PM', ASCL4: 'AM-6', OD: 'OFF', RD: 'REST',
  MNG1: 'AM-5', MNG2: 'AM-6', KJADMN: 'AM-5',
  DOCRSD: 'AM', DOCRS2: 'PM', DR96: 'OH',
};
export const newCode = (code: string) => NEW_CODE[code] || code;
