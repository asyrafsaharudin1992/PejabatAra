// The roster for January to October 2026 was rebuilt from earlier records when AraOffice replaced Infotech.
export const ROSTER_NOTICE = 'The roster data for January to October 2026 was taken from previous records during the migration (Infotech clock in/out, leave records, the monthly schedules and staff WhatsApp updates). A few days may not match what actually happened. Please tell HR if you spot a mistake.';
export const showsRosterNotice = (month: string) => month >= '2026-01' && month <= '2026-10';
