export const INDIVIDUAL_PREVIEW_KEY = 'ara_individual_view_as';
export const PREVIEW_ROLES = ['Staff', 'Doctor', 'Supervisor', 'Admin', 'CHRO', 'COO', 'CEO'] as const;
export function readIndividualPreview() {
  try {
    const role = localStorage.getItem(INDIVIDUAL_PREVIEW_KEY) || '';
    return PREVIEW_ROLES.some((item) => item === role) ? role : '';
  } catch { return ''; }
}
export function clearIndividualPreview() {
  try { localStorage.removeItem(INDIVIDUAL_PREVIEW_KEY); } catch { /* optional layout preference */ }
}
