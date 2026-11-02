// Reference Hub's department metadata determines HR ownership, rather than words in a title.
// Joint memos are included only when one of their explicit department labels is HR.
export function isHrReference(resource: { category?: unknown }): boolean {
  if (typeof resource.category !== 'string') return false;
  return resource.category.split(/[/,&;+]/).some((department) => ['sumber manusia', 'hr', 'human resources', 'human resource', 'human resources (hr)'].includes(department.trim().replace(/\s+/g, ' ').toLowerCase()));
}
