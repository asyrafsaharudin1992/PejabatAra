import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleMinus,
  ClipboardCheck,
  Clock3,
  FlaskConical,
  History,
  Package,
  Pill,
  Plus,
  Printer,
  ShieldCheck,
  Send,
  Sparkles,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { cn } from "./lib/utils";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { PortalUser } from "./portalData";

type ShiftType = "AM" | "PM";
type ItemStatus = "pending" | "done" | "not_required";

interface ChecklistItem {
  id: string;
  title: string;
  detail?: string;
  status: ItemStatus;
}

interface ChecklistSection {
  id: string;
  title: string;
  icon: "medicine" | "stock" | "cleaning" | "finance" | "print" | "lab" | "panel" | "team";
  items: ChecklistItem[];
}

interface ShiftHandover {
  id: string;
  shift: ShiftType;
  date: string;
  day: string;
  time: string;
  staff: string[];
  issue: string;
  passoverTasks: ChecklistItem[];
  sections: ChecklistSection[];
  workflow?: "in_progress" | "handed_over" | "received";
  updatedBy?: string;
  updatedAt?: string;
}

interface AuditEvent {
  id: string;
  shift: ShiftType;
  actor: string;
  action: string;
  detail: string;
  time: string;
}

const seedHandovers: ShiftHandover[] = [
  {
    id: "shift-am-demo",
    shift: "AM",
    date: "28 September 2026",
    day: "Monday",
    time: "9:00 AM – 9:00 PM",
    staff: ["Dhiya", "Nina"],
    issue: "No critical issues reported.",
    passoverTasks: [
      { id: "am-p1", title: "Influenza vaccine booking", detail: "Patient B. · ID •••• 6113 · Paid, arriving this week.", status: "pending" },
      { id: "am-p2", title: "Outstation medicine claim", detail: "Patient H. · ID •••• 5865 · Medicine not collected yet.", status: "pending" },
      { id: "am-p3", title: "Medical report — payment follow-up", detail: "Patient N. · ID •••• 0600 · Email report after payment is received.", status: "pending" },
      { id: "am-p4", title: "Panel cancellation review", detail: "Patient A. · ID •••• 5087 · Check email before proceeding with claim.", status: "pending" },
    ],
    sections: [
      { id: "am-med", title: "Medicine", icon: "medicine", items: [
        { id: "am-med-1", title: "Count low-stock / out-of-stock medicine", status: "not_required" },
        { id: "am-med-2", title: "Repack relevant medicine", status: "not_required" },
      ]},
      { id: "am-stock", title: "Clinic supplies", icon: "stock", items: [
        { id: "am-stock-1", title: "Inform admin of items to purchase", detail: "Dengue combo test", status: "done" },
      ]},
      { id: "am-clean", title: "Clinic cleanliness", icon: "cleaning", items: [
        { id: "am-clean-1", title: "Dispose of rubbish", status: "done" },
        { id: "am-clean-2", title: "Ensure the toilet is clean", status: "done" },
        { id: "am-clean-3", title: "Sterilise used equipment", status: "done" },
        { id: "am-clean-4", title: "Sanitise clinic & playground", detail: "Nanospray + hydrogen peroxide", status: "done" },
      ]},
      { id: "am-finance", title: "Finance", icon: "finance", items: [
        { id: "am-fin-1", title: "Review shift cash vouchers", detail: "2 payment records entered.", status: "done" },
      ]},
      { id: "am-lab", title: "Laboratory", icon: "lab", items: [
        { id: "am-lab-1", title: "Label samples & complete lab forms", status: "not_required" },
        { id: "am-lab-2", title: "Update patient on results", status: "not_required" },
        { id: "am-lab-3", title: "Update result / sample in the group", status: "done" },
        { id: "am-lab-4", title: "Update result in Plato", status: "pending" },
      ]},
      { id: "am-panel", title: "Panel Checking", icon: "panel", items: [
        { id: "am-panel-1", title: "Double-check all panel submissions", status: "done" },
      ]},
      { id: "am-team", title: "TeamARA Checking", icon: "team", items: [
        { id: "am-team-1", title: "Review subscription & photos in Plato", status: "done" },
        { id: "am-team-2", title: "Generate outstanding TeamARA cards", status: "not_required" },
      ]},
    ],
  },
  {
    id: "shift-pm-demo",
    shift: "PM",
    date: "28 September 2026",
    day: "Monday",
    time: "9:00 PM – 9:00 AM",
    staff: ["Najwa", "Amy"],
    issue: "No critical issues reported.",
    passoverTasks: [
      { id: "pm-p1", title: "Influenza vaccine booking", detail: "Patient B. · ID •••• 6113 · Paid, arriving this week.", status: "pending" },
      { id: "pm-p2", title: "Claim after medicine collection", detail: "Patient H. · ID •••• 5865 · Outstation patient.", status: "pending" },
      { id: "pm-p3", title: "Medical report — payment follow-up", detail: "Patient N. · ID •••• 0600 · Send report after payment.", status: "pending" },
      { id: "pm-p4", title: "Heart screening package", detail: "Patient A. · ID •••• 5659 · Arriving at 8 AM for blood collection.", status: "pending" },
      { id: "pm-p5", title: "Follow up ECG & X-ray result", detail: "Patient F. · ID •••• 5243 · Full payment received.", status: "pending" },
    ],
    sections: [
      { id: "pm-med", title: "Medicine", icon: "medicine", items: [
        { id: "pm-med-1", title: "Count low-stock / out-of-stock medicine", status: "done" },
        { id: "pm-med-2", title: "Repack medicine", detail: "Paracetamol", status: "pending" },
      ]},
      { id: "pm-stock", title: "Clinic supplies", icon: "stock", items: [
        { id: "pm-stock-1", title: "Inform admin of items to purchase", detail: "Combo test — 18 units remaining", status: "done" },
      ]},
      { id: "pm-clean", title: "Clinic cleanliness", icon: "cleaning", items: [
        { id: "pm-clean-1", title: "Sweep & mop floors", status: "done" },
        { id: "pm-clean-2", title: "Clean the toilet", status: "done" },
        { id: "pm-clean-3", title: "Sterilise used equipment", status: "done" },
        { id: "pm-clean-4", title: "Sanitise clinic & playground", status: "done" },
      ]},
      { id: "pm-finance", title: "Finance", icon: "finance", items: [
        { id: "pm-fin-1", title: "Review shift cash vouchers", detail: "2 payment records approved.", status: "done" },
        { id: "pm-fin-2", title: "Open a CV when using petty cash", status: "done" },
      ]},
      { id: "pm-print", title: "Documents & printing", icon: "print", items: [
        { id: "pm-print-1", title: "Print clinic address labels", status: "not_required" },
        { id: "pm-print-2", title: "Print notification forms", status: "not_required" },
        { id: "pm-print-3", title: "Print appointment cards", status: "not_required" },
        { id: "pm-print-4", title: "Print CV forms & sales template", status: "not_required" },
      ]},
      { id: "pm-panel", title: "Panel Checking", icon: "panel", items: [
        { id: "pm-panel-1", title: "Double-check all panel submissions", status: "done" },
      ]},
    ],
  },
];

const sectionIcons = {
  medicine: Pill,
  stock: Package,
  cleaning: Sparkles,
  finance: WalletCards,
  print: Printer,
  lab: FlaskConical,
  panel: ShieldCheck,
  team: UsersRound,
};

const statusOrder: ItemStatus[] = ["pending", "done", "not_required"];

function loadHandovers(): ShiftHandover[] {
  try {
    const saved = localStorage.getItem("ara_shift_handovers");
    return saved ? JSON.parse(saved) : seedHandovers;
  } catch {
    return seedHandovers;
  }
}

function loadAudit(): AuditEvent[] {
  try {
    const saved = localStorage.getItem("ara_shift_audit");
    return saved ? JSON.parse(saved) : [
      { id: "audit-seed-1", shift: "PM", actor: "Najwa", action: "Shift started", detail: "PM Shift · Kajang Clinic", time: "9:02 PM" },
      { id: "audit-seed-2", shift: "PM", actor: "Amy", action: "Checklist updated", detail: "Clinic cleanliness · Sanitise clinic", time: "10:14 PM" },
      { id: "audit-seed-3", shift: "AM", actor: "Nina", action: "Passover received", detail: "4 items require action", time: "9:06 AM" },
    ];
  } catch {
    return [];
  }
}

export default function ShiftHandoverView({ user }: { user: PortalUser }) {
  const [handovers, setHandovers] = useState<ShiftHandover[]>(loadHandovers);
  const [audit, setAudit] = useState<AuditEvent[]>(loadAudit);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"local" | "syncing" | "synced" | "error">("local");
  const [selectedShift, setSelectedShift] = useState<ShiftType>("PM");
  const [addingTask, setAddingTask] = useState(false);
  const [addingSectionId, setAddingSectionId] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDetail, setTaskDetail] = useState("");
  const [shiftDate, setShiftDate] = useState("");
  const [shiftDay, setShiftDay] = useState("");
  const [shiftTime, setShiftTime] = useState("");
  const [shiftStaff, setShiftStaff] = useState("");
  const [shiftIssue, setShiftIssue] = useState("");
  const [confirmingHandover, setConfirmingHandover] = useState(false);

  useEffect(() => {
    if (!supabase || !user.id || user.id.startsWith("demo")) return;
    let active = true;

    const loadRemoteState = async () => {
      setSyncStatus("syncing");
      const { data: memberships, error: membershipError } = await supabase
        .from("staff_branches")
        .select("branch_id, is_primary")
        .eq("profile_id", user.id)
        .order("is_primary", { ascending: false })
        .limit(1);

      const selectedBranchId = memberships?.[0]?.branch_id;
      if (!active) return;
      if (membershipError || !selectedBranchId) {
        setSyncStatus("error");
        return;
      }

      setBranchId(selectedBranchId);
      const { data, error } = await supabase
        .from("portal_state")
        .select("payload")
        .eq("branch_id", selectedBranchId)
        .eq("state_key", "shift_handovers")
        .maybeSingle();

      if (!active) return;
      if (error) {
        setSyncStatus("error");
        return;
      }
      if (Array.isArray(data?.payload)) {
        setHandovers(data.payload as ShiftHandover[]);
        localStorage.setItem("ara_shift_handovers", JSON.stringify(data.payload));
      }
      setSyncStatus("synced");
    };

    void loadRemoteState();
    return () => { active = false; };
  }, [user.id]);

  const handover = handovers.find((item) => item.shift === selectedShift) || handovers[0];
  const allItems = useMemo(() => [handover.passoverTasks, ...handover.sections.map((section) => section.items)].flat(), [handover]);
  const counts = {
    pending: allItems.filter((item) => item.status === "pending").length,
    done: allItems.filter((item) => item.status === "done").length,
    not_required: allItems.filter((item) => item.status === "not_required").length,
  };
  const workflow = handover.workflow || "in_progress";

  const recordActivity = (action: string, detail: string) => {
    const now = new Date();
    const next = [{
      id: `audit-${Date.now()}`,
      shift: selectedShift,
      actor: user.fullName,
      action,
      detail,
      time: now.toLocaleTimeString("ms-MY", { hour: "numeric", minute: "2-digit" }),
    }, ...audit].slice(0, 20);
    setAudit(next);
    localStorage.setItem("ara_shift_audit", JSON.stringify(next));
    if (supabase && branchId && user.id && !user.id.startsWith("demo")) {
      void supabase.from("audit_events").insert({
        branch_id: branchId,
        actor_id: user.id,
        entity_type: "shift_handover",
        action,
        detail: { shift: selectedShift, summary: detail },
      });
    }
  };

  const save = (next: ShiftHandover[], action?: string, detail?: string) => {
    setHandovers(next);
    localStorage.setItem("ara_shift_handovers", JSON.stringify(next));
    if (action) recordActivity(action, detail || "");
    if (supabase && branchId && user.id && !user.id.startsWith("demo")) {
      setSyncStatus("syncing");
      void supabase.from("portal_state").upsert({
        branch_id: branchId,
        state_key: "shift_handovers",
        payload: next,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "branch_id,state_key" }).then(({ error }) => {
        setSyncStatus(error ? "error" : "synced");
      });
    }
  };

  const nextStatus = (status: ItemStatus) => statusOrder[(statusOrder.indexOf(status) + 1) % statusOrder.length];

  const updateTask = (taskId: string) => {
    const changed = handover.passoverTasks.find((task) => task.id === taskId);
    save(handovers.map((item) => item.id === handover.id
      ? { ...item, passoverTasks: item.passoverTasks.map((task) => task.id === taskId ? { ...task, status: nextStatus(task.status) } : task) }
      : item), "Passover status updated", changed?.title);
  };

  const updateChecklist = (sectionId: string, taskId: string) => {
    const section = handover.sections.find((item) => item.id === sectionId);
    const changed = section?.items.find((task) => task.id === taskId);
    save(handovers.map((item) => item.id === handover.id
      ? { ...item, sections: item.sections.map((section) => section.id === sectionId
        ? { ...section, items: section.items.map((task) => task.id === taskId ? { ...task, status: nextStatus(task.status) } : task) }
        : section) }
      : item), "Checklist updated", `${section?.title || "Checklist"} · ${changed?.title || "Task"}`);
  };

  const addTask = () => {
    if (!taskTitle.trim()) return;
    const newTask: ChecklistItem = { id: `passover-${Date.now()}`, title: taskTitle.trim(), detail: taskDetail.trim(), status: "pending" };
      save(handovers.map((item) => item.id === handover.id ? { ...item, passoverTasks: [...item.passoverTasks, newTask] } : item), "Passover task added", newTask.title);
    setTaskTitle("");
    setTaskDetail("");
    setAddingTask(false);
  };

  const addChecklistItem = () => {
    if (!addingSectionId || !taskTitle.trim()) return;
    const newTask: ChecklistItem = { id: `checklist-${Date.now()}`, title: taskTitle.trim(), detail: taskDetail.trim(), status: "pending" };
    const sectionName = handover.sections.find((section) => section.id === addingSectionId)?.title || "Checklist";
    save(handovers.map((item) => item.id === handover.id
      ? { ...item, sections: item.sections.map((section) => section.id === addingSectionId ? { ...section, items: [...section.items, newTask] } : section) }
      : item), "Checklist task added", `${sectionName} · ${newTask.title}`);
    setTaskTitle("");
    setTaskDetail("");
    setAddingSectionId(null);
  };

  const openShiftEditor = () => {
    setShiftDate(handover.date);
    setShiftDay(handover.day);
    setShiftTime(handover.time);
    setShiftStaff(handover.staff.join(" / "));
    setShiftIssue(handover.issue);
    setEditingShift(true);
  };

  const saveShiftDetails = () => {
    const staff = shiftStaff.split(/[,/]/).map((name) => name.trim()).filter(Boolean);
    save(handovers.map((item) => item.id === handover.id ? {
      ...item,
      date: shiftDate.trim() || item.date,
      day: shiftDay.trim() || item.day,
      time: shiftTime.trim() || item.time,
      staff: staff.length ? staff : item.staff,
      issue: shiftIssue.trim() || "No critical issues reported.",
      workflow: "in_progress",
      updatedBy: user.fullName,
      updatedAt: "Baru sahaja",
    } : item), "Shift details updated", `${selectedShift} Shift · ${staff.join(" / ")}`);
    setEditingShift(false);
  };

  const handoverShift = () => {
    save(handovers.map((item) => item.id === handover.id ? {
      ...item,
      workflow: "handed_over",
      updatedBy: user.fullName,
      updatedAt: "Baru sahaja",
    } : item), "Shift handed over", `${counts.pending} items still require action`);
    setConfirmingHandover(false);
  };

  const receiveHandover = () => {
    save(handovers.map((item) => item.id === handover.id ? {
      ...item,
      workflow: "received",
      updatedBy: user.fullName,
      updatedAt: "Baru sahaja",
    } : item), "Passover received", `${counts.pending} items received for action`);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#67cff4]">{user.branch} · Clinic passover</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{selectedShift} Shift Checklist</h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#c3d7e3]">
              <span>{handover.date} · {handover.day}</span>
              <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#67cff4]" />{handover.time}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button onClick={openShiftEditor} className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15"><UserRound className="h-4 w-4" />Start / Edit Shift</button>
            <div className="inline-flex rounded-2xl border border-white/15 bg-white/10 p-1.5">
              {(["AM", "PM"] as ShiftType[]).map((shift) => (
                <button key={shift} onClick={() => setSelectedShift(shift)} className={cn("rounded-xl px-6 py-3 text-sm font-bold transition", selectedShift === shift ? "bg-white text-[#0b3d59]" : "text-[#c3d7e3] hover:text-white")}>{shift} Shift</button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-white/12 pt-5 text-sm">
          <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-bold", workflow === "received" ? "bg-emerald-400/15 text-emerald-200" : workflow === "handed_over" ? "bg-amber-300/15 text-amber-100" : "bg-white/10 text-white")}>
            <span className={cn("h-2 w-2 rounded-full", workflow === "received" ? "bg-emerald-300" : workflow === "handed_over" ? "bg-amber-300" : "bg-[#67cff4]")} />
            {workflow === "received" ? "Passover received" : workflow === "handed_over" ? "Waiting for next shift" : "Shift in progress"}
          </span>
          <span className="text-[#b9cfdd]">Last updated by {handover.updatedBy || handover.staff[0]} · {handover.updatedAt || "today"}</span>
          <span className={cn("ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold", syncStatus === "synced" ? "bg-emerald-400/15 text-emerald-200" : syncStatus === "syncing" ? "bg-white/10 text-white" : syncStatus === "error" ? "bg-rose-400/15 text-rose-200" : "bg-white/10 text-[#b9cfdd]")}><span className="h-1.5 w-1.5 rounded-full bg-current" />{syncStatus === "synced" ? "Supabase synced" : syncStatus === "syncing" ? "Syncing..." : syncStatus === "error" ? "Check branch access" : isSupabaseConfigured ? "Demo account · local data" : "Local data"}</span>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Outstanding" value={counts.pending} tone="pending" />
        <SummaryCard label="Completed" value={counts.done} tone="done" />
        <SummaryCard label="Not required" value={counts.not_required} tone="not_required" />
      </div>

      <section className="flex flex-col gap-4 rounded-[22px] border border-[#dce4ed] bg-white p-5 shadow-[0_10px_28px_rgba(16,54,78,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className={cn("grid h-12 w-12 place-items-center rounded-2xl", workflow === "received" ? "bg-emerald-50 text-emerald-600" : workflow === "handed_over" ? "bg-amber-50 text-amber-600" : "bg-[#e8f7fd] text-[#0b587b]")}>
            {workflow === "received" ? <CheckCircle2 className="h-6 w-6" /> : workflow === "handed_over" ? <Send className="h-5 w-5" /> : <ClipboardCheck className="h-5 w-5" />}
          </div>
          <div><p className="font-semibold">{workflow === "received" ? "Shift record received" : workflow === "handed_over" ? "Passover ready to receive" : "Review and hand over the shift"}</p><p className="mt-1 text-sm text-[#60758c]">{counts.pending ? `${counts.pending} tasks are still outstanding and will carry over to the next shift.` : "All tasks have been given a status."}</p></div>
        </div>
        {workflow === "in_progress" && <button onClick={() => setConfirmingHandover(true)} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(11,88,123,0.22)]"><Send className="h-4 w-4" />Hand over to next shift</button>}
        {workflow === "handed_over" && <button onClick={receiveHandover} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"><Check className="h-4 w-4" />Receive passover</button>}
        {workflow === "received" && <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Complete</span>}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-[28px] bg-[#073a56] p-6 text-white shadow-[0_16px_38px_rgba(7,58,86,0.14)] sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#67cff4]">For the next shift</p><h3 className="mt-1 text-2xl font-semibold">Passover tasks</h3></div>
            <button onClick={() => setAddingTask(true)} className="flex items-center gap-2 rounded-xl bg-[#0b587b] px-4 py-2.5 text-sm font-bold transition hover:bg-[#083a55]"><Plus className="h-4 w-4" />Add</button>
          </div>
          <div className="mt-6 space-y-3">
            {handover.passoverTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-4 rounded-2xl bg-white p-4 text-[#14233b]">
                <StatusToggle status={task.status} onClick={() => updateTask(task.id)} />
                <div className="min-w-0 flex-1"><p className="font-semibold">{task.title}</p>{task.detail && <p className="mt-1.5 text-sm leading-6 text-[#60758c]">{task.detail}</p>}</div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[#a8b6c5]" />
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-[24px] border border-[#dce4ed] bg-white p-6 shadow-[0_12px_30px_rgba(16,54,78,0.05)]">
            <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e8f7fd] text-[#0b587b]"><UsersRound className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-[#7890a6]">Staff on duty</p><p className="mt-1 font-semibold">{handover.staff.join(" / ")}</p></div><button onClick={openShiftEditor} className="rounded-lg bg-[#f1f4f8] px-3 py-2 text-xs font-bold text-[#526a80]">Edit</button></div>
            <div className="mt-5 border-t border-[#e7ecf2] pt-5"><p className="text-xs font-bold uppercase tracking-wider text-[#7890a6]">Open issues</p><p className="mt-2 text-sm leading-6 text-[#526a80]">{handover.issue}</p></div>
          </section>
          <section className="rounded-[24px] border border-[#dce4ed] bg-white p-6">
            <p className="text-sm font-semibold">How to update</p><p className="mt-2 text-sm leading-6 text-[#60758c]">Tap a status icon to switch between outstanding, completed and not required.</p>
            <div className="mt-4 space-y-3"><Legend status="pending" /><Legend status="done" /><Legend status="not_required" /></div>
          </section>
          <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Privacy:</strong> The preview uses fictional names and masked IDs. Real patient data must be protected with login, role-based access and audit logs.</div>
          <section className="rounded-[24px] border border-[#dce4ed] bg-white p-6">
            <div className="flex items-center gap-3"><History className="h-5 w-5 text-[#0b587b]" /><div><p className="font-semibold">Activity log</p><p className="text-xs text-[#7890a6]">Who did what during this shift</p></div></div>
            <div className="mt-5 space-y-4">
              {audit.filter((event) => event.shift === selectedShift).slice(0, 5).map((event) => (
                <div key={event.id} className="relative pl-5 before:absolute before:left-0 before:top-2 before:h-2 before:w-2 before:rounded-full before:bg-[#67cff4]">
                  <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{event.action}</p><span className="shrink-0 text-xs text-[#8ba0b3]">{event.time}</span></div>
                  <p className="mt-1 text-xs leading-5 text-[#60758c]">{event.actor} · {event.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section>
        <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b587b]">Operations checklist</p><h3 className="mt-1 text-2xl font-semibold">{selectedShift} shift tasks</h3></div>
        <div className="grid gap-5 lg:grid-cols-2">
          {handover.sections.map((section) => {
            const Icon = sectionIcons[section.icon];
            return (
              <div key={section.id} className="rounded-[24px] border border-[#dce4ed] bg-white p-5 shadow-[0_10px_28px_rgba(16,54,78,0.04)] sm:p-6">
                <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e9f8fe] text-[#079bd3]"><Icon className="h-5 w-5" /></div><h4 className="min-w-0 flex-1 text-lg font-semibold">{section.title}</h4><button onClick={() => { setTaskTitle(""); setTaskDetail(""); setAddingSectionId(section.id); }} className="flex items-center gap-1 rounded-lg bg-[#e8f7fd] px-3 py-2 text-xs font-bold text-[#0b587b]"><Plus className="h-3.5 w-3.5" />Add</button></div>
                <div className="mt-5 divide-y divide-[#edf1f5]">
                  {section.items.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                      <StatusToggle status={task.status} onClick={() => updateChecklist(section.id, task.id)} compact />
                      <div className="min-w-0 flex-1"><p className={cn("text-sm font-semibold", task.status === "done" && "text-[#557083]")}>{task.title}</p>{task.detail && <p className="mt-1 text-xs leading-5 text-[#7890a6]">{task.detail}</p>}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {addingTask && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#041f30]/65 p-4 backdrop-blur-sm" onMouseDown={() => setAddingTask(false)}>
          <div className="w-full max-w-lg rounded-[26px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b587b]">{selectedShift} Shift</p><h3 className="mt-1 text-2xl font-semibold">Add passover task</h3></div><button onClick={() => setAddingTask(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1f4f8]"><X className="h-5 w-5" /></button></div>
            <label className="mt-6 block"><span className="mb-2 block text-sm font-semibold">Task title</span><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="portal-input" placeholder="Example: Follow up lab result" /></label>
            <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">Short details</span><textarea value={taskDetail} onChange={(event) => setTaskDetail(event.target.value)} className="min-h-28 w-full rounded-2xl border border-[#dce4ed] bg-[#f7f9fc] p-4 outline-none focus:border-[#0b587b] focus:ring-4 focus:ring-[#0b587b]/10" placeholder="Use only the minimum information needed. Avoid full IDs." /></label>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setAddingTask(false)} className="rounded-xl border border-[#dce4ed] px-5 py-3 text-sm font-bold">Cancel</button><button onClick={addTask} className="rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white">Add task</button></div>
          </div>
        </div>
      )}

      {addingSectionId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#041f30]/65 p-4 backdrop-blur-sm" onMouseDown={() => setAddingSectionId(null)}>
          <div className="w-full max-w-lg rounded-[26px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b587b]">{selectedShift} checklist</p><h3 className="mt-1 text-2xl font-semibold">Add record</h3></div><button onClick={() => setAddingSectionId(null)} className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1f4f8]"><X className="h-5 w-5" /></button></div>
            <label className="mt-6 block"><span className="mb-2 block text-sm font-semibold">Item / task</span><input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="portal-input" placeholder="Example: Purchase combo test" /></label>
            <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">Details</span><textarea value={taskDetail} onChange={(event) => setTaskDetail(event.target.value)} className="min-h-28 w-full rounded-2xl border border-[#dce4ed] bg-[#f7f9fc] p-4 outline-none focus:border-[#0b587b] focus:ring-4 focus:ring-[#0b587b]/10" placeholder="Example: 18 units remaining · admin informed" /></label>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setAddingSectionId(null)} className="rounded-xl border border-[#dce4ed] px-5 py-3 text-sm font-bold">Cancel</button><button onClick={addChecklistItem} className="rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white">Add record</button></div>
          </div>
        </div>
      )}

      {editingShift && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#041f30]/65 p-4 backdrop-blur-sm" onMouseDown={() => setEditingShift(false)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[26px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b587b]">{selectedShift} Shift</p><h3 className="mt-1 text-2xl font-semibold">Shift details</h3><p className="mt-2 text-sm text-[#60758c]">Staff complete this when starting a shift or before passover.</p></div><button onClick={() => setEditingShift(false)} className="grid h-10 w-10 place-items-center rounded-xl bg-[#f1f4f8]"><X className="h-5 w-5" /></button></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-2 block text-sm font-semibold">Date</span><input value={shiftDate} onChange={(event) => setShiftDate(event.target.value)} className="portal-input" placeholder="28 September 2026" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">Day</span><input value={shiftDay} onChange={(event) => setShiftDay(event.target.value)} className="portal-input" placeholder="Monday" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">Shift hours</span><input value={shiftTime} onChange={(event) => setShiftTime(event.target.value)} className="portal-input" placeholder="9:00 PM – 9:00 AM" /></label>
              <label className="block"><span className="mb-2 block text-sm font-semibold">Staff names</span><input value={shiftStaff} onChange={(event) => setShiftStaff(event.target.value)} className="portal-input" placeholder="Najwa / Amy" /></label>
            </div>
            <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">Open issues</span><textarea value={shiftIssue} onChange={(event) => setShiftIssue(event.target.value)} className="min-h-32 w-full rounded-2xl border border-[#dce4ed] bg-[#f7f9fc] p-4 outline-none focus:border-[#0b587b] focus:ring-4 focus:ring-[#0b587b]/10" placeholder="List important issues for the next shift. If none, write None." /></label>
            <div className="mt-6 flex justify-end gap-3"><button onClick={() => setEditingShift(false)} className="rounded-xl border border-[#dce4ed] px-5 py-3 text-sm font-bold">Cancel</button><button onClick={saveShiftDetails} className="rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white">Save shift details</button></div>
          </div>
        </div>
      )}

      {confirmingHandover && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#041f30]/65 p-4 backdrop-blur-sm" onMouseDown={() => setConfirmingHandover(false)}>
          <div className="w-full max-w-lg rounded-[26px] bg-white p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f7fd] text-[#0b587b]"><Send className="h-5 w-5" /></div>
            <h3 className="mt-5 text-2xl font-semibold">Hand over {selectedShift} shift?</h3>
            <p className="mt-2 text-sm leading-6 text-[#60758c]">The next shift will see {counts.pending} outstanding tasks. This record will be marked under <strong>{user.fullName}</strong>.</p>
            {counts.pending > 0 && <div className="mt-5 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-900"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><span>Make sure outstanding task details are clear before handing over.</span></div>}
            <div className="mt-7 flex justify-end gap-3"><button onClick={() => setConfirmingHandover(false)} className="rounded-xl border border-[#dce4ed] px-5 py-3 text-sm font-bold">Review again</button><button onClick={handoverShift} className="flex items-center gap-2 rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white">Confirm & hand over <ArrowRight className="h-4 w-4" /></button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusToggle({ status, onClick, compact = false }: { status: ItemStatus; onClick: () => void; compact?: boolean }) {
  const config = {
    pending: { icon: AlertTriangle, label: "Outstanding", className: "bg-amber-100 text-amber-700" },
    done: { icon: Check, label: "Completed", className: "bg-emerald-100 text-emerald-700" },
    not_required: { icon: CircleMinus, label: "Not required", className: "bg-rose-100 text-rose-700" },
  }[status];
  const Icon = config.icon;
  return <button onClick={onClick} title={`${config.label} — tekan untuk tukar`} className={cn("flex shrink-0 items-center justify-center gap-2 rounded-xl font-bold transition hover:scale-[1.03]", config.className, compact ? "h-9 w-9" : "min-h-10 px-3 text-xs")}><Icon className="h-4 w-4" />{!compact && <span className="hidden sm:inline">{config.label}</span>}</button>;
}

function Legend({ status }: { status: ItemStatus }) {
  const labels = { pending: "Outstanding", done: "Completed", not_required: "Not required" };
  return <div className="flex items-center gap-3"><StatusToggle status={status} onClick={() => undefined} compact /><span className="text-sm text-[#60758c]">{labels[status]}</span></div>;
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: ItemStatus }) {
  const styles = {
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    done: "border-emerald-200 bg-emerald-50 text-emerald-800",
    not_required: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return <div className={cn("flex items-center justify-between rounded-[20px] border px-5 py-4", styles[tone])}><div><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs opacity-70">Daripada semua checklist</p></div><span className="text-3xl font-semibold">{value}</span></div>;
}
