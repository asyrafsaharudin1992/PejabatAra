// Medical Toolkit resources carried over from locumhub-v3; other LocumHub modules stay separate.
export const medicalResources = [
  { title: 'National Antibiotic Guidelines (NAG) 2024', description: 'Clinical pathways in primary care', href: 'https://sites.google.com/moh.gov.my/nag/contents/section-c-clinical-pathways-in-primary-care?authuser=0', kind: 'guidelines' },
  { title: 'Malaysia Clinical Practice Guidelines (CPG)', description: 'Academy of Medicine Malaysia', href: 'https://www.acadmed.org.my/index.cfm?&menuid=67', kind: 'guidelines' },
  { title: 'MDCalc Medical Calculators', description: 'Clinical scores and calculators', href: 'https://www.mdcalc.com/', kind: 'calculator' },
  { title: 'PLATO Guide for Doctors', description: 'Clinic system reference guide', href: 'https://drive.google.com/file/d/1GQnsrxuF-lbyFJ5U28ZGpfjJgp5fD5Rh/view?usp=sharing', kind: 'guide' },
  { title: 'Paediatric Protocols for Malaysia Hospitals', description: 'Paediatric reference PDF', href: 'https://mpaeds.my/wp-content/uploads/2026/03/Paediatric-Protocols-for-Malaysia-Hospital-1.pdf', kind: 'paediatrics' },
] as const;

// Arithmetic only: the prescribing clinician supplies the dose per administration.
// Empty/zero/negative/non-finite inputs must never produce a plausible dose volume.
export function calculateDoseVolume(weightKg: number, strengthMg: number, formulationMl: number, doseMgPerKgPerDose: number): number | null {
  if (![weightKg, strengthMg, formulationMl, doseMgPerKgPerDose].every((value) => Number.isFinite(value) && value > 0)) return null;
  const volume = weightKg * doseMgPerKgPerDose / strengthMg * formulationMl;
  return Number.isFinite(volume) && volume > 0 ? volume : null;
}
