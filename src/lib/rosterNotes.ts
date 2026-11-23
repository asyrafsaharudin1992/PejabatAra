// The notes printed beside a month's roster. Staff ask for days off before they apply for leave, so "Request staff" is typed (or read from the roster PDF)
// and joined with the leave already approved in AraOffice; a person already named in the typed notes is not listed twice.
export type RosterNotes = { request: string; remarks: string };
export const noteLines = (text: string | undefined | null) => String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const first = (name: string) => name.trim().split(/\s+/).find((word) => !/^(NUR|NURUL|SITI|MOHD|MOHAMAD|MUHAMAD|AHMAD)$/i.test(word))?.toUpperCase() || name.trim().toUpperCase();
// The approved-leave names that the typed request lines do not already mention.
export const leaveNotInNotes = <T extends { name: string }>(requests: T[], notes: RosterNotes | undefined) => {
  const text = noteLines(notes?.request).join(' ').toUpperCase();
  return requests.filter((item) => !new RegExp(`(^|[^A-Z])${first(item.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z]|$)`).test(text));
};
