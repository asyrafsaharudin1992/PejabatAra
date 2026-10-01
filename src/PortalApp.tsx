import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileText,
  GraduationCap,
  Home,
  Library,
  Link2,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  Announcement,
  demoStaff,
  KnowledgeResource,
  knowledgeResources,
  PortalUser,
  quickLinks,
  trainingModules,
  TrainingModule,
} from "./portalData";
import { cn } from "./lib/utils";
import { isSupabaseConfigured, signInWithSupabase, signOutSupabase } from "./lib/supabase";
import ShiftHandoverView from "./ShiftHandover";
import { usePanelSync } from "./lib/usePanelSync";

type View = "home" | "handover" | "knowledge" | "training" | "panelTraining" | "announcements" | "links" | "admin";

const categoryLabelMap: Record<string, string> = {
  "Semua": "All",
  "Kewangan": "Finance",
  "Sumber Manusia": "Human Resources",
  "Operasi": "Operations",
  "Kualiti": "Quality",
  "Operasi Klinik": "Clinic Operations",
  "SOP Klinik": "Clinic SOPs",
  "Pematuhan": "Compliance",
  "Sistem & IT": "Systems & IT",
  "Khidmat Pesakit": "Patient Service",
  "Farmasi": "Pharmacy",
  "Training": "Training",
  "Doktor Locum": "Locum Doctors",
  "Panel & Claim": "Panels & Claims",
  "TeamARA": "TeamARA",
};

const departmentValues = ["Kewangan", "Sumber Manusia", "Operasi", "Kualiti"];

function normalizeDepartmentValue(value: string) {
  if (departmentValues.includes(value)) return value;
  if (["Pematuhan", "Training"].includes(value)) return "Kualiti";
  return "Operasi";
}

function categoryLabel(category: string) {
  return categoryLabelMap[category] || category;
}

function statusLabel(status?: KnowledgeResource["status"]) {
  return status === "TERBATAL" ? "Not active" : "Active";
}

function resourceTypeLabel(type: KnowledgeResource["type"]) {
  if (type === "SOP") return "SOP";
  if (type === "Polisi" || type === "Memo") return "Memo";
  return "Guideline";
}

const viewTitles: Record<View, string> = {
  home: "Home",
  handover: "Shift Passover",
  knowledge: "Reference Hub",
  training: "My Training",
  panelTraining: "Panel Training",
  announcements: "Announcements",
  links: "Important Links",
  admin: "Portal Management",
};

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeUser(user: PortalUser): PortalUser {
  const demo = demoStaff.find((member) => member.email === user.email);
  return {
    ...demo,
    ...user,
    department: demo?.department || user.department || "Department not assigned",
    branch: demo?.branch || user.branch || "Branch not assigned",
    status: user.status || demo?.status || "active",
    lastActive: demo?.lastActive || user.lastActive || "Not logged in",
  };
}

export default function PortalApp() {
  const [user, setUser] = useState<PortalUser | null>(() => {
    const saved = readLocal<PortalUser | null>("ara_portal_session", null);
    const previewMode = localStorage.getItem("ara_view_mode");
    return saved ? normalizeUser(previewMode === "staff" ? { ...saved, role: "Staff" } : saved) : null;
  });
  const [workspaceMode, setWorkspaceMode] = useState<"admin" | "staff">(() => localStorage.getItem("ara_view_mode") === "staff" ? "staff" : "admin");
  const adminAccount = readLocal<PortalUser | null>("ara_portal_session", null);
  const [view, setView] = useState<View>("home");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [selectedResource, setSelectedResource] = useState<KnowledgeResource | null>(null);
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [readResources, setReadResources] = useState<string[]>([]);
  const [staff, setStaff] = useState<PortalUser[]>(() => readLocal<PortalUser[]>("ara_portal_staff", demoStaff).map(normalizeUser));
  const [resources, setResources] = useState<KnowledgeResource[]>(() => readLocal<KnowledgeResource[]>("ara_portal_resources", knowledgeResources));
  const [toast, setToast] = useState("");
  const panelSync = usePanelSync(user?.email, view === 'panelTraining');

  useEffect(() => {
    if (!user) return;
    setCompletedLessons(readLocal(`ara_training_${user.email}`, []));
    setReadResources(readLocal(`ara_read_${user.email}`, []));
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const login = (nextUser: PortalUser) => {
    setUser(nextUser);
    localStorage.setItem("ara_portal_session", JSON.stringify(nextUser));
    setView("home");
  };

  const logout = async () => {
    await signOutSupabase();
    localStorage.removeItem("ara_portal_session");
    localStorage.removeItem("araoffice_user");
    localStorage.removeItem("ara_view_mode");
    setUser(null);
    window.location.hash = "";
  };

  const navigate = (nextView: View) => {
    setView(nextView);
    setMobileNavOpen(false);
  };

  const switchWorkspaceMode = (mode: "admin" | "staff") => {
    if (!adminAccount) return;
    localStorage.setItem("ara_view_mode", mode);
    setWorkspaceMode(mode);
    setUser(normalizeUser(mode === "staff" ? { ...adminAccount, role: "Staff" } : adminAccount));
  };

  const toggleLesson = (lessonId: string) => {
    if (!user) return;
    const next = completedLessons.includes(lessonId)
      ? completedLessons.filter((id) => id !== lessonId)
      : [...completedLessons, lessonId];
    setCompletedLessons(next);
    localStorage.setItem(`ara_training_${user.email}`, JSON.stringify(next));
  };

  const markResourceRead = (resourceId: string) => {
    if (!user || readResources.includes(resourceId)) return;
    const next = [...readResources, resourceId];
    setReadResources(next);
    localStorage.setItem(`ara_read_${user.email}`, JSON.stringify(next));
    setToast("Marked as read");
  };

  const addStaff = (newStaff: PortalUser) => {
    const next = [...staff, newStaff];
    setStaff(next);
    localStorage.setItem("ara_portal_staff", JSON.stringify(next));
    setToast("Staff added to the prototype");
  };

  const updateResource = (updated: KnowledgeResource) => {
    const next = resources.map((resource) => resource.id === updated.id ? updated : resource);
    setResources(next);
    localStorage.setItem("ara_portal_resources", JSON.stringify(next));
    setToast("Memo details updated");
  };

  if (!user) return <LoginScreen onLogin={login} />;

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#14233b]">
      <Sidebar
        panelAlertCount={panelSync.alerts.length}
        user={user}
        view={view}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onNavigate={navigate}
        onLogout={logout}
      />

      {adminAccount?.role === "Superadmin" && (
        <div className="fixed right-5 top-5 z-[60] flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur-xl">
          <span className="hidden px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:inline">View as</span>
          <button onClick={() => switchWorkspaceMode("admin")} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${workspaceMode === "admin" ? "bg-[#0b587b] text-white" : "text-slate-500 hover:bg-slate-100"}`}>Admin</button>
          <button onClick={() => switchWorkspaceMode("staff")} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${workspaceMode === "staff" ? "bg-[#0b587b] text-white" : "text-slate-500 hover:bg-slate-100"}`}>Staff</button>
          <button onClick={() => { localStorage.removeItem("ara_view_mode"); window.location.hash = "#office/admin"; }} className="ml-1 border-l border-slate-200 px-3 py-2 text-xs font-bold text-[#0b587b] hover:text-[#083a55]">System Admin</button>
        </div>
      )}

      <div className="min-h-screen lg:pl-[300px]">
        <header className="sticky top-0 z-30 border-b border-[#dce4ed] bg-[#f7f8fb]/90 backdrop-blur-2xl lg:hidden">
          <div className="flex h-[76px] items-center gap-4 px-4 sm:px-6 lg:px-10">
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce4ed] bg-white lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#18bff2]">AraSpace</p>
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{viewTitles[view]}</h1>
            </div>
            <div className="hidden w-full max-w-sm items-center gap-2 rounded-2xl border border-[#dce4ed] bg-white px-4 py-2.5 md:flex">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && navigate("knowledge")}
                placeholder="Search SOPs, guides or FAQs..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-[#dce4ed] bg-white text-[#60758c] transition hover:border-[#0b587b]/30" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
            <button onClick={() => navigate("home")} className="flex items-center gap-3 rounded-2xl p-1.5 pr-3 hover:bg-slate-50">
              <Avatar name={user.fullName} />
              <div className="hidden text-left sm:block">
                <p className="text-sm font-bold leading-tight">{user.fullName}</p>
                <p className="text-xs text-slate-500">{user.role === "Superadmin" ? "Administrator" : user.department}</p>
              </div>
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-[38px]">
          {view === "home" && (
            <HomeView
              user={user}
              completedLessons={completedLessons}
              readResources={readResources}
              onNavigate={navigate}
              onOpenResource={setSelectedResource}
              onOpenModule={setSelectedModule}
              search={globalSearch}
              setSearch={setGlobalSearch}
            />
          )}
          {view === "handover" && <ShiftHandoverView user={user} />}
          {view === "knowledge" && (
            <KnowledgeView
              initialSearch={globalSearch}
              readResources={readResources}
              onOpen={setSelectedResource}
              resources={resources}
              canEdit={user.role === "Superadmin"}
              onUpdateResource={updateResource}
            />
          )}
          {view === "training" && (
            <TrainingView completedLessons={completedLessons} onOpen={setSelectedModule} />
          )}
          {view === "panelTraining" && <PanelTrainingView canEdit={user.role === "Superadmin"} sync={panelSync} />}
          {view === "announcements" && <AnnouncementsView />}
          {view === "links" && <LinksView />}
          {view === "admin" && user.role === "Superadmin" && (
            <AdminView staff={staff} onAddStaff={addStaff} />
          )}
        </main>
      </div>

      {selectedResource && (
        <ResourceModal
          resource={selectedResource}
          isRead={readResources.includes(selectedResource.id)}
          onClose={() => setSelectedResource(null)}
          onMarkRead={() => markResourceRead(selectedResource.id)}
        />
      )}
      {selectedModule && (
        <TrainingModal
          module={selectedModule}
          completedLessons={completedLessons}
          onToggleLesson={toggleLesson}
          onClose={() => setSelectedModule(null)}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[80] flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-2xl">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" /> {toast}
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (user: PortalUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        onLogin(await signInWithSupabase(email, password));
        return;
      }
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      onLogin({ ...data, department: data.department || "Clinic Operations", branch: data.location || "Branch not assigned" });
    } catch {
      setError("The live account is not connected on localhost. Use the preview below to explore the new system.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-[#073a56] lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden overflow-hidden bg-[#083a55] p-16 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="relative flex items-center gap-3">
          <LogoMark />
          <div>
            <p className="text-xl font-semibold tracking-tight">AraSpace</p>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#67cff4]">Knowledge & Training</p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-7 text-xs font-semibold uppercase tracking-[0.22em] text-[#67cff4]">Internal workspace</p>
          <h1 className="text-[3.5rem] font-semibold leading-[1.05] tracking-[-0.055em]">Everything your team needs. One workspace.</h1>
          <p className="mt-7 max-w-lg text-lg leading-8 text-[#b9cfdd]">References, training and key information organised so the team can work with confidence.</p>
        </div>
        <p className="relative text-sm text-slate-400">TeamARA internal portal · Prototype</p>
      </section>

      <section className="flex items-center justify-center bg-white px-6 py-12 sm:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <LogoMark />
            <p className="text-xl font-semibold">AraSpace</p>
          </div>
          <p className="text-sm font-semibold text-[#0b587b]">Welcome</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">Sign in to AraSpace</h2>
          <p className="mt-3 text-base leading-7 text-slate-500">{isSupabaseConfigured ? "Use the individual account invited by your administrator." : "The backend is not connected. Use a preview account to explore the system."}</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Email address</span>
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 outline-none transition focus:ring-4 focus:ring-[#0b587b]/10" placeholder="name@organisation.com" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Password</span>
              <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border-0 bg-[#f4f6fa] px-4 outline-none transition focus:ring-4 focus:ring-[#0b587b]/10" placeholder="••••••••" />
            </label>
            {error && <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}
            <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0b587b] font-semibold text-white transition hover:bg-[#083a55] disabled:opacity-60">
              {loading ? "Connecting..." : "Sign in"} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="my-7 flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-slate-400"><span className="h-px flex-1 bg-slate-200" />{isSupabaseConfigured ? "Demo access" : "Local preview"}<span className="h-px flex-1 bg-slate-200" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => onLogin(demoStaff[0])} className="rounded-2xl bg-[#f5f5f7] p-4 text-left transition hover:bg-[#e8e8ed]">
              <ShieldCheck className="mb-3 h-5 w-5 text-[#0b587b]" />
              <p className="text-sm font-semibold">Continue as Admin</p>
              <p className="mt-1 text-xs text-slate-500">Manage staff & content</p>
            </button>
            <button onClick={() => onLogin(demoStaff[1])} className="rounded-2xl bg-[#f5f5f7] p-4 text-left transition hover:bg-[#e8e8ed]">
              <GraduationCap className="mb-3 h-5 w-5 text-[#0b587b]" />
              <p className="text-sm font-semibold">Continue as Staff</p>
              <p className="mt-1 text-xs text-slate-500">References & training</p>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Sidebar({ user, view, open, onClose, onNavigate, onLogout, panelAlertCount = 0 }: { user: PortalUser; view: View; open: boolean; onClose: () => void; onNavigate: (view: View) => void; onLogout: () => void; panelAlertCount?: number }) {
  const items: { id: View; label: string; icon: typeof Home }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "handover", label: "Shift Passover", icon: ClipboardCheck },
    { id: "knowledge", label: "Reference Hub", icon: Library },
    { id: "training", label: "My Training", icon: GraduationCap },
    { id: "panelTraining", label: "Panel Training", icon: BookOpen },
    { id: "announcements", label: "Announcements", icon: Bell },
    { id: "links", label: "Important Links", icon: Link2 },
  ];

  return (
    <>
      {open && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-white/10 bg-[#083a55] p-6 text-white transition-transform duration-300 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between px-2 py-3">
          <div className="flex items-center gap-3"><LogoMark /><div><p className="font-semibold tracking-tight">ARASPACE</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#70d8fa]">Operations & Training</p></div></div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="mx-1 mt-8 h-px bg-white/10" />
        <nav className="mt-7 flex-1 space-y-2">
          {items.map((item) => (
            <button key={item.id} onClick={() => onNavigate(item.id)} className={cn("flex w-full items-center gap-3 rounded-[14px] px-4 py-3.5 text-sm font-semibold transition", view === item.id ? "bg-white text-[#162a43] shadow-[0_10px_28px_rgba(0,0,0,0.14)] [&>svg]:text-[#7357ff]" : "text-[#b8cddd] hover:bg-white/8 hover:text-white")}>
              <item.icon className="h-5 w-5" />{item.label}
              {item.id === "panelTraining" && panelAlertCount > 0 && <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-xs text-white">{panelAlertCount}</span>}
              {item.id === "announcements" && <span className="ml-auto grid h-6 min-w-6 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] text-white">1</span>}
              {item.id !== "announcements" && <ChevronRight className="ml-auto h-4 w-4 opacity-45" />}
            </button>
          ))}
        </nav>
        <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
          <div className="flex items-center gap-3"><Avatar name={user.fullName} dark /><div className="min-w-0"><p className="truncate text-sm font-semibold">{user.fullName}</p><p className="truncate text-xs text-[#9bb5c7]">{user.department}</p></div></div>
          <p className="mt-3 rounded-lg bg-white/8 px-3 py-2 text-xs font-semibold text-[#b5cad8]">{user.branch}</p>
          <button onClick={onLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[#b5cad8] transition hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </aside>
    </>
  );
}

function HomeView({ user, completedLessons, readResources, onNavigate, onOpenResource, onOpenModule, search, setSearch }: { user: PortalUser; completedLessons: string[]; readResources: string[]; onNavigate: (view: View) => void; onOpenResource: (resource: KnowledgeResource) => void; onOpenModule: (module: TrainingModule) => void; search: string; setSearch: (value: string) => void }) {
  const totalLessons = trainingModules.reduce((total, module) => total + module.lessons.length, 0);
  const trainingProgress = Math.round((completedLessons.length / totalLessons) * 100);
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" }).format(new Date());
  const quickActions: { label: string; note: string; icon: typeof Home; view: View; tone: string }[] = [
    { label: "Shift Passover", note: "6 outstanding", icon: ClipboardCheck, view: "handover", tone: "text-[#7258ff]" },
    { label: "Reference Hub", note: "SOPs & guides", icon: Library, view: "knowledge", tone: "text-[#20c7f4]" },
    { label: "My Training", note: `${trainingProgress}% complete`, icon: GraduationCap, view: "training", tone: "text-[#ffb000]" },
    { label: "Announcements", note: "1 new item", icon: Bell, view: "announcements", tone: "text-[#ff3b62]" },
    { label: "Important Links", note: "Work systems", icon: Link2, view: "links", tone: "text-[#20c7f4]" },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <section className="rounded-[30px] bg-[#0b3d59] px-7 py-9 text-white sm:px-10 lg:px-12">
        <div className="flex flex-col gap-7 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · {user.branch}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-[2.45rem]">Welcome, {user.fullName}</h2>
            <p className="mt-3 text-base text-[#bed2df]">All staff tasks, references and training in one workspace.</p>
          </div>
          <div className="text-left md:text-right">
            <span className="inline-flex rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold capitalize text-[#d9e7ef]">{today}</span>
            <p className="mt-4 text-sm italic text-[#a9c1d0]">“Clear at work. Confident at handover.”</p>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Next action</p>
            <h3 className="mt-3 text-2xl font-semibold">PM passover is still open</h3>
            <p className="mt-2 text-[#bed2df]">6 outstanding tasks need to be reviewed before handover.</p>
            <button onClick={() => onNavigate("handover")} className="mt-6 inline-flex items-center gap-3 rounded-[14px] bg-white px-5 py-3 text-sm font-bold text-[#0b3d59]">Open passover <ArrowRight className="h-4 w-4" /></button>
          </div>
          <span className="inline-flex w-fit rounded-full bg-[#ffc62b] px-5 py-2 text-sm font-bold text-[#263247]">Action needed</span>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between"><h3 className="text-2xl font-semibold tracking-tight">Quick actions</h3><span className="text-xs font-bold uppercase tracking-[0.22em] text-[#9aacc0]">Shortcuts</span></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {quickActions.map((action) => (
            <button key={action.view} onClick={() => onNavigate(action.view)} className="group min-h-[132px] rounded-[24px] bg-[#0b3d59] p-5 text-left text-white transition hover:-translate-y-0.5 hover:bg-[#104b6c]">
              <div className="flex items-center gap-2"><span className={cn("grid h-10 w-10 place-items-center rounded-full bg-white/10", action.tone)}><action.icon className="h-5 w-5" /></span><ArrowRight className="h-4 w-4 text-[#9bc8da] transition group-hover:translate-x-1" /></div>
              <p className="mt-5 font-semibold">{action.label}</p><p className="mt-1 text-xs text-[#9fb8c7]">{action.note}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-[28px] border border-[#aee7fb] bg-[#edf9fe] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#0b3d59] text-[#70d8fa]"><Search className="h-5 w-5" /></div><div><h3 className="font-semibold">Need an answer quickly?</h3><p className="mt-1 text-sm text-[#60758c]">Search SOPs, work guides or FAQs without leaving the portal.</p></div></div>
        <div className="flex w-full max-w-xl gap-2 rounded-[16px] bg-white p-2 shadow-sm"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onNavigate("knowledge")} placeholder="Try: shift change, Plato, complaints..." className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" /><button onClick={() => onNavigate("knowledge")} className="rounded-xl bg-[#0b3d59] px-5 py-2.5 text-sm font-bold text-white">Search</button></div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="overflow-hidden rounded-[28px] border border-[#dce4ed] bg-white">
          <div className="bg-[#0b3d59] p-7 text-white"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#ffc62b]">Staff development</p><h3 className="mt-2 text-2xl font-semibold">My training</h3></div><div className="text-right"><p className="text-4xl font-semibold">{trainingProgress}%</p><p className="mt-1 text-xs text-[#a9c1d0]">{completedLessons.length}/{totalLessons} lessons</p></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#ffc62b]" style={{ width: `${trainingProgress}%` }} /></div></div>
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{trainingModules[0].title}</p><p className="mt-1 text-sm text-slate-500">Required module · {trainingModules[0].duration} min</p></div><button onClick={() => onOpenModule(trainingModules[0])} className="rounded-xl bg-[#0b3d59] px-5 py-3 text-sm font-bold text-white">Continue training</button></div>
        </div>
        <div className="rounded-[28px] border border-[#dce4ed] bg-white p-7">
          <div className="flex items-center gap-2 text-[#f04464]"><span className="h-2 w-2 rounded-full bg-[#f04464]" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Important announcement</span></div>
          <h3 className="mt-5 text-xl font-semibold">{announcementsSeed[0].title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{announcementsSeed[0].body}</p>
          <button onClick={() => onNavigate("announcements")} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#0b587b]">View all announcements <ArrowRight className="h-4 w-4" /></button>
          <div className="mt-7 border-t border-slate-100 pt-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Latest references</p>{knowledgeResources.slice(0, 2).map((resource) => <button key={resource.id} onClick={() => onOpenResource(resource)} className="mt-4 flex w-full items-center gap-3 text-left"><FileText className="h-5 w-5 shrink-0 text-[#20aee0]" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{resource.title}</span><ChevronRight className="h-4 w-4 text-slate-300" /></button>)}</div>
        </div>
      </section>
    </div>
  );
}

const announcementsSeed: Announcement[] = [
  { id: "review", title: "Staff portal content review", body: "All SOPs and training materials are starter drafts. Process owners must review them before publishing to all staff.", date: "30 Sep 2026", audience: "All staff", priority: "Penting" },
  { id: "onboarding", title: "New staff onboarding training", body: "Supervisors should ensure new staff complete the onboarding modules during their first week.", date: "28 Sep 2026", audience: "Supervisors & new staff", priority: "Biasa" },
  { id: "complaint", title: "Patient complaint SOP updated", body: "Review the new escalation flow in the Reference Hub and report any unclear steps.", date: "25 Sep 2026", audience: "Front desk & operations", priority: "Biasa" },
];

function KnowledgeView({ initialSearch, readResources, onOpen, resources = knowledgeResources, canEdit = false, onUpdateResource }: { initialSearch: string; readResources: string[]; onOpen: (resource: KnowledgeResource) => void; resources?: KnowledgeResource[]; canEdit?: boolean; onUpdateResource?: (resource: KnowledgeResource) => void }) {
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState("Semua");
  // Keep the hub filter aligned with the four official departments. Legacy
  // labels are normalised into these departments in the table and filter.
  const categories = ["Semua", ...departmentValues];
  const filtered = resources.filter((item) => {
    const haystack = `${item.title} ${item.summary} ${item.category} ${item.keywords.join(" ")}`.toLowerCase();
    const itemDepartments = item.category.split(" / ").map((part) => normalizeDepartmentValue(part.trim()));
    return (category === "Semua" || itemDepartments.includes(category)) && haystack.includes(search.toLowerCase());
  }).sort((a, b) => {
    const toTime = (value: string) => { const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime() : 0; };
    return toTime(b.updatedAt) - toTime(a.updatedAt);
  });

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Reference hub</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Find answers quickly</h2><p className="mt-2 text-[#b9cfdd]">SOPs, policies, work guides and FAQs organised by topic.</p></div><div className="flex w-full max-w-xl items-center gap-3 rounded-[16px] bg-white px-4 py-3 text-[#14233b]"><Search className="h-5 w-5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try: leave, patient complaint, Plato..." className="w-full bg-transparent outline-none" /></div></div>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={cn("whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition", category === item ? "bg-white text-[#0b3d59]" : "bg-white/10 text-[#c4d7e3] hover:bg-white/15")}>{categoryLabel(item)}</button>)}</div>
      </div>
      <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dbe8f0] bg-white shadow-[0_12px_30px_rgba(16,54,78,0.05)]">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e8f7fd] text-[#0b587b]"><FileText className="h-6 w-6" /></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Official memos</p><h3 className="mt-1 text-lg font-semibold tracking-tight text-[#14233b]">AraSihat operational documents</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Original memos, policies and SOPs are stored in Drive. Use this hub to search references and open the full version when needed.</p></div>
          </div>
          <div className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#e8f7fd] px-4 py-3 text-sm font-bold text-[#0b587b]"><CheckCircle2 className="h-4 w-4" />{knowledgeResources.length} memos connected</div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-[#fbfdff] px-5 py-4 sm:px-6"><span className="rounded-full bg-[#eef8fc] px-3 py-1.5 text-xs font-semibold text-[#0b587b]">Memos & policies</span><span className="rounded-full bg-[#eef8fc] px-3 py-1.5 text-xs font-semibold text-[#0b587b]">Clinical operations SOPs</span><span className="rounded-full bg-[#eef8fc] px-3 py-1.5 text-xs font-semibold text-[#0b587b]">Staff training</span><span className="rounded-full bg-[#fff7d8] px-3 py-1.5 text-xs font-semibold text-[#876700]">Official Drive version</span></div>
      </div>
      <div className="mt-6 flex items-center justify-between"><p className="text-sm font-bold text-slate-500">{filtered.length} memos found</p><p className="text-xs text-slate-400">Official AraSihat source</p></div>
      <div className="mt-4 overflow-visible rounded-[24px] border border-[#dce4ed] bg-white shadow-[0_12px_30px_rgba(16,54,78,0.06)]">
        <div className="hidden grid-cols-[96px_145px_minmax(0,1fr)_82px_94px_104px] gap-3 border-b border-slate-200 bg-[#f7fafc] px-5 py-3.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 lg:grid lg:items-center xl:grid-cols-[110px_165px_minmax(0,1fr)_90px_105px_112px] xl:px-6"><span className="whitespace-nowrap">Date</span><span className="whitespace-nowrap">Department</span><span className="whitespace-nowrap">Memo title</span><span className="whitespace-nowrap">Type</span><span className="whitespace-nowrap">Status</span><span /></div>
        <div className="divide-y divide-slate-100">
          {filtered.map((resource) => <ResourceTableRow key={resource.id} resource={resource} canEdit={canEdit} onOpen={onOpen} onUpdate={onUpdateResource} />)}
        </div>
      </div>
      {filtered.length === 0 && <EmptyState icon={<Search />} title="No results found" text="Try another keyword or category." />}
    </div>
  );
}

function ResourceTableRow({ resource, canEdit, onOpen, onUpdate }: { key?: string; resource: KnowledgeResource; canEdit: boolean; onOpen: (resource: KnowledgeResource) => void; onUpdate?: (resource: KnowledgeResource) => void }) {
  const update = (patch: Partial<KnowledgeResource>) => onUpdate?.({ ...resource, ...patch });
  const departments = departmentValues;
  const selectedDepartments = Array.from(new Set(resource.category.split(" / ").map((part) => normalizeDepartmentValue(part.trim())).filter(Boolean)));
  const [departmentMenuOpen, setDepartmentMenuOpen] = useState(false);
  const toggleDepartment = (department: string) => {
    const next = selectedDepartments.includes(department)
      ? selectedDepartments.filter((item) => item !== department)
      : [...selectedDepartments, department];
    update({ category: next.join(" / ") || "Operasi" });
  };
  return <div className="group grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#f8fcfe] lg:grid-cols-[96px_145px_minmax(0,1fr)_82px_94px_104px] lg:items-center lg:gap-3 lg:px-5 xl:grid-cols-[110px_165px_minmax(0,1fr)_90px_105px_112px] xl:px-6">
    <div className="min-w-0 text-xs font-semibold text-slate-400">{canEdit ? <input value={resource.updatedAt === "Belum diekstrak" ? "" : resource.updatedAt} onChange={(event) => update({ updatedAt: event.target.value || "Belum diekstrak" })} placeholder="dd/mm/yyyy" className="w-full min-w-0 rounded-xl bg-slate-50/70 px-2 py-2 outline-none transition hover:bg-slate-100 focus:bg-white" /> : (resource.updatedAt === "Belum diekstrak" ? "Date not extracted" : resource.updatedAt)}</div>
    <div className="relative min-w-0">{canEdit ? <div><button type="button" onClick={() => setDepartmentMenuOpen((open) => !open)} className="flex w-full min-w-0 items-center justify-between rounded-xl bg-slate-50/70 px-2 py-2 text-left text-xs font-semibold text-[#0b587b] outline-none transition hover:bg-slate-100"><span className="min-w-0 break-words">{selectedDepartments.length ? selectedDepartments.map(categoryLabel).join(", ") : "Select department"}</span><ChevronDown className={cn("ml-2 h-4 w-4 shrink-0 transition", departmentMenuOpen && "rotate-180")} /></button>{departmentMenuOpen && <div className="absolute left-0 top-full z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">{departments.map((department) => <label key={department} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-[#f3f9fc]"><input type="checkbox" checked={selectedDepartments.includes(department)} onChange={() => toggleDepartment(department)} className="h-4 w-4 accent-[#0b587b]" />{categoryLabel(department)}</label>)}<button type="button" onClick={() => setDepartmentMenuOpen(false)} className="mt-1 w-full px-2 pt-2 text-left text-xs font-bold text-[#0b587b]">Done</button></div>}</div> : <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#0b587b]">{selectedDepartments.map((department) => <span key={department}>{categoryLabel(department)}</span>)}</div>}</div>
    <div className="min-w-0">{canEdit ? <textarea rows={2} value={resource.title} onChange={(event) => update({ title: event.target.value })} className="w-full min-w-0 resize-none rounded-xl bg-slate-50/70 px-2 py-2 text-[15px] font-semibold leading-5 tracking-tight text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" /> : <button onClick={() => onOpen(resource)} className="flex w-full min-w-0 items-start justify-between text-left"><p className="min-w-0 whitespace-normal break-words text-[15px] font-semibold leading-5 tracking-tight text-[#14233b] group-hover:text-[#0b587b]">{resource.title}</p><ExternalLink className="ml-2 mt-0.5 h-4 w-4 shrink-0 text-[#0b587b]" /></button>}</div>
    <div className="min-w-0">{canEdit ? <select value={resourceTypeLabel(resource.type)} onChange={(event) => update({ type: event.target.value as KnowledgeResource["type"] })} className="w-full min-w-0 rounded-xl bg-slate-50/70 px-2 py-2 text-xs font-semibold text-[#0b587b] outline-none transition hover:bg-slate-100 focus:bg-white"><option value="Memo">Memo</option><option value="SOP">SOP</option><option value="Guideline">Guideline</option></select> : <span className="text-xs font-semibold text-[#526a80]">{resourceTypeLabel(resource.type)}</span>}</div>
    <div className="min-w-0">{canEdit ? <select value={resource.status || "AKTIF"} onChange={(event) => update({ status: event.target.value as KnowledgeResource["status"] })} className={cn("w-full min-w-0 rounded-xl bg-slate-50/70 px-2 py-2 text-xs font-semibold outline-none transition hover:bg-slate-100 focus:bg-white", resource.status === "TERBATAL" ? "text-rose-700" : "text-emerald-700")}><option value="AKTIF">Active</option><option value="TERBATAL">Not active</option></select> : <span className={cn("text-xs font-semibold", resource.status === "TERBATAL" ? "text-rose-700" : "text-emerald-700")}>{statusLabel(resource.status)}</span>}</div>
    <div className="min-w-0 text-sm font-bold text-[#0b587b]">{canEdit ? <div className="flex min-w-0 flex-col items-start gap-1"><button type="button" onClick={() => onOpen(resource)} className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-lg px-1 py-1 text-xs font-semibold text-[#0b587b] transition hover:bg-[#e8f7fd]">Open memo <ExternalLink className="h-3.5 w-3.5 shrink-0" /></button><span className="text-[11px] font-semibold text-slate-400">Auto-save</span></div> : <span className="lg:hidden">Open memo</span>}</div>
  </div>;
}

function TrainingView({ completedLessons, onOpen }: { completedLessons: string[]; onOpen: (module: TrainingModule) => void }) {
  const totalLessons = trainingModules.reduce((count, module) => count + module.lessons.length, 0);
  const totalPercent = Math.round((completedLessons.length / totalLessons) * 100);
  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <section className="grid gap-6 rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9 lg:grid-cols-[1fr_320px] lg:items-center">
        <div><p className="text-sm font-semibold text-[#67cff4]">Your learning plan</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Learn a little, use it at work.</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Complete modules in priority order. Progress is saved on this device for the prototype.</p></div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-5"><div className="flex justify-between text-sm font-semibold"><span>Overall</span><span>{totalPercent}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#ffc62b]" style={{ width: `${totalPercent}%` }} /></div><p className="mt-3 text-sm text-[#b9cfdd]">{completedLessons.length} of {totalLessons} lessons completed</p></div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">{trainingModules.map((module) => <div key={module.id}><TrainingCard module={module} completedLessons={completedLessons} onOpen={() => onOpen(module)} large /></div>)}</div>
    </div>
  );
}

type PanelAvailability = "" | "Kajang" | "Seri Kembangan";
type PanelTrainingRow = { id: string; panel: string; availability: PanelAvailability; guideUrl: string; portalUrl: string };

const panelTrainingDriveUrl = "https://drive.google.com/drive/folders/1nvJW1koDXL0dqfeCkKy1K-K0BFmEaVhr?usp=share_link";
const defaultPanelTrainingRows: PanelTrainingRow[] = [
  { id: "healthconnect", panel: "HealthConnect", availability: "", guideUrl: "https://drive.google.com/file/d/1xI8S_EOJxrGT3X74So9t7dbDTimSny45/preview", portalUrl: "" },
  { id: "hukm", panel: "HUKM", availability: "", guideUrl: "https://drive.google.com/file/d/145h4ltrl8bw4dyQ9bMxrqbp3tw1zuRD_/preview", portalUrl: "" },
  { id: "ia", panel: "IA", availability: "", guideUrl: "https://drive.google.com/file/d/1FwlkKs6sRwqwOBwqfY8KBcfxX-PU0uWH/preview", portalUrl: "" },
  { id: "mesas2u", panel: "MESAS2U", availability: "", guideUrl: "https://drive.google.com/file/d/10sUNL6G45RRhdNpQ6Z_7tDjCzNQPmT_f/preview", portalUrl: "" },
  { id: "great-eastern", panel: "Great Eastern", availability: "", guideUrl: "https://drive.google.com/file/d/1x2Q7HlLAtm92MXzEcUaNeq9LNg9p1l9g/preview", portalUrl: "" },
];

function panelEmbedUrl(url: string) {
  const fileMatch = url.match(/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  return url.includes("/folders/") ? "" : url;
}

function PanelTrainingView({ canEdit, sync }: { canEdit: boolean; sync: ReturnType<typeof usePanelSync> }) {
  const [rows, setRows] = useState<PanelTrainingRow[]>(() => {
    const saved = readLocal<PanelTrainingRow[]>("ara_panel_training", []);
    const legacy = [
      ["aia", "AIA", "Kajang"], ["healthmetrics", "HealthMetrics", "Seri Kembangan"],
      ["pmcare", "PMCare", "Kajang"], ["micare", "MiCare", "Seri Kembangan"],
    ];
    // Replace untouched demo rows, retaining any records the admin has edited.
    const retained = saved.filter((row) => !legacy.some(([id, panel, branch]) =>
      row.id === id && row.panel === panel && row.availability === branch &&
      row.guideUrl === panelTrainingDriveUrl && !row.portalUrl));
    return [...retained, ...defaultPanelTrainingRows.filter((row) => !retained.some((item) => item.id === row.id))];
  });
  const [selectedPanel, setSelectedPanel] = useState<{ row: PanelTrainingRow; kind: "guide" | "portal" } | null>(null);
  useEffect(() => {
    if (!sync.files.length) return;
    setRows((current) => {
      const added = sync.files.filter((file) => !current.some((row) => row.id === `drive-${file.id}` || row.guideUrl.includes(`/d/${file.id}/`)));
      if (!added.length) return current;
      const next: PanelTrainingRow[] = [...current, ...added.map((file) => ({ id: `drive-${file.id}`, panel: file.name.replace(/\.pdf$/i, '').replace(/_/g, ' '), availability: '' as PanelAvailability, guideUrl: file.url, portalUrl: '' }))];
      localStorage.setItem('ara_panel_training', JSON.stringify(next));
      return next;
    });
  }, [sync.files]);
  const updateRow = (id: string, patch: Partial<PanelTrainingRow>) => {
    const next = rows.map((row) => row.id === id ? { ...row, ...patch } : row);
    setRows(next);
    localStorage.setItem("ara_panel_training", JSON.stringify(next));
  };

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
      <span role="status">{sync.error || (sync.realtimeEnabled ? (sync.connected ? 'Live guide updates connected' : 'Connecting to live updates…') : sync.checking ? 'Checking for new guides…' : sync.checkedAt ? `Last checked ${new Date(sync.checkedAt).toLocaleTimeString()} · Checked when you open Panel Training` : 'Select Check now to check for new guides.')}</span>
      <button onClick={sync.refresh} disabled={sync.checking} className="shrink-0 rounded-lg bg-white px-3 py-2 font-semibold text-[#0b587b] disabled:opacity-50">Check now</button>
    </div>
    {sync.alerts.length > 0 && <section aria-label="New panel guides" className="rounded-2xl bg-sky-50 p-5">
      <h3 className="text-sm font-semibold text-[#0b3d59]">New panel guides added ({sync.alerts.length})</h3>
      <div className="mt-3 space-y-3">{sync.alerts.map((file) => <div key={file.id} className="flex items-center justify-between gap-4">
        <button className="text-left text-sm text-[#0b587b] hover:underline" onClick={() => setSelectedPanel({ row: rows.find((row) => row.guideUrl.includes(`/d/${file.id}/`)) || { id: `drive-${file.id}`, panel: file.name, availability: '', guideUrl: file.url, portalUrl: '' }, kind: 'guide' })}>{file.name}</button>
        <button aria-label={`Dismiss alert for ${file.name}`} onClick={() => sync.dismiss(file.id)} className="shrink-0 rounded-lg px-3 py-2 text-xs text-slate-500 hover:bg-white">Dismiss</button>
      </div>)}</div>
    </section>}
    <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Panel operations</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Panel Training</h2><p className="mt-2 max-w-2xl leading-7 text-[#b9cfdd]">Quick references for panel workflows, availability and portal access by branch.</p></div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-[14px] bg-white/10 px-4 py-3 text-sm font-semibold text-[#d8edf6]"><BookOpen className="h-4 w-4" />Direct document links</span>
      </div>
    </section>
    <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-500">{rows.length} panels listed</p><p className="mt-1 text-xs text-slate-400">Open a panel guide to read its document here.</p></div><span className="rounded-full bg-[#e8f7fd] px-3 py-1.5 text-xs font-bold text-[#0b587b]">Staff reference</span></div>
    <section className="overflow-hidden rounded-[24px] border border-[#dce4ed] bg-white shadow-[0_12px_30px_rgba(16,54,78,0.06)]">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] table-fixed text-left"><thead className="bg-[#f7fafc]"><tr className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400"><th className="w-[25%] px-6 py-4">Panel name</th><th className="w-[20%] px-6 py-4">Availability</th><th className="w-[27.5%] px-6 py-4">Panel guide</th><th className="w-[27.5%] px-6 py-4">Panel portal</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="transition hover:bg-[#f8fcfe]"><td className="px-6 py-5 align-middle">{canEdit ? <input value={row.panel} onChange={(event) => updateRow(row.id, { panel: event.target.value })} className="w-full rounded-xl bg-slate-50/70 px-3 py-2 text-[15px] font-semibold text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" /> : <span className="text-[15px] font-semibold text-[#14233b]">{row.panel}</span>}</td><td className="px-6 py-5 align-middle">{canEdit ? <select value={row.availability} onChange={(event) => updateRow(row.id, { availability: event.target.value as PanelAvailability })} className="rounded-xl bg-slate-50/70 px-3 py-2 text-sm font-semibold text-[#0b587b] outline-none transition hover:bg-slate-100 focus:bg-white"><option value="">Select location</option><option>Kajang</option><option>Seri Kembangan</option></select> : <span className="inline-flex rounded-full bg-[#eef8fc] px-3 py-1.5 text-xs font-bold text-[#0b587b]">{row.availability || "Not assigned"}</span>}</td><td className="px-6 py-5 align-middle">{canEdit ? <div className="space-y-2"><details><summary className="cursor-pointer text-xs text-slate-400">Edit guide link</summary><input value={row.guideUrl} onChange={(event) => updateRow(row.id, { guideUrl: event.target.value })} placeholder="Paste direct Drive file URL" className="w-full rounded-xl bg-slate-50/70 px-3 py-2 text-xs text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" /></details>{row.guideUrl && !row.guideUrl.includes("/folders/") && <button type="button" onClick={() => setSelectedPanel({ row, kind: "guide" })} className="inline-flex items-center gap-2 text-xs font-semibold text-[#0b587b] hover:text-[#0071e3]"><BookOpen className="h-4 w-4 text-[#20aee0]" />Open panel guide<ExternalLink className="h-3.5 w-3.5" /></button>}</div> : row.guideUrl && !row.guideUrl.includes("/folders/") ? <button type="button" onClick={() => setSelectedPanel({ row, kind: "guide" })} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b] transition hover:text-[#0071e3]"><BookOpen className="h-4 w-4 text-[#20aee0]" />Open panel guide<ExternalLink className="h-3.5 w-3.5" /></button> : <span className="text-sm text-slate-400">Direct guide link to be added</span>}</td><td className="px-6 py-5 align-middle">{canEdit ? <div className="space-y-2"><input value={row.portalUrl} onChange={(event) => updateRow(row.id, { portalUrl: event.target.value })} placeholder="Paste portal URL" className="w-full rounded-xl bg-slate-50/70 px-3 py-2 text-xs text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" />{row.portalUrl && <button type="button" onClick={() => setSelectedPanel({ row, kind: "portal" })} className="inline-flex items-center gap-2 text-xs font-semibold text-[#0b587b] hover:text-[#0071e3]">Open panel portal<ExternalLink className="h-3.5 w-3.5" /></button>}</div> : row.portalUrl ? <button type="button" onClick={() => setSelectedPanel({ row, kind: "portal" })} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b] hover:text-[#0071e3]">Open panel portal<ExternalLink className="h-3.5 w-3.5" /></button> : <span className="text-sm text-slate-400">Portal link to be added</span>}</td></tr>)}</tbody></table></div>
    </section>
    {selectedPanel && <PanelTrainingModal row={selectedPanel.row} kind={selectedPanel.kind} onClose={() => setSelectedPanel(null)} />}
  </div>;
}

function PanelTrainingModal({ row, kind, onClose }: { row: PanelTrainingRow; kind: "guide" | "portal"; onClose: () => void }) {
  const url = kind === "guide" ? row.guideUrl : row.portalUrl;
  return <ModalShell onClose={onClose} wide><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Panel training</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{row.panel} · {kind === "guide" ? "Panel guide" : "Panel portal"}</h2><p className="mt-2 text-sm text-slate-500">{row.availability} · Official AraSpace reference</p></div><button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><iframe title={`${row.panel} ${kind}`} src={panelEmbedUrl(url)} className="h-[62vh] min-h-[480px] w-full" /></div><div className="mt-5 flex items-center justify-between gap-4"><p className="text-xs leading-5 text-slate-500">This reference opens inside AraSpace. Use the official source for the latest version.</p><a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-[#0b587b] hover:text-[#0071e3]">Open source <ExternalLink className="inline h-3.5 w-3.5" /></a></div></ModalShell>;
}

function AnnouncementsView() {
  return <div className="mx-auto max-w-[1500px] space-y-6"><section className="rounded-[30px] bg-[#0b3d59] p-8 text-white"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Team updates</p><h2 className="mt-2 text-3xl font-semibold">Announcements</h2><p className="mt-2 text-[#b9cfdd]">Operational changes and information staff need to know.</p></section>{announcementsSeed.map((item) => <article key={item.id} className={cn("rounded-[24px] border bg-white p-6 sm:p-7", item.priority === "Penting" ? "border-rose-200" : "border-[#dce4ed]")}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-4"><div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", item.priority === "Penting" ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-600")}><Bell className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold">{item.title}</p>{item.priority === "Penting" && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-rose-700">Important</span>}</div><p className="mt-2 leading-7 text-slate-600">{item.body}</p></div></div><div className="shrink-0 text-sm text-slate-400 sm:text-right"><p className="font-bold text-slate-600">{item.date}</p><p className="mt-1 text-xs">{item.audience}</p></div></div></article>)}</div>;
}

function LinksView() {
  return <div className="mx-auto max-w-[1500px]"><section className="mb-6 rounded-[30px] bg-[#0b3d59] p-8 text-white"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Quick access</p><h2 className="mt-2 text-3xl font-semibold">Important links</h2><p className="mt-2 text-[#b9cfdd]">Systems and forms used in daily operations.</p></section><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{quickLinks.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="group rounded-[24px] bg-[#0b3d59] p-6 text-white transition hover:-translate-y-0.5 hover:bg-[#104b6c]"><div className="flex items-center justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#67cff4]"><Link2 className="h-5 w-5" /></div><ExternalLink className="h-5 w-5 text-[#8eb2c6] group-hover:text-white" /></div><h3 className="mt-5 text-xl font-semibold">{link.title}</h3><p className="mt-2 text-sm text-[#b9cfdd]">{link.description}</p><p className="mt-5 text-xs font-bold uppercase tracking-wider text-[#67cff4]">{link.group}</p></a>)}</div><p className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">These are starter links. An admin can replace them with the organisation's live links before publishing.</p></div>;
}

function AdminView({ staff, onAddStaff }: { staff: PortalUser[]; onAddStaff: (staff: PortalUser) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <section className="flex flex-col gap-5 rounded-[30px] bg-[#0b3d59] p-8 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Portal administration</p><h2 className="mt-2 text-3xl font-semibold">Staff accounts & access</h2><p className="mt-2 text-[#b9cfdd]">Manage one account per staff member and assign branch access.</p></div><button onClick={() => setAdding(true)} className="flex items-center justify-center gap-2 rounded-[14px] bg-white px-5 py-3 text-sm font-bold text-[#0b3d59]"><UserPlus className="h-4 w-4" />Invite staff</button></section>
      <div className="grid gap-4 sm:grid-cols-2"><StatCard icon={<Users />} label="Staff count" value={staff.length.toString()} note="Including administrators" color="sky" /><StatCard icon={<GraduationCap />} label="Training modules" value={trainingModules.length.toString()} note="3 required modules" color="emerald" /></div>
      <section className="rounded-[24px] border border-[#dce4ed] bg-white p-6 shadow-[0_12px_30px_rgba(16,54,78,0.05)] sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-semibold">Staff accounts & access</h2><p className="mt-1 text-sm text-slate-500">Each staff member uses one account. All actions are traceable by name.</p></div><button onClick={() => setAdding(true)} className="flex items-center justify-center gap-2 rounded-xl bg-[#0b587b] px-5 py-3 text-sm font-bold text-white"><UserPlus className="h-4 w-4" />Invite staff</button></div>
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><th className="py-3">Name</th><th>Email</th><th>Branch</th><th>Role</th><th>Status</th><th>Activity</th></tr></thead><tbody>{staff.map((member) => <tr key={member.email} className="border-b border-slate-100 last:border-0"><td className="py-4"><div className="flex items-center gap-3"><Avatar name={member.fullName} /><div><span className="font-bold">{member.fullName}</span><p className="mt-0.5 text-xs text-slate-400">{member.department}</p></div></div></td><td className="text-sm text-slate-500">{member.email}</td><td className="text-sm font-semibold text-slate-600">{member.branch}</td><td><span className={cn("rounded-full px-3 py-1 text-xs font-bold", member.role === "Superadmin" ? "bg-violet-50 text-violet-700" : member.role === "Supervisor" ? "bg-emerald-50 text-emerald-700" : member.role === "ContentEditor" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700")}>{roleLabel(member.role)}</span></td><td><span className={cn("inline-flex items-center gap-1.5 text-sm font-bold", member.status === "invited" ? "text-amber-600" : member.status === "inactive" ? "text-slate-400" : "text-emerald-600")}><span className="h-2 w-2 rounded-full bg-current" />{member.status === "invited" ? "Invited" : member.status === "inactive" ? "Inactive" : "Active"}</span></td><td className="text-xs text-slate-400">{member.lastActive || "Not logged in"}</td></tr>)}</tbody></table></div>
      </section>
      {adding && <AddStaffModal onClose={() => setAdding(false)} onAdd={(member) => { onAddStaff(member); setAdding(false); }} />}
    </div>
  );
}

function ResourceAdminModal({ resource, onClose, onSave }: { resource: KnowledgeResource; onClose: () => void; onSave: (resource: KnowledgeResource) => void }) {
  const [title, setTitle] = useState(resource.title); const [date, setDate] = useState(resource.updatedAt === "Belum diekstrak" ? "" : resource.updatedAt); const [department, setDepartment] = useState(resource.category.split(" / ").map((part) => part.trim()).filter(Boolean)); const [status, setStatus] = useState<NonNullable<KnowledgeResource["status"]>>(resource.status || "AKTIF");
  return <ModalShell onClose={onClose}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Admin memo</p><h2 className="mt-2 text-2xl font-semibold">Edit metadata</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" aria-label="Tutup"><X className="h-5 w-5" /></button></div><form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); onSave({ ...resource, title, updatedAt: date || "Belum diekstrak", category: department.join(" / "), status }); }}><Field label="Tarikh memo dikeluarkan"><input value={date} onChange={(event) => setDate(event.target.value)} placeholder="Contoh: 4/12/2025" className="portal-input" /></Field><Field label="Jabatan / pemilik memo"><select multiple size={4} value={department} onChange={(event) => setDepartment([...event.target.selectedOptions].map((option: HTMLOptionElement) => option.value))} className="portal-input"><option>Kewangan</option><option>Sumber Manusia</option><option>Operasi</option><option>Kualiti</option></select><span className="mt-1 block text-xs text-slate-400">Gunakan Command/Ctrl untuk pilih lebih daripada satu.</span></Field><Field label="Tajuk memo"><input value={title} onChange={(event) => setTitle(event.target.value)} className="portal-input" /></Field><Field label="Status"><select value={status} onChange={(event) => setStatus(event.target.value as NonNullable<KnowledgeResource["status"]>)} className="portal-input"><option value="AKTIF">AKTIF</option><option value="TERBATAL">TERBATAL</option></select></Field><div className="flex justify-end gap-3 pt-3"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold">Batal</button><button className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white">Simpan perubahan</button></div></form></ModalShell>;
}

function AddStaffModal({ onClose, onAdd }: { onClose: () => void; onAdd: (user: PortalUser) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [department, setDepartment] = useState(""); const [branch, setBranch] = useState("Kajang"); const [role, setRole] = useState<PortalUser["role"]>("Staff");
  return <ModalShell onClose={onClose}><h2 className="text-2xl font-semibold">Invite staff</h2><p className="mt-2 text-sm text-slate-500">Staff will receive an individual account with the selected access.</p><form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); onAdd({ fullName: name, email, department, branch, role, status: "invited", lastActive: "Invitation not accepted" }); }}><Field label="Full name"><input required value={name} onChange={(event) => setName(event.target.value)} className="portal-input" /></Field><Field label="Work email"><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="portal-input" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Department"><input required value={department} onChange={(event) => setDepartment(event.target.value)} className="portal-input" /></Field><Field label="Branch"><select value={branch} onChange={(event) => setBranch(event.target.value)} className="portal-input"><option>Kajang</option><option>Seri Kembangan</option><option>Semenyih</option><option>All branches</option></select></Field></div><Field label="Role"><select value={role} onChange={(event) => setRole(event.target.value as PortalUser["role"])} className="portal-input"><option value="Staff">Staff</option><option value="Supervisor">Supervisor</option><option value="ContentEditor">Content editor</option><option value="Superadmin">Full administrator</option></select></Field><div className="flex justify-end gap-3 pt-3"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold">Cancel</button><button className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white">Send invitation</button></div></form></ModalShell>;
}

function roleLabel(role: PortalUser["role"]) {
  return { Superadmin: "Admin", Supervisor: "Supervisor", ContentEditor: "Editor", Staff: "Staff" }[role];
}

function ResourceModal({ resource, isRead, onClose, onMarkRead }: { resource: KnowledgeResource; isRead: boolean; onClose: () => void; onMarkRead: () => void }) {
  return <ModalShell onClose={onClose} wide><div className="flex items-start justify-between gap-4"><div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-700">{resource.type}</span><h2 className="mt-4 text-3xl font-semibold tracking-tight">{resource.title}</h2><p className="mt-3 text-slate-500">{resource.summary}</p></div><button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-6 flex flex-wrap gap-3 border-y border-slate-100 py-4 text-sm text-slate-500"><span>{resource.category}</span><span>•</span><span>{resource.readTime} min read</span><span>•</span><span>Updated {resource.updatedAt === "Belum diekstrak" ? "Date not extracted" : resource.updatedAt}</span></div>{resource.sourceUrl ? <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><iframe title={resource.title} src={resource.sourceUrl} className="h-[62vh] min-h-[480px] w-full" /></div> : <div className="mt-6 space-y-4">{resource.content.map((paragraph, index) => <p key={index} className="text-base leading-8 text-slate-700">{paragraph}</p>)}</div>}<div className="mt-7 rounded-2xl bg-amber-50 p-4 text-sm leading-6 text-amber-800"><strong>Note:</strong> This official document is displayed from AraSihat Drive. Always refer to the latest published version.</div></ModalShell>;
}

function TrainingModal({ module, completedLessons, onToggleLesson, onClose }: { module: TrainingModule; completedLessons: string[]; onToggleLesson: (id: string) => void; onClose: () => void }) {
  const done = module.lessons.filter((lesson) => completedLessons.includes(lesson.id)).length; const percent = Math.round((done / module.lessons.length) * 100);
  return <ModalShell onClose={onClose} wide><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-[#0071e3]">{module.category} · {module.duration} min</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{module.title}</h2><p className="mt-3 leading-7 text-slate-500">{module.description}</p></div><button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-6"><div className="flex justify-between text-sm font-bold"><span>Module progress</span><span>{percent}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0071e3]" style={{ width: `${percent}%` }} /></div></div><div className="mt-7 space-y-3">{module.lessons.map((lesson, index) => { const complete = completedLessons.includes(lesson.id); return <button key={lesson.id} onClick={() => onToggleLesson(lesson.id)} className={cn("flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition", complete ? "border-emerald-200 bg-emerald-50" : "border-slate-200 hover:border-[#0071e3]/30")}><div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold", complete ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500")}>{complete ? <Check className="h-4 w-4" /> : index + 1}</div><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{lesson.title}</p><span className="text-xs text-slate-400">{lesson.duration} min</span></div><p className="mt-1 text-sm leading-6 text-slate-500">{lesson.content}</p></div></button>; })}</div><p className="mt-5 text-center text-xs text-slate-400">Click each lesson after reading. Assessment quizzes will be added once the content is approved.</p></ModalShell>;
}

function TrainingCard({ module, completedLessons, onOpen, large = false }: { module: TrainingModule; completedLessons: string[]; onOpen: () => void; large?: boolean }) {
  const done = module.lessons.filter((lesson) => completedLessons.includes(lesson.id)).length; const percent = Math.round((done / module.lessons.length) * 100);
  return <button onClick={onOpen} className={cn("group rounded-[22px] border border-[#dce4ed] bg-white p-6 text-left shadow-[0_10px_28px_rgba(16,54,78,0.04)] transition hover:-translate-y-0.5 hover:border-[#0b587b]/35 hover:shadow-[0_18px_38px_rgba(16,54,78,0.09)]", large && "sm:p-7")}><div className="flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#e8f7fd] text-[#0b587b]"><GraduationCap className="h-6 w-6" /></div>{module.required && <span className="rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold uppercase text-rose-700">Required</span>}</div><p className="mt-5 text-xs font-bold uppercase tracking-wider text-[#0b587b]">{module.category}</p><h3 className="mt-2 text-xl font-semibold tracking-tight group-hover:text-[#0b587b]">{module.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{module.description}</p><div className="mt-6 flex items-center justify-between text-xs font-bold text-slate-500"><span>{done}/{module.lessons.length} lessons</span><span>{percent}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0b587b]" style={{ width: `${percent}%` }} /></div></button>;
}

function StatCard({ icon, label, value, note, color }: { icon: ReactNode; label: string; value: string; note: string; color: "sky" | "teal" | "emerald" | "rose" }) {
  const colors = { sky: "bg-[#e9f8fe] text-[#079bd3]", teal: "bg-[#e9fbf4] text-[#08a66a]", emerald: "bg-[#edf9f2] text-[#08a66a]", rose: "bg-[#e8f7fd] text-[#0b587b]" };
  return <div className="rounded-[20px] border border-[#dce4ed] bg-white p-5 shadow-[0_10px_28px_rgba(16,54,78,0.04)]"><div className={cn("grid h-11 w-11 place-items-center rounded-2xl [&>svg]:h-5 [&>svg]:w-5", colors[color])}>{icon}</div><p className="mt-4 text-sm font-bold text-slate-500">{label}</p><p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div>;
}

function SectionHeader({ title, action, onAction }: { title: string; action: string; onAction: () => void }) { return <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold tracking-tight">{title}</h2><button onClick={onAction} className="flex items-center gap-1 text-sm font-bold text-[#0b587b]">{action}<ChevronRight className="h-4 w-4" /></button></div>; }
function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <div className="mt-6 flex flex-col items-center rounded-[22px] border border-dashed border-slate-300 bg-white py-20 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400 [&>svg]:h-6 [&>svg]:w-6">{icon}</div><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
function Avatar({ name, dark = false }: { name: string; dark?: boolean }) { const initials = name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(); return <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold", dark ? "bg-white/15 text-white" : "bg-[#e9f8fe] text-[#076b91]")}>{initials}</div>; }
function LogoMark() { return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/20 bg-white/10 text-[#70d8fa]"><BookOpen className="h-6 w-6" /></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
function ModalShell({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) { return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}><div role="dialog" aria-modal="true" className={cn("max-h-[90vh] w-full overflow-y-auto rounded-[22px] bg-white p-6 shadow-2xl sm:p-8", wide ? "max-w-3xl" : "max-w-lg")} onMouseDown={(event) => event.stopPropagation()}>{children}</div></div>; }
