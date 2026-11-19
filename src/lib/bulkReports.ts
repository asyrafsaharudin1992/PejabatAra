// Download all (Reports): while it runs, each report is drawn out of sight for one month and company. These small shared settings tell the reports which month and company to start with,
// and the reports that make their own PDF or file (Payroll Summary, bank files and so on) leave it here for the ZIP.
export const bulk = { active: false, month: '', company: '' as '' | 'KJ' | 'SK' };
export const bulkBlobs = new Map<string, Blob>();
export const bulkFiles = new Map<string, { name: string; text: string }[]>();
export const bulkYear = () => Number(bulk.month.slice(0, 4)) || new Date().getFullYear();
