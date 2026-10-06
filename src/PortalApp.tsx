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
  KnowledgeBaseUpdate,
  knowledgeResources,
  knowledgeUpdates,
  PortalUser,
  quickLinks,
  trainingModules,
  TrainingModule,
} from "./portalData";
import { cn } from "./lib/utils";
import { isSupabaseConfigured, signInWithSupabase, signOutSupabase } from "./lib/supabase";
import ShiftHandoverView, { shiftGuides, ShiftGuides } from "./ShiftHandover";
import { usePanelTraining } from "./lib/usePanelTraining";
import { useCaPortalState } from "./lib/useCaPortalState";
import { useSharedReferences } from "./lib/useSharedReferences";
import { KnowledgeView, ModalShell, ResourceModal } from "./ReferenceHub";

type View = "home" | "handover" | "knowledge" | "training" | "panelTraining" | "services" | "announcements" | "links" | "admin";


const viewTitles: Record<View, string> = {
  home: "Home",
  handover: "Shift Passover",
  knowledge: "Reference Hub",
  training: "My Training",
  panelTraining: "Panel Training",
  services: "Our Services",
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

type Service = [string, string];
type CaWorkspaceContent = {
  resources: KnowledgeResource[];
  knowledgeUpdates: KnowledgeBaseUpdate[];
  trainingModules: TrainingModule[];
  announcements: Announcement[];
  links: typeof quickLinks;
  services: Service[];
  panelRows: PanelTrainingRow[];
  shiftGuides: ShiftGuides;
};
type CaPersonalContent = { completedLessons: string[]; readResources: string[] };

const caWorkspaceDefaults = (): CaWorkspaceContent => ({
  resources: readLocal<KnowledgeResource[]>("ara_portal_resources", knowledgeResources),
  knowledgeUpdates,
  trainingModules,
  announcements: announcementsSeed,
  links: quickLinks,
  services: serviceSeed,
  panelRows: defaultPanelTrainingRows,
  shiftGuides,
});

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
  const workspace = useCaPortalState<CaWorkspaceContent>(caWorkspaceDefaults(), user?.email, user?.role === "Superadmin");
  const personal = useCaPortalState<CaPersonalContent>({ completedLessons: [], readResources: [] }, user?.email, true, "personal");
  const references = useSharedReferences(workspace.data.resources, user?.email, user?.role === "Superadmin", (saved, message) => { setToastError(!saved); setToast(message); });
  const content = { ...workspace.data, resources: references.resources };
  const completedLessons = personal.data.completedLessons;
  const readResources = personal.data.readResources;
  const [staff, setStaff] = useState<PortalUser[]>(() => readLocal<PortalUser[]>("ara_portal_staff", demoStaff).map(normalizeUser));
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState(false);
  const panelTraining = usePanelTraining(personal.ready && view === 'panelTraining', user?.role === "Superadmin");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToast(""); setToastError(false); }, toastError ? 6000 : 2600);
    return () => window.clearTimeout(timer);
  }, [toast, toastError]);

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
    void personal.save({ ...personal.data, completedLessons: next });
  };

  const markResourceRead = (resourceId: string) => {
    if (!user || readResources.includes(resourceId)) return;
    const next = [...readResources, resourceId];
    void personal.save({ ...personal.data, readResources: next });
    setToast("Marked as read");
  };

  const addStaff = (newStaff: PortalUser) => {
    const next = [...staff, newStaff];
    setStaff(next);
    localStorage.setItem("ara_portal_staff", JSON.stringify(next));
    setToast("Staff added to the prototype");
  };

  const updateResource = references.update;

  if (!user) return <LoginScreen onLogin={login} />;

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#14233b]">
      <Sidebar
        panelAlertCount={panelTraining.guides.filter((guide) => guide.status === 'pending').length}
        user={user}
        view={view}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onNavigate={navigate}
        onLogout={logout}
      />

      <div className="min-h-screen lg:pl-[300px]">
        {adminAccount?.role === "Superadmin" && (
          <div className="border-b border-[#dce4ed] bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-[38px]">
            <div className="mx-auto flex max-w-[1500px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b9aca]">System Admin preview</p>
                <p className="mt-0.5 text-sm font-semibold text-[#29465a]">
                  {workspaceMode === "admin" ? "Administrator controls are enabled" : "Viewing the portal as Clinic Assistants"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl bg-[#f1f5f7] p-1 ring-1 ring-[#dce4ed]">
                  <button onClick={() => switchWorkspaceMode("admin")} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${workspaceMode === "admin" ? "bg-[#0b587b] text-white shadow-sm" : "text-slate-500 hover:text-[#0b587b]"}`}>Admin View</button>
                  <button onClick={() => switchWorkspaceMode("staff")} className={`rounded-lg px-4 py-2 text-xs font-bold transition ${workspaceMode === "staff" ? "bg-[#0b587b] text-white shadow-sm" : "text-slate-500 hover:text-[#0b587b]"}`}>Staff View</button>
                </div>
                <button onClick={() => { localStorage.removeItem("ara_view_mode"); window.location.hash = "#office/admin"; }} className="rounded-xl border border-[#dce4ed] bg-white px-4 py-2.5 text-xs font-bold text-[#0b587b] transition hover:border-[#0b587b]/30 hover:bg-[#f7fafb]">Control Centre</button>
              </div>
            </div>
          </div>
        )}
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
              <Avatar name="Clinic Assistants" />
              <div className="hidden text-left sm:block">
                <p className="text-sm font-bold leading-tight">Clinic Assistants</p>
                <p className="text-xs text-slate-500">AraSpace portal</p>
              </div>
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-[38px]">
          {view === "home" && (
            <HomeView
              onNavigate={navigate}
              onOpenResource={setSelectedResource}
              search={globalSearch}
              setSearch={setGlobalSearch}
              announcements={content.announcements}
              resources={content.resources}
              knowledgeUpdates={content.knowledgeUpdates || []}
            />
          )}
          {view === "handover" && <ShiftHandoverView guides={content.shiftGuides} />}
          {view === "knowledge" && (
            <KnowledgeView
              initialSearch={globalSearch}
              readResources={readResources}
              onOpen={setSelectedResource}
              resources={content.resources}
              canEdit={user.role === "Superadmin"}
              onUpdateResource={updateResource}
              onCommit={references.saveNow}
              onSyncDrive={references.syncDrive}
              syncing={references.syncing}
              pendingMemos={references.pendingMemos}
              onApprovePendingMemo={references.approvePendingMemo}
            />
          )}
          {view === "training" && (
            <TrainingView modules={content.trainingModules} completedLessons={completedLessons} onOpen={setSelectedModule} />
          )}
          {view === "panelTraining" && <PanelTrainingView training={panelTraining} canEdit={user.role === "Superadmin"} />}
          {view === "services" && <OurServicesView services={content.services} />}
          {view === "announcements" && <AnnouncementsView announcements={content.announcements} />}
          {view === "links" && <LinksView links={content.links} />}
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
          {toastError ? <AlertCircle className="h-5 w-5 text-rose-400" /> : <CheckCircle2 className="h-5 w-5 text-emerald-400" />} {toast}
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
    { id: "panelTraining", label: "Panel Training", icon: BookOpen },
    { id: "services", label: "Our Services", icon: Sparkles },
    { id: "announcements", label: "Announcements", icon: Bell },
    { id: "links", label: "Important Links", icon: Link2 },
  ];

  return (
    <>
      {open && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-[300px] flex-col border-r border-white/10 bg-[#083a55] p-6 text-white transition-transform duration-300 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center justify-between px-2 py-3">
          <div className="flex items-center gap-3"><LogoMark /><div><p className="font-semibold tracking-tight">ARASPACE</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#70d8fa]">Clinic Assistants</p></div></div>
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
          <div className="flex items-center gap-3"><Avatar name="Clinic Assistants" dark /><div className="min-w-0"><p className="truncate text-sm font-semibold">Clinic Assistants</p><p className="truncate text-xs text-[#9bb5c7]">AraSpace portal</p></div></div>
          <button onClick={onLogout} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-[#b5cad8] transition hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </aside>
    </>
  );
}

type HomeProps = { onNavigate: (view: View) => void; onOpenResource: (resource: KnowledgeResource) => void; search: string; setSearch: (value: string) => void; announcements: Announcement[]; resources: KnowledgeResource[]; knowledgeUpdates: KnowledgeBaseUpdate[] };
type HomeDestination = { label: string; note: string; icon: typeof Home; view?: View; resource?: KnowledgeResource; tone: string };

function HomeView({ onNavigate, onOpenResource, search, setSearch, announcements, resources, knowledgeUpdates }: HomeProps) {
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" }).format(new Date());
  const quickAccess: HomeDestination[] = [
    { label: "Shift Passover", note: "Templates & guides", icon: ClipboardCheck, view: "handover", tone: "text-[#7258ff]" },
    { label: "Reference Hub", note: "SOPs & work guides", icon: Library, view: "knowledge", tone: "text-[#20c7f4]" },
    { label: "Panel Training", note: "Panel workflows & guides", icon: BookOpen, view: "panelTraining", tone: "text-emerald-400" },
    { label: "Our Services", note: "Clinic services", icon: Sparkles, view: "services", tone: "text-[#ffb000]" },
    { label: "Important Links", note: "Work systems", icon: Link2, view: "links", tone: "text-[#20c7f4]" },
  ];
  const findResource = (terms: string[]) => resources.find((resource) => terms.some((term) => `${resource.title} ${resource.category} ${resource.keywords.join(" ")}`.toLowerCase().includes(term)));
  const commonlyNeeded = [
    { label: "Shift passover template", note: "AM & PM daily guides", icon: ClipboardCheck, view: "handover" as View },
    { label: "Panel patient workflow", note: "Registration & panel reference", icon: BookOpen, resource: findResource(["panel", "arapanel"]) },
    { label: "Complaint escalation", note: "Patient complaint process", icon: AlertCircle, resource: findResource(["complaint", "aduan"]) },
    { label: "Plato guide", note: "Daily system reference", icon: FileText, resource: findResource(["plato"]) },
    { label: "Clinic services reference", note: "Service overview", icon: Sparkles, view: "services" as View },
    { label: "Important work systems", note: "Systems & useful links", icon: Link2, view: "links" as View },
  ].filter((item) => item.view || item.resource);
  const importantAnnouncement = announcements.find((announcement) => announcement.priority === "Penting");
  const openDestination = (item: HomeDestination) => item.resource ? onOpenResource(item.resource) : item.view && onNavigate(item.view);

  return <div className="mx-auto max-w-[1500px] space-y-8">
    <section className="rounded-[30px] bg-[#0b3d59] px-7 py-9 text-white sm:px-10 lg:px-12">
      <div className="flex flex-col gap-7 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · Clinic Assistants</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-[2.45rem]">Welcome, Clinic Assistants</h2><p className="mt-3 text-base text-[#bed2df]">References and everyday work guides in one workspace.</p></div><div className="text-left md:text-right"><span className="inline-flex rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold capitalize text-[#d9e7ef]">{today}</span><p className="mt-4 text-sm italic text-[#a9c1d0]">“Clear at work. Confident at handover.”</p></div></div>
    </section>

    <SearchAraSpace search={search} setSearch={setSearch} onSearch={() => onNavigate("knowledge")} />

    <section><SectionHeading title="Quick access" eyebrow="Shortcuts" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{quickAccess.map((item) => <button key={item.label} onClick={() => openDestination(item)} className="group min-h-[132px] rounded-[24px] bg-[#0b3d59] p-5 text-left text-white transition hover:-translate-y-0.5 hover:bg-[#104b6c]"><div className="flex items-center justify-between"><span className={cn("grid h-10 w-10 place-items-center rounded-full bg-white/10", item.tone)}><item.icon className="h-5 w-5" /></span><ArrowRight className="h-4 w-4 text-[#9bc8da] transition group-hover:translate-x-1" /></div><p className="mt-5 font-semibold">{item.label}</p><p className="mt-1 text-xs text-[#9fb8c7]">{item.note}</p></button>)}</div></section>

    <section><SectionHeading title="Commonly needed" eyebrow="Everyday resources" /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{commonlyNeeded.map((item) => <button key={item.label} onClick={() => item.resource ? onOpenResource(item.resource) : item.view && onNavigate(item.view)} className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#dce4ed] bg-white p-4 text-left transition hover:border-[#8cdbf7] hover:bg-[#f9fcfe]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf9fe] text-[#0b587b]"><item.icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#14233b]">{item.label}</span><span className="mt-0.5 block truncate text-xs text-[#60758c]">{item.note}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#0b587b]" /></button>)}</div></section>

    <LatestUpdates updates={knowledgeUpdates} resources={resources} onNavigate={onNavigate} onOpenResource={onOpenResource} />

    {importantAnnouncement && <section className="rounded-[28px] border border-rose-100 bg-white p-6 sm:p-7"><div className="flex items-center gap-2 text-[#f04464]"><span className="h-2 w-2 rounded-full bg-[#f04464]" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Important announcement</span></div><h3 className="mt-4 text-xl font-semibold">{importantAnnouncement.title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{importantAnnouncement.body}</p><button onClick={() => onNavigate("announcements")} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0b587b]">View all announcements <ArrowRight className="h-4 w-4" /></button></section>}
  </div>;
}

function SectionHeading({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><h3 className="text-2xl font-semibold tracking-tight">{title}</h3><span className="text-right text-xs font-bold uppercase tracking-[0.18em] text-[#9aacc0]">{eyebrow}</span></div>;
}

function SearchAraSpace({ search, setSearch, onSearch }: { search: string; setSearch: (value: string) => void; onSearch: () => void }) {
  return <section className="flex flex-col gap-5 rounded-[28px] border border-[#aee7fb] bg-[#edf9fe] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0b3d59] text-[#70d8fa]"><Search className="h-5 w-5" /></div><div><h3 className="font-semibold">Need an answer quickly?</h3><p className="mt-1 text-sm text-[#60758c]">Search SOPs, work guides, training and FAQs without leaving the portal.</p></div></div><div className="flex w-full max-w-xl gap-2 rounded-[16px] bg-white p-2 shadow-sm"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onSearch()} placeholder="Try: panel registration, Plato, complaints, shift change..." className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-slate-400" /><button onClick={onSearch} className="rounded-xl bg-[#0b3d59] px-5 py-2.5 text-sm font-bold text-white">Search</button></div></section>;
}

function LatestUpdates({ updates, resources, onNavigate, onOpenResource }: { updates: KnowledgeBaseUpdate[]; resources: KnowledgeResource[]; onNavigate: (view: View) => void; onOpenResource: (resource: KnowledgeResource) => void }) {
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const badgeTone = { NEW: "bg-emerald-50 text-emerald-700", UPDATED: "bg-sky-50 text-sky-700", NOTICE: "bg-amber-50 text-amber-700" };
  return <section className="rounded-[28px] border border-[#dce4ed] bg-white p-6 sm:p-7"><SectionHeading title="Latest updates" eyebrow="Knowledge base" />{updates.length === 0 ? <p className="rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-[#60758c]">No verified knowledge-base updates have been published yet.</p> : <div className="divide-y divide-[#e7edf2]">{updates.map((update) => { const resource = update.resourceId ? resourceById.get(update.resourceId) : undefined; return <button key={update.id} onClick={() => resource ? onOpenResource(resource) : update.view && onNavigate(update.view as View)} className="flex w-full items-center gap-4 py-4 text-left first:pt-0 last:pb-0"><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider", badgeTone[update.type])}>{update.type}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{update.title}</span><span className="mt-0.5 block text-xs text-slate-500">{update.date}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-300" /></button>; })}</div>}</section>;
}

const announcementsSeed: Announcement[] = [
  { id: "review", title: "Staff portal content review", body: "All SOPs and training materials are starter drafts. Process owners must review them before publishing to all staff.", date: "30 Sep 2026", audience: "All staff", priority: "Penting" },
  { id: "onboarding", title: "New staff onboarding training", body: "Supervisors should ensure new staff complete the onboarding modules during their first week.", date: "28 Sep 2026", audience: "Supervisors & new staff", priority: "Biasa" },
  { id: "complaint", title: "Patient complaint SOP updated", body: "Review the new escalation flow in the Reference Hub and report any unclear steps.", date: "25 Sep 2026", audience: "Front desk & operations", priority: "Biasa" },
];

const serviceSeed: Service[] = [
    ["General consultation", "Consultation, acute treatment and follow-up care."],
    ["Medical screening", "Individual, corporate and pre-employment screening packages."],
    ["Vaccination", "Routine, travel and workplace vaccination services."],
    ["Laboratory services", "Blood tests, screening samples and result follow-up."],
    ["Women & child health", "Family-focused consultation and selected screening services."],
    ["Panel & corporate care", "Panel registration support, claims guidance and employer services."],
];

function OurServicesView({ services }: { services: Service[] }) {
  return <div className="mx-auto max-w-[1500px] space-y-7"><section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Clinic Assistants · Reference</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Our services</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">A quick overview of clinic services for staff orientation and patient enquiries. Confirm current pricing, eligibility and clinical suitability through the official process.</p></section><section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{services.map(([title, detail], index) => <article key={title} className="rounded-[24px] border border-[#dce4ed] bg-white p-6 shadow-[0_10px_28px_rgba(16,54,78,0.04)]"><span className="text-xs font-bold tracking-[0.18em] text-[#0b9aca]">0{index + 1}</span><h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3><p className="mt-2 text-sm leading-6 text-[#60758c]">{detail}</p></article>)}</section><div className="rounded-[22px] border border-[#aee7fb] bg-[#edf9fe] p-5 text-sm leading-6 text-[#0b587b]"><strong>Staff reminder:</strong> Do not promise a price, panel coverage or clinical outcome before checking the applicable official guide or consulting the responsible clinician.</div></div>;
}


function TrainingView({ modules, completedLessons, onOpen }: { modules: TrainingModule[]; completedLessons: string[]; onOpen: (module: TrainingModule) => void }) {
  const totalLessons = modules.reduce((count, module) => count + module.lessons.length, 0);
  const totalPercent = Math.round((completedLessons.length / totalLessons) * 100);
  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <section className="grid gap-6 rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9 lg:grid-cols-[1fr_320px] lg:items-center">
        <div><p className="text-sm font-semibold text-[#67cff4]">Your learning plan</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Learn a little, use it at work.</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Complete modules in priority order. Progress is saved on this device for the prototype.</p></div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-5"><div className="flex justify-between text-sm font-semibold"><span>Overall</span><span>{totalPercent}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#ffc62b]" style={{ width: `${totalPercent}%` }} /></div><p className="mt-3 text-sm text-[#b9cfdd]">{completedLessons.length} of {totalLessons} lessons completed</p></div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">{modules.map((module) => <div key={module.id}><TrainingCard module={module} completedLessons={completedLessons} onOpen={() => onOpen(module)} large /></div>)}</div>
    </div>
  );
}

type PanelAvailability = string[];
type PanelTrainingRow = { id: string; panel: string; availability: PanelAvailability; guideUrl: string; portalUrl: string };
const PANEL_LOCATIONS = ["Kajang", "Seri Kembangan", "Semenyih"];

function normalisePanelRow(row: PanelTrainingRow & { availability?: unknown }): PanelTrainingRow {
  const value: unknown = row.availability;
  const availability = Array.isArray(value)
    ? value.filter((location): location is string => typeof location === "string")
    : typeof value === "string" ? value.split(/\s*\/\s*|\s*,\s*/).map((location) => location.trim()).filter(Boolean) : [];
  return { ...row, availability };
}

const panelEntry = (id: string, panel: string, availability: PanelAvailability, guideUrl = ""): PanelTrainingRow => ({ id, panel, availability, guideUrl, portalUrl: "" });
const defaultPanelTrainingRows: PanelTrainingRow[] = [
  panelEntry("imas", "iMAS", ["Kajang", "Seri Kembangan"]),
  panelEntry("pmcare", "PMCare", ["Kajang", "Seri Kembangan", "Semenyih"], "https://drive.google.com/file/d/145h4ltrl8bw4dyQ9bMxrqbp3tw1zuRD_/preview"),
  panelEntry("aia", "AIA", ["Kajang", "Seri Kembangan"]),
  panelEntry("iltizam-selangor-sihat", "Iltizam Selangor Sihat", ["Kajang", "Seri Kembangan"]),
  panelEntry("great-eastern", "Great Eastern", ["Kajang", "Seri Kembangan", "Semenyih"], "https://drive.google.com/file/d/1x2Q7HlLAtm92MXzEcUaNeq9LNg9p1l9g/preview"),
  panelEntry("mediexpress", "MediExpress", ["Kajang", "Seri Kembangan"]),
  panelEntry("healthconnect", "HealthConnect", ["Kajang", "Seri Kembangan"], "https://drive.google.com/file/d/1xI8S_EOJxrGT3X74So9t7dbDTimSny45/preview"),
  panelEntry("mytpa", "MyTPA", ["Kajang", "Seri Kembangan"]),
  panelEntry("medkad", "Medkad", ["Kajang", "Seri Kembangan"]),
  panelEntry("perkeso", "PERKESO", ["Kajang", "Seri Kembangan", "Semenyih"]),
  panelEntry("sehati", "SEHATI", ["Kajang", "Seri Kembangan", "Semenyih"]),
  panelEntry("compumed", "Compumed", ["Kajang", "Seri Kembangan"]),
  panelEntry("redalert-online", "RedAlert Online", ["Kajang", "Seri Kembangan"]),
  panelEntry("eben-assist", "eBen Assist", ["Kajang", "Seri Kembangan"]),
  panelEntry("mednefits", "Mednefits", ["Kajang", "Seri Kembangan"]),
  panelEntry("perubatan-madani", "Perubatan Madani", ["Kajang", "Seri Kembangan", "Semenyih"]),
  panelEntry("peka-b40", "Peka B40", ["Kajang", "Seri Kembangan", "Semenyih"]),
  panelEntry("selcare", "SelCare", ["Kajang", "Seri Kembangan"]),
  panelEntry("tenaga-nasional", "Tenaga Nasional", ["Kajang", "Seri Kembangan", "Semenyih"]),
  panelEntry("miya", "MIYA", ["Kajang", "Seri Kembangan"]),
  panelEntry("ukm", "UKM", ["Kajang", "Seri Kembangan"]),
  panelEntry("hctm", "HCTM", ["Kajang", "Seri Kembangan"]),
  panelEntry("wecare", "WeCare", ["Kajang", "Seri Kembangan"]),
  panelEntry("yadim", "YADIM", ["Kajang"]),
  panelEntry("asp-medical-group", "ASP Medical Group", ["Kajang"]),
  panelEntry("international-assistance", "International Assistance", ["Seri Kembangan"]),
];

function panelEmbedUrl(url: string) {
  const fileMatch = url.match(/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
  return url.includes("/folders/") ? "" : url;
}

function normalisePanelSearch(value: string) {
  return value.toLowerCase().replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^a-z0-9]/g, "");
}

function driveGuideMatchesPanel(file: { name: string }, panel: string) {
  const fileName = normalisePanelSearch(file.name);
  const panelName = normalisePanelSearch(panel);
  return Boolean(panelName) && fileName.includes(panelName);
}

function PanelAvailabilityEditor({ value, onChange }: { value: PanelAvailability; onChange: (value: PanelAvailability) => void }) {
  const [open, setOpen] = useState(false);
  return <details open={open} onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)} className="relative">
    <summary className="cursor-pointer list-none rounded-xl bg-slate-50/70 px-3 py-2 text-sm font-semibold text-[#0b587b] hover:bg-slate-100">{value.length ? value.join(", ") : "Select locations"}</summary>
    <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
      {PANEL_LOCATIONS.map((location) => <label key={location} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-slate-700 hover:bg-[#f3f9fc]"><input type="checkbox" checked={value.includes(location)} onChange={() => onChange(value.includes(location) ? value.filter((item) => item !== location) : [...value, location])} className="h-4 w-4 accent-[#0b587b]" />{location}</label>)}
      <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-2 pt-2"><p className="text-[10px] text-slate-400">Select more than one location.</p><button type="button" onClick={() => setOpen(false)} className="rounded-md bg-[#0b587b] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#084563]">Done</button></div>
    </div>
  </details>;
}

function PanelPortalEditor({ value, onSave, onOpen }: { value: string; onSave: (value: string) => Promise<boolean>; onOpen: () => void }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value); }, [value]);
  const save = async () => {
    setSaving(true);
    await onSave(draft.trim());
    setSaving(false);
  };
  return <div className="space-y-2"><div className="flex gap-2"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste portal URL" className="min-w-0 flex-1 rounded-xl bg-slate-50/70 px-3 py-2 text-xs text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" /><button type="button" onClick={() => void save()} disabled={saving || draft.trim() === value} className="shrink-0 rounded-xl bg-[#0b587b] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button></div>{value && <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 text-xs font-semibold text-[#0b587b] hover:text-[#0071e3]">Open panel portal<ExternalLink className="h-3.5 w-3.5" /></button>}</div>;
}

function PanelTrainingView({ training, canEdit }: { training: ReturnType<typeof usePanelTraining>; canEdit: boolean }) {
  const [selectedPanel, setSelectedPanelState] = useState<{ row: PanelTrainingRow; kind: "guide" | "portal" } | null>(null);
  const [importingGuide, setImportingGuide] = useState<typeof training.guides[number] | null>(null);
  const [saving, setSaving] = useState(false);
  const setSelectedPanel = (next: { row: PanelTrainingRow; kind: "guide" | "portal" } | null) => {
    if (next?.kind === "portal") {
      window.open(next.row.portalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setSelectedPanelState(next);
  };
  const rows = training.panels.map((panel) => ({
    id: panel.id, panel: panel.name, availability: panel.availability || [], portalUrl: panel.portal_url || '',
    guideUrl: training.guides.find((guide) => guide.status === 'linked' && guide.panel_id === panel.id)?.drive_url || '',
  }));
  const pendingGuides = training.guides.filter((guide) => guide.status === 'pending');
  useEffect(() => {
    if (canEdit && !importingGuide && pendingGuides[0]) setImportingGuide(pendingGuides[0]);
  }, [canEdit, importingGuide, pendingGuides]);
  const updatePanel = async (id: string, patch: Partial<PanelTrainingRow>) => {
    const current = rows.find((row) => row.id === id);
    if (!current) return false;
    return training.mutate({ action: 'update_panel', panel: { id, name: patch.panel ?? current.panel, availability: patch.availability ?? current.availability, portal_url: patch.portalUrl ?? current.portalUrl } });
  };
  const linkGuide = async (panelId: string) => {
    if (!importingGuide) return;
    setSaving(true);
    if (await training.mutate({ action: 'link_guide', guideId: importingGuide.id, panelId })) setImportingGuide(null);
    setSaving(false);
  };
  const createPanel = async () => {
    if (!importingGuide) return;
    const name = importingGuide.file_name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
    const id = `panel-${importingGuide.drive_file_id.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20)}`;
    setSaving(true);
    if (await training.mutate({ action: 'create_panel', guideId: importingGuide.id, panel: { id, name, availability: [], portal_url: '' } })) setImportingGuide(null);
    setSaving(false);
  };

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
      <span role="status">{training.error || (training.loading ? 'Checking Drive for panel guides…' : 'Panel guides sync automatically from Drive')}</span>
      <button onClick={() => void training.refresh(canEdit)} disabled={training.loading} className="shrink-0 rounded-lg bg-white px-3 py-2 font-semibold text-[#0b587b] disabled:opacity-50">Refresh</button>
    </div>
    {canEdit && pendingGuides.length > 0 && <section aria-label="New panel guides" className="rounded-2xl bg-sky-50 p-5">
      <h3 className="text-sm font-semibold text-[#0b3d59]">New panel guides need review</h3>
      <div className="mt-3 space-y-3">{pendingGuides.map((guide) => <button key={guide.id} className="block text-left text-sm font-semibold text-[#0b587b] hover:underline" onClick={() => setImportingGuide(guide)}>{guide.file_name}</button>)}</div>
    </section>}
    <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Panel operations</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Panel Training</h2><p className="mt-2 max-w-2xl leading-7 text-[#b9cfdd]">Quick references for panel workflows, availability and portal access by branch.</p></div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-[14px] bg-white/10 px-4 py-3 text-sm font-semibold text-[#d8edf6]"><BookOpen className="h-4 w-4" />Direct document links</span>
      </div>
    </section>
    <div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-500">{rows.length} panels listed</p><p className="mt-1 text-xs text-slate-400">Open a panel guide to read its document here.</p></div><span className="rounded-full bg-[#e8f7fd] px-3 py-1.5 text-xs font-bold text-[#0b587b]">{canEdit ? "Admin editing enabled" : "Staff reference · read-only"}</span></div>
    <section className="overflow-hidden rounded-[24px] border border-[#dce4ed] bg-white shadow-[0_12px_30px_rgba(16,54,78,0.06)]">
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] table-fixed text-left"><thead className="bg-[#f7fafc]"><tr className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400"><th className="w-[25%] px-6 py-4">Panel name</th><th className="w-[20%] px-6 py-4">Availability</th><th className="w-[27.5%] px-6 py-4">Panel guide</th><th className="w-[27.5%] px-6 py-4">Panel portal</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="transition hover:bg-[#f8fcfe]"><td className="px-6 py-5 align-middle">{canEdit ? <input aria-label={`Panel name for ${row.panel}`} defaultValue={row.panel} onBlur={(event) => void updatePanel(row.id, { panel: event.target.value })} className="w-full rounded-xl bg-slate-50/70 px-3 py-2 text-[15px] font-semibold text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" /> : <span className="text-[15px] font-semibold text-[#14233b]">{row.panel}</span>}</td><td className="px-6 py-5 align-middle">{canEdit ? <PanelAvailabilityEditor value={row.availability} onChange={(availability) => void updatePanel(row.id, { availability })} /> : <div className="flex flex-wrap gap-1.5">{row.availability.length ? row.availability.map((location) => <span key={location} className="inline-flex rounded-full bg-[#eef8fc] px-2.5 py-1 text-xs font-bold text-[#0b587b]">{location}</span>) : <span className="text-xs font-semibold text-slate-400">Not assigned</span>}</div>}</td><td className="px-6 py-5 align-middle">{row.guideUrl ? <button type="button" onClick={() => setSelectedPanel({ row, kind: "guide" })} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b] transition hover:text-[#0071e3]"><BookOpen className="h-4 w-4 text-[#20aee0]" />Open panel guide<ExternalLink className="h-3.5 w-3.5" /></button> : <span className="text-sm text-slate-400">Direct guide link to be added</span>}</td><td className="px-6 py-5 align-middle">{canEdit ? <PanelPortalEditor value={row.portalUrl} onSave={(portalUrl) => updatePanel(row.id, { portalUrl })} onOpen={() => setSelectedPanel({ row, kind: "portal" })} /> : row.portalUrl ? <button type="button" onClick={() => setSelectedPanel({ row, kind: "portal" })} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b587b] hover:text-[#0071e3]">Open panel portal<ExternalLink className="h-3.5 w-3.5" /></button> : <span className="text-sm text-slate-400">Portal link to be added</span>}</td></tr>)}</tbody></table></div>
    </section>
    {selectedPanel && <PanelTrainingModal row={selectedPanel.row} kind={selectedPanel.kind} onClose={() => setSelectedPanel(null)} />}
    {canEdit && importingGuide && <PanelGuideImportPrompt file={{ id: importingGuide.id, name: importingGuide.file_name, url: importingGuide.drive_url }} panels={rows} saving={saving} onCreatePanel={createPanel} onLinkPanel={linkGuide} onDismiss={() => setImportingGuide(null)} />}
  </div>;
}

function PanelGuideImportPrompt({ file, panels, saving, onCreatePanel, onLinkPanel, onDismiss }: { file: { id: string; name: string; url: string }; panels: PanelTrainingRow[]; saving: boolean; onCreatePanel: () => void; onLinkPanel: (panelId: string) => void; onDismiss: () => void }) {
  const [panelId, setPanelId] = useState(panels[0]?.id || "");
  return <ModalShell onClose={onDismiss}>
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">New panel guide detected</p>
    <h2 className="mt-2 text-2xl font-semibold tracking-tight">Where should this PDF go?</h2>
    <p className="mt-3 rounded-xl bg-[#f7f9fc] p-4 text-sm font-semibold text-[#29465a]">{file.name}</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-2"><button type="button" disabled={saving} onClick={onCreatePanel} className="rounded-2xl border border-[#8cdbf7] bg-[#edf9fe] p-4 text-left transition hover:bg-[#dff4fc] disabled:opacity-50"><Plus className="h-5 w-5 text-[#0b587b]" /><p className="mt-3 font-semibold">Create new panel</p><p className="mt-1 text-xs leading-5 text-[#60758c]">Add this PDF as a new panel entry. You can complete its availability and portal link afterwards.</p></button><div className="rounded-2xl border border-[#dce4ed] p-4"><BookOpen className="h-5 w-5 text-[#0b587b]" /><p className="mt-3 font-semibold">Sync with an existing panel</p><select aria-label="Panel to sync this guide with" value={panelId} onChange={(event) => setPanelId(event.target.value)} className="mt-3 h-10 w-full rounded-xl bg-slate-50 px-3 text-sm font-medium outline-none"><option value="" disabled>Select a panel</option>{panels.map((panel) => <option key={panel.id} value={panel.id}>{panel.panel}</option>)}</select><button type="button" disabled={!panelId || saving} onClick={() => onLinkPanel(panelId)} className="mt-2 w-full rounded-xl bg-[#0b587b] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Sync guide'}</button></div></div>
    <button type="button" disabled={saving} onClick={onDismiss} className="mt-5 text-sm font-semibold text-slate-500 hover:text-[#0b587b] disabled:opacity-50">Decide later</button>
  </ModalShell>;
}

function PanelTrainingModal({ row, kind, onClose }: { row: PanelTrainingRow; kind: "guide" | "portal"; onClose: () => void }) {
  const url = kind === "guide" ? row.guideUrl : row.portalUrl;
  return <ModalShell onClose={onClose} wide><div className="sticky top-0 z-10 -mx-6 -mt-6 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5 sm:-mx-8 sm:-mt-8 sm:px-8"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Panel training</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{row.panel} · {kind === "guide" ? "Panel guide" : "Panel portal"}</h2><p className="mt-2 text-sm text-slate-500">{row.availability.join(", ") || "Availability not assigned"} · Official AraSpace reference</p></div><button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 transition hover:bg-slate-200" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><iframe title={`${row.panel} ${kind}`} src={panelEmbedUrl(url)} scrolling="yes" className="h-[62vh] min-h-[480px] w-full" /></div><div className="mt-5 flex items-center justify-between gap-4"><p className="text-xs leading-5 text-slate-500">Scroll inside the guide to read the document. If the source does not support embedded scrolling, open the official source.</p><a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-[#0b587b] hover:text-[#0071e3]">Open source <ExternalLink className="inline h-3.5 w-3.5" /></a></div></ModalShell>;
}

function AnnouncementsView({ announcements }: { announcements: Announcement[] }) {
  return <div className="mx-auto max-w-[1500px] space-y-6"><section className="rounded-[30px] bg-[#0b3d59] p-8 text-white"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Team updates</p><h2 className="mt-2 text-3xl font-semibold">Announcements</h2><p className="mt-2 text-[#b9cfdd]">Operational changes and information staff need to know.</p></section>{announcements.map((item) => <article key={item.id} className={cn("rounded-[24px] border bg-white p-6 sm:p-7", item.priority === "Penting" ? "border-rose-200" : "border-[#dce4ed]")}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-4"><div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", item.priority === "Penting" ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-600")}><Bell className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold">{item.title}</p>{item.priority === "Penting" && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-rose-700">Important</span>}</div><p className="mt-2 leading-7 text-slate-600">{item.body}</p></div></div><div className="shrink-0 text-sm text-slate-400 sm:text-right"><p className="font-bold text-slate-600">{item.date}</p><p className="mt-1 text-xs">{item.audience}</p></div></div></article>)}</div>;
}

function LinksView({ links }: { links: typeof quickLinks }) {
  return <div className="mx-auto max-w-[1500px]"><section className="mb-6 rounded-[30px] bg-[#0b3d59] p-8 text-white"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Quick access</p><h2 className="mt-2 text-3xl font-semibold">Important links</h2><p className="mt-2 text-[#b9cfdd]">Systems and forms used in daily operations.</p></section><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{links.map((link) => <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="group rounded-[24px] bg-[#0b3d59] p-6 text-white transition hover:-translate-y-0.5 hover:bg-[#104b6c]"><div className="flex items-center justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#67cff4]"><Link2 className="h-5 w-5" /></div><ExternalLink className="h-5 w-5 text-[#8eb2c6] group-hover:text-white" /></div><h3 className="mt-5 text-xl font-semibold">{link.title}</h3><p className="mt-2 text-sm text-[#b9cfdd]">{link.description}</p><p className="mt-5 text-xs font-bold uppercase tracking-wider text-[#67cff4]">{link.group}</p></a>)}</div><p className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">These are starter links. An admin can replace them with the organisation's live links before publishing.</p></div>;
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
function Avatar({ name, dark = false }: { name: string; dark?: boolean }) { const initials = name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(); return <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold", dark ? "bg-white/15 text-white" : "bg-[#e9f8fe] text-[#076b91]")}>{initials}</div>; }
function LogoMark() { return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-white/20 bg-white/10 text-[#70d8fa]"><BookOpen className="h-6 w-6" /></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
