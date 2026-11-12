import { createContext } from 'react';

// The other offices an account may enter, and the way back, for offices that show them in their own sidebar
// instead of the floating buttons at the bottom of the page.
export type OfficeShortcutList = { offices: { id: string; short: string }[]; back: { href: string; label: string } };
export const OfficeShortcuts = createContext<OfficeShortcutList | null>(null);
