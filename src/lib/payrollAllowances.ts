// The allowance types in use, taken from Infotech. Infotech lists 17 types, but only Director Fee is paid to anyone, so only it
// is kept. The flags say how an allowance is treated in the pay run: whether it counts towards KWSP, PERKESO, EIS, HRDF and
// PCB, and whether it is cut for unpaid leave. Add a type here when one is first paid to someone.
export type AllowanceType = { name: string; infotechCode: string; kwsp: boolean; perkeso: boolean; eis: boolean; hrdf: boolean; pcb: boolean; cutForUnpaidLeave: boolean };

export const ALLOWANCE_TYPES: AllowanceType[] = [
  { name: 'Director Fee', infotechCode: 'DIREC3', kwsp: false, perkeso: false, eis: false, hrdf: false, pcb: true, cutForUnpaidLeave: false },
  // Variable types, entered each month under "Other add". Infotech's flags (Master > Allowances Setup, checked 2 Nov 2026): none counts
  // towards PERKESO, EIS, HRDF or PCB, none is pro-rated, and only Allowance Care Coordinator has EPF type Ordinary.
  { name: 'Allowance Care Coordinator', infotechCode: 'ECC', kwsp: true, perkeso: false, eis: false, hrdf: false, pcb: false, cutForUnpaidLeave: false },
  { name: 'Annual Leave Payment', infotechCode: 'ALPAY', kwsp: false, perkeso: false, eis: false, hrdf: false, pcb: false, cutForUnpaidLeave: false },
  { name: 'Advance', infotechCode: 'AVC', kwsp: false, perkeso: false, eis: false, hrdf: false, pcb: false, cutForUnpaidLeave: false },
  { name: 'Incentives', infotechCode: 'ICT', kwsp: false, perkeso: false, eis: false, hrdf: false, pcb: false, cutForUnpaidLeave: false },
  { name: 'Tuntutan Ganti Notis', infotechCode: 'TGN', kwsp: false, perkeso: false, eis: false, hrdf: false, pcb: false, cutForUnpaidLeave: false },
];

export const allowanceType = (name: string) => ALLOWANCE_TYPES.find((item) => item.name.toLowerCase() === String(name || '').trim().toLowerCase());
