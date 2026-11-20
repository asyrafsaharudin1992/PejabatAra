export type TaxDetails = {
  disabled: boolean | null;
  spouseDisabled: boolean | null;
  childExemptions: { category: string; percentage: number | null }[];
};

export const emptyTaxDetails = (): TaxDetails => ({ disabled: null, spouseDisabled: null, childExemptions: [] });

// Only profile metadata is stored here; existing PCB flags keep their existing payroll keys.
export function validateTaxProfile(value: unknown): TaxDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid tax details.');
  const data = value as Record<string, unknown>;
  const flag = (key: string) => {
    if (data[key] == null) return null;
    if (typeof data[key] !== 'boolean') throw new Error('Choose Yes or No for tax disability status.');
    return data[key] as boolean;
  };
  if (!Array.isArray(data.childExemptions) || data.childExemptions.length > 20) throw new Error('Enter up to 20 child tax exemption rows.');
  const childExemptions = data.childExemptions.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid child tax exemption row.');
    const row = item as Record<string, unknown>;
    const category = typeof row.category === 'string' ? row.category.trim() : '';
    if (!category || category.length > 160) throw new Error('Enter a child tax exemption category.');
    const percentage = row.percentage;
    if (percentage !== null && percentage !== 50 && percentage !== 100) throw new Error('Choose None, 50% or 100% for the child tax exemption percentage.');
    if (category.toUpperCase() === 'NONE' && percentage !== null) throw new Error('Choose a category before setting a child tax exemption percentage.');
    if (category.toUpperCase() !== 'NONE' && percentage === null) throw new Error('Choose the child tax exemption percentage.');
    return { category, percentage: percentage as number | null };
  });
  return { disabled: flag('disabled'), spouseDisabled: flag('spouseDisabled'), childExemptions };
}

export function taxPayrollPatch(payroll: unknown): Record<string, string | boolean> {
  if (!payroll || typeof payroll !== 'object' || Array.isArray(payroll)) throw new Error('Invalid tax payroll settings.');
  const value = payroll as Record<string, unknown>;
  const patch: Record<string, string | boolean> = {};
  for (const key of ['taxResident', 'pcbApplied']) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') throw new Error('Choose Yes or No for tax residency and PCB.');
      patch[key] = value[key] as boolean;
    }
  }
  if (value.taxType !== undefined) {
    if (typeof value.taxType !== 'string' || value.taxType.length > 80) throw new Error('Enter a valid resident type.');
    patch.taxType = value.taxType.trim();
  }
  return patch;
}
