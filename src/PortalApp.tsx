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
  Trash2,
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
  QuickLink,
  quickLinks,
  trainingModules,
  TrainingModule,
} from "./portalData";
import { cn } from "./lib/utils";
import { isSupabaseConfigured, signInWithSupabase, signOutSupabase } from "./lib/supabase";
import ShiftHandoverView, { shiftGuides, ShiftGuides } from "./ShiftHandover";
import { PanelRecord, usePanelTraining } from "./lib/usePanelTraining";
import { useServiceCatalog } from "./lib/useServiceCatalog";
import { useCaPortalState } from "./lib/useCaPortalState";
import { useSharedReferences } from "./lib/useSharedReferences";
import { KnowledgeView, ModalShell, ResourceModal } from "./ReferenceHub";
import { ManagedServices } from './ManagedServices';
import TeamAra from './TeamAra';
import { useVisitingFrom } from "./lib/officeVisit";

type View = "home" | "handover" | "knowledge" | "training" | "panelTraining" | "services" | "teamara" | "announcements" | "links" | "admin";


const viewTitles: Record<View, string> = {
  home: "Home",
  handover: "Shift Passover",
  knowledge: "Reference Hub",
  training: "My Training",
  panelTraining: "Panel Training",
  services: "Our Services",
  teamara: "TeamAra",
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
  announcements: [],
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
  // Home search covers every tab, so load Services and Panel Training once staff start typing there.
  const homeSearching = view === "home" && globalSearch.trim().length > 0;
  const panelTraining = usePanelTraining(personal.ready && (view === 'panelTraining' || homeSearching), user?.role === "Superadmin");
  // Start loading as soon as the Services view is opened.  The service hook
  // still uses the signed-in session for protected mutations, while the UI
  // keeps its local poster fallback visible during the initial request.
  const serviceCatalog = useServiceCatalog(view === 'services' || homeSearching);

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

  const saveAnnouncements = async (next: Announcement[], message: string) => {
    const saved = await workspace.save({ ...workspace.data, announcements: next });
    setToastError(!saved);
    setToast(saved ? message : "Unable to save announcements. Please try again.");
    return saved;
  };

  const saveLinks = async (next: QuickLink[], message: string) => {
    const saved = await workspace.save({ ...workspace.data, links: next });
    setToastError(!saved);
    setToast(saved ? message : "Unable to save links. Please try again.");
    return saved;
  };

  if (!user) return <LoginScreen onLogin={login} />;

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-[#14233b]">
      <Sidebar
        panelAlertCount={panelTraining.guides.filter((guide) => guide.status === 'pending').length}
        announcementCount={content.announcements.length}
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
              links={content.links}
              serviceCatalog={serviceCatalog}
              panels={panelTraining.panels}
              panelsLoading={panelTraining.loading}
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
          {view === "services" && <ManagedServices catalog={serviceCatalog} canEdit={user.role === "Superadmin"} />}
          {view === "teamara" && <TeamAra canEdit={user.role === "Superadmin"} />}
          {view === "announcements" && <AnnouncementsView announcements={content.announcements} canEdit={user.role === "Superadmin"} onSave={saveAnnouncements} />}
          {view === "links" && <LinksView links={content.links} canEdit={user.role === "Superadmin"} onSave={saveLinks} />}
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

function Sidebar({ user, view, open, onClose, onNavigate, onLogout, panelAlertCount = 0, announcementCount = 0 }: { user: PortalUser; view: View; open: boolean; onClose: () => void; onNavigate: (view: View) => void; onLogout: () => void; panelAlertCount?: number; announcementCount?: number }) {
  const items: { id: View; label: string; icon: typeof Home }[] = [{ id: "home", label: "Home", icon: Home }, ...portalTabs];

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
              {item.id === "announcements" && announcementCount > 0 && <span className="ml-auto grid h-6 min-w-6 place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] text-white">{announcementCount}</span>}
              {!(item.id === "announcements" && announcementCount > 0) && <ChevronRight className="ml-auto h-4 w-4 opacity-45" />}
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

// Every tab in the sidebar (besides Home). Quick access on Home is built from this list,
// so a new tab only needs to be added here to appear in both places.
const portalTabs: { id: View; label: string; note: string; icon: typeof Home; tone: string }[] = [
  { id: "knowledge", label: "Reference Hub", note: "SOPs, memos & work guides", icon: Library, tone: "text-[#20c7f4]" },
  { id: "panelTraining", label: "Panel Training", note: "Panel workflows & guides", icon: BookOpen, tone: "text-emerald-400" },
  { id: "services", label: "Our Services", note: "Clinic services & FAQs", icon: Sparkles, tone: "text-[#ffb000]" },
  { id: "teamara", label: "TeamAra", note: "Members & cards", icon: Users, tone: "text-[#ff7ab6]" },
  { id: "handover", label: "Shift Passover", note: "Templates & guides", icon: ClipboardCheck, tone: "text-[#7258ff]" },
  { id: "announcements", label: "Announcements", note: "Team updates", icon: Bell, tone: "text-[#ff6b81]" },
  { id: "links", label: "Important Links", note: "Work systems", icon: Link2, tone: "text-[#20c7f4]" },
];

type HomeProps = {
  onNavigate: (view: View) => void;
  onOpenResource: (resource: KnowledgeResource) => void;
  search: string;
  setSearch: (value: string) => void;
  announcements: Announcement[];
  resources: KnowledgeResource[];
  links: QuickLink[];
  serviceCatalog: ReturnType<typeof useServiceCatalog>;
  panels: PanelRecord[];
  panelsLoading: boolean;
};

function HomeView({ onNavigate, onOpenResource, search, setSearch, announcements, resources, links, serviceCatalog, panels, panelsLoading }: HomeProps) {
  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" }).format(new Date());
  const visitor = useVisitingFrom("ca");
  const importantAnnouncement = announcements.find((announcement) => announcement.priority === "Penting");

  return <div className="mx-auto max-w-[1500px] space-y-8">
    <section className="rounded-[30px] bg-[#0b3d59] px-7 py-9 text-white sm:px-10 lg:px-12">
      <div className="flex flex-col gap-7 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Klinik ARA 24 Jam · Clinic Assistants</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-[2.45rem]">Welcome, {visitor || "Clinic Assistants"}</h2><p className="mt-3 text-base text-[#bed2df]">{visitor ? "This is the Clinic Assistants' page." : "References and everyday work guides in one workspace."}</p></div><div className="text-left md:text-right"><span className="inline-flex rounded-full bg-white/12 px-5 py-2.5 text-sm font-semibold capitalize text-[#d9e7ef]">{today}</span><p className="mt-4 text-sm italic text-[#a9c1d0]">“Clear at work. Confident at handover.”</p></div></div>
    </section>

    <SearchAraSpace search={search} setSearch={setSearch} />
    {search.trim() && <SearchResults query={search} onNavigate={onNavigate} onOpenResource={onOpenResource} announcements={announcements} resources={resources} links={links} serviceCatalog={serviceCatalog} panels={panels} panelsLoading={panelsLoading} />}

    <section><SectionHeading title="Quick access" eyebrow="Shortcuts" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{portalTabs.map((item) => <button key={item.id} onClick={() => onNavigate(item.id)} className="group min-h-[132px] rounded-[24px] bg-[#0b3d59] p-5 text-left text-white transition hover:-translate-y-0.5 hover:bg-[#104b6c]"><div className="flex items-center justify-between"><span className={cn("grid h-10 w-10 place-items-center rounded-full bg-white/10", item.tone)}><item.icon className="h-5 w-5" /></span><ArrowRight className="h-4 w-4 text-[#9bc8da] transition group-hover:translate-x-1" /></div><p className="mt-5 font-semibold">{item.label}</p><p className="mt-1 text-xs text-[#9fb8c7]">{item.note}</p></button>)}</div></section>

    {importantAnnouncement && <section className="rounded-[28px] border border-rose-100 bg-white p-6 sm:p-7"><div className="flex items-center gap-2 text-[#f04464]"><span className="h-2 w-2 rounded-full bg-[#f04464]" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Important announcement</span></div><h3 className="mt-4 text-xl font-semibold">{importantAnnouncement.title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{importantAnnouncement.body}</p><button onClick={() => onNavigate("announcements")} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0b587b]">View all announcements <ArrowRight className="h-4 w-4" /></button></section>}
  </div>;
}

function SectionHeading({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <div className="mb-4 flex items-end justify-between gap-4"><h3 className="text-2xl font-semibold tracking-tight">{title}</h3><span className="text-right text-xs font-bold uppercase tracking-[0.18em] text-[#9aacc0]">{eyebrow}</span></div>;
}

function SearchAraSpace({ search, setSearch }: { search: string; setSearch: (value: string) => void }) {
  return <section className="flex flex-col gap-5 rounded-[28px] border border-[#aee7fb] bg-[#edf9fe] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0b3d59] text-[#70d8fa]"><Search className="h-5 w-5" /></div><div><h3 className="font-semibold">Need an answer quickly?</h3><p className="mt-1 text-sm text-[#60758c]">Search references, memos, services, panels, announcements and links.</p></div></div><div className="flex w-full max-w-xl items-center gap-2 rounded-[16px] bg-white p-2 shadow-sm"><Search className="ml-2 h-4 w-4 shrink-0 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setSearch("")} placeholder="Try: AraSihat, panel registration, Plato, complaints..." className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm outline-none placeholder:text-slate-400" />{search && <button onClick={() => setSearch("")} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100" aria-label="Clear search"><X className="h-4 w-4" /></button>}</div></section>;
}

// Shift Passover is a daily checklist, not reference material, so it stays out of search.
const searchableTabs = portalTabs.filter((tab) => tab.id !== "handover");

type SearchHit = { key: string; title: string; detail: string; tab: View; score: number; onOpen: () => void; inactive?: boolean };

function SearchResults({ query, onNavigate, onOpenResource, announcements, resources, links, serviceCatalog, panels, panelsLoading }: Omit<HomeProps, "search" | "setSearch"> & { query: string }) {
  const groups = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    // Every search word must appear somewhere in the item; matches in the title rank higher.
    const score = (title: string, ...rest: (string | undefined)[]) => {
      const head = title.toLowerCase();
      const body = rest.filter(Boolean).join(" ").toLowerCase();
      if (!terms.every((term) => head.includes(term) || body.includes(term))) return 0;
      return terms.reduce((total, term) => total + (head.includes(term) ? 3 : 1), 0);
    };
    const hits: SearchHit[] = [];
    const add = (hit: Omit<SearchHit, "score">, value: number) => { if (value) hits.push({ ...hit, score: value }); };

    searchableTabs.forEach((tab) => add({ key: `tab-${tab.id}`, title: tab.label, detail: tab.note, tab: tab.id, onOpen: () => onNavigate(tab.id) }, score(tab.label, tab.note)));
    resources.forEach((resource) => add({ key: `ref-${resource.id}`, title: resource.title, detail: `${resource.type} · ${resource.summary}`, tab: "knowledge", onOpen: () => onOpenResource(resource), inactive: resource.status === "TERBATAL" }, score(resource.title, resource.summary, resource.category, resource.type, resource.keywords.join(" "), resource.content.join(" "))));
    const folderName = new Map<string, string>(serviceCatalog.folders.map((folder) => [folder.id, folder.name]));
    serviceCatalog.services.forEach((service) => add({ key: `svc-${service.id}`, title: service.title, detail: service.summary || folderName.get(service.folder_id || "") || "Service", tab: "services", onOpen: () => onNavigate("services") }, score(service.title, service.summary, service.tags, folderName.get(service.folder_id || ""))));
    serviceCatalog.faqs.forEach((faq) => add({ key: `faq-${faq.id}`, title: faq.question, detail: faq.answer, tab: "services", onOpen: () => onNavigate("services") }, score(faq.question, faq.answer, folderName.get(faq.folder_id || ""))));
    panels.filter((panel) => panel.active !== false).forEach((panel) => add({ key: `panel-${panel.id}`, title: panel.name, detail: panel.availability.join(", ") || "Panel", tab: "panelTraining", onOpen: () => onNavigate("panelTraining") }, score(panel.name, panel.availability.join(" "))));
    announcements.forEach((item) => add({ key: `ann-${item.id}`, title: item.title, detail: item.body, tab: "announcements", onOpen: () => onNavigate("announcements") }, score(item.title, item.body, item.audience)));
    links.forEach((link) => add({ key: `link-${link.id}`, title: link.title, detail: link.description || link.url, tab: "links", onOpen: () => window.open(link.url, "_blank", "noopener,noreferrer") }, score(link.title, link.description, link.group, link.url)));

    return searchableTabs
      .map((tab) => ({ tab, hits: hits.filter((hit) => hit.tab === tab.id && !hit.key.startsWith("tab-")).sort((a, b) => b.score - a.score), tabHit: hits.some((hit) => hit.key === `tab-${tab.id}`) }))
      .filter((group) => group.hits.length || group.tabHit);
  }, [query, onNavigate, onOpenResource, announcements, resources, links, serviceCatalog.folders, serviceCatalog.services, serviceCatalog.faqs, panels]);
  const loading = serviceCatalog.loading || panelsLoading;

  return <section className="rounded-[28px] border border-[#dce4ed] bg-white p-6 sm:p-7">
    <SectionHeading title="Search results" eyebrow={loading ? "Searching all tabs…" : `${groups.reduce((total, group) => total + group.hits.length, 0)} found`} />
    {groups.length === 0 && !loading && <p className="rounded-2xl bg-[#f7f9fc] px-4 py-4 text-sm text-[#60758c]">Nothing matches “{query.trim()}” in any tab yet.</p>}
    <div className="space-y-6">{groups.map(({ tab, hits }) => <div key={tab.id}>
      <button onClick={() => onNavigate(tab.id)} className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#0b587b] hover:underline"><tab.icon className="h-4 w-4" />{tab.label}<span className="font-semibold normal-case tracking-normal text-slate-400">· {hits.length ? `${hits.length} match${hits.length === 1 ? "" : "es"}` : "Open tab"}</span></button>
      {hits.length > 0 && <div className="divide-y divide-[#e7edf2] rounded-2xl border border-[#e7edf2]">{hits.slice(0, 5).map((hit) => <button key={hit.key} onClick={hit.onOpen} className="group flex w-full items-center gap-3 px-4 py-3 text-left transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-[#f9fcfe]"><span className="min-w-0 flex-1"><span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-[#14233b]">{hit.title}</span>{hit.inactive && <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">Not active</span>}</span><span className="mt-0.5 block truncate text-xs text-[#60758c]">{hit.detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#0b587b]" /></button>)}</div>}
      {hits.length > 5 && <button onClick={() => onNavigate(tab.id)} className="mt-2 text-xs font-bold text-[#0b587b] hover:underline">View all {hits.length} in {tab.label} →</button>}
    </div>)}</div>
  </section>;
}

const serviceSeed: Service[] = [
    ["General consultation", "Consultation, acute treatment and follow-up care."],
    ["Medical screening", "Individual, corporate and pre-employment screening packages."],
    ["Vaccination", "Routine, travel and workplace vaccination services."],
    ["Laboratory services", "Blood tests, screening samples and result follow-up."],
    ["Women & child health", "Family-focused consultation and selected screening services."],
    ["Panel & corporate care", "Panel registration support, claims guidance and employer services."],
];

const servicePosterBaseUrl = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/service-posters` : '/services';
const servicePosterUrl = (path: string) => `${servicePosterBaseUrl}/${path}`;

function OurServicesView({ catalog, canEdit }: { catalog: ReturnType<typeof useServiceCatalog>; canEdit: boolean }) {
  const [folder, setFolder] = useState(''); const [selected, setSelected] = useState<typeof catalog.services[number] | null>(null); const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState(''); const [summary, setSummary] = useState(''); const [file, setFile] = useState<{ name: string; type: string; base64: string } | null>(null);
  const services = catalog.services.filter((service) => !folder || service.folder_id === folder);
  const addFolder = async () => { const name = window.prompt('Folder name'); if (name?.trim()) await catalog.mutate({ action: 'create_folder', name: name.trim() }); };
  const addFaq = async () => { const question = window.prompt('FAQ question'); if (!question?.trim()) return; const answer = window.prompt('FAQ answer'); if (answer?.trim()) await catalog.mutate({ action: 'create_faq', question, answer, folderId: folder || null }); };
  const createService = async () => { if (!file || !title.trim()) return; if (await catalog.mutate({ action: 'create_service', title: title.trim(), summary: summary.trim(), folderId: folder || null, file })) { setAdding(false); setTitle(''); setSummary(''); setFile(null); } };
  return <div className="mx-auto max-w-[1500px] space-y-7"><section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-9"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Clinic Assistants · Reference</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Our services</h2><p className="mt-3 max-w-2xl leading-7 text-[#b9cfdd]">Official service information for staff. Select a service for its poster, details and common questions.</p></section><div className="flex flex-col gap-3 rounded-2xl border border-[#dce4ed] bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setFolder('')} className={cn('rounded-lg px-3 py-2 text-xs font-medium', !folder ? 'bg-[#0b587b] text-white' : 'bg-slate-100 text-[#526a80]')}>All services</button>{catalog.folders.map((item) => <button key={item.id} type="button" onClick={() => setFolder(item.id)} className={cn('rounded-lg px-3 py-2 text-xs font-medium', folder === item.id ? 'bg-[#0b587b] text-white' : 'bg-slate-100 text-[#526a80]')}>{item.name}</button>)}</div>{canEdit && <div className="flex gap-2"><button type="button" onClick={addFolder} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-[#0b587b]">Add folder</button><button type="button" onClick={() => setAdding(true)} className="rounded-lg bg-[#0b587b] px-3 py-2 text-xs font-medium text-white">Add service</button></div>}</div>{adding && <section className="rounded-2xl border border-[#8cdbf7] bg-[#edf9fe] p-5"><h3 className="font-semibold text-[#0b3d59]">Add service</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Service name" className="rounded-xl bg-white px-3 py-2 text-sm outline-none" /><select value={folder} onChange={(event) => setFolder(event.target.value)} className="rounded-xl bg-white px-3 py-2 text-sm outline-none"><option value="">No folder</option>{catalog.folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Short service information for staff" className="min-h-24 rounded-xl bg-white px-3 py-2 text-sm outline-none sm:col-span-2" /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const selectedFile = event.target.files?.[0]; if (!selectedFile) return; const reader = new FileReader(); reader.onload = () => setFile({ name: selectedFile.name, type: selectedFile.type, base64: String(reader.result).split(',')[1] || '' }); reader.readAsDataURL(selectedFile); }} className="text-xs sm:col-span-2" /></div><div className="mt-4 flex gap-2"><button type="button" onClick={() => void createService()} disabled={!file || !title.trim() || catalog.loading} className="rounded-lg bg-[#0b587b] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save service</button><button type="button" onClick={() => setAdding(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500">Cancel</button></div></section>}<section><div className="mb-4 flex items-end justify-between gap-4"><div><h3 className="text-xl font-semibold tracking-tight text-[#14233b]">Service guides</h3><p className="mt-1 text-sm text-[#60758c]">{catalog.loading ? 'Loading services…' : `${services.length} services`}</p></div></div>{catalog.error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{catalog.error}</p> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{services.map((service) => <button key={service.id} type="button" onClick={() => setSelected(service)} className="group overflow-hidden rounded-[20px] border border-[#dce4ed] bg-white text-left shadow-[0_8px_22px_rgba(16,54,78,0.06)] transition hover:-translate-y-0.5 hover:border-[#8cdbf7]"><div className="aspect-[0.707] overflow-hidden bg-slate-100"><img src={servicePosterUrl(service.storage_path)} alt={service.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" /></div><div className="px-3 py-2.5"><p className="truncate text-xs font-medium text-[#29465a]">{service.title}</p></div></button>)}</div>}</section><section className="rounded-[24px] border border-[#dce4ed] bg-white p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><h3 className="text-xl font-semibold tracking-tight">Staff FAQ</h3><p className="mt-1 text-sm text-[#60758c]">Quick answers for common service questions.</p></div>{canEdit && <button type="button" onClick={() => void addFaq()} className="rounded-lg bg-[#edf9fe] px-3 py-2 text-xs font-medium text-[#0b587b]">Add FAQ</button>}</div><div className="mt-4 divide-y divide-slate-100">{catalog.faqs.filter((faq) => !folder || !faq.folder_id || faq.folder_id === folder).map((faq) => <details key={faq.id} className="py-3"><summary className="cursor-pointer text-sm font-medium text-[#14233b]">{faq.question}</summary><p className="mt-2 pr-8 text-sm leading-6 text-[#60758c]">{faq.answer}</p>{canEdit && <button type="button" onClick={() => void catalog.mutate({ action: 'delete_faq', id: faq.id })} className="mt-2 text-xs font-medium text-rose-600">Remove FAQ</button>}</details>)}{catalog.faqs.length === 0 && <p className="py-5 text-sm text-slate-400">No FAQs have been added yet.</p>}</div></section>{selected && <ModalShell onClose={() => setSelected(null)} wide><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Service details</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{selected.title}</h2></div><button type="button" onClick={() => setSelected(null)} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div><img src={servicePosterUrl(selected.storage_path)} alt={selected.title} className="mx-auto mt-5 max-h-[55vh] rounded-xl border border-slate-200 object-contain" /><p className="mt-5 text-sm leading-6 text-[#526a80]">{selected.summary || 'Open the poster for the current service information. Confirm availability and clinical eligibility through the official process.'}</p>{canEdit && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><select defaultValue={selected.folder_id || ''} onChange={(event) => void catalog.mutate({ action: 'update_service', id: selected.id, title: selected.title, summary: selected.summary, folderId: event.target.value || null })} className="rounded-lg bg-slate-100 px-3 py-2 text-sm"><option value="">No folder</option>{catalog.folders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" onClick={() => { if (window.confirm(`Remove ${selected.title}?`)) void catalog.mutate({ action: 'delete_service', id: selected.id }); setSelected(null); }} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">Remove service</button></div>}</ModalShell>}</div>;
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
    <summary className="cursor-pointer list-none rounded-xl bg-slate-50/70 px-3 py-2 text-xs font-medium text-[#0b587b] hover:bg-slate-100">{value.length ? value.join(" · ") : "Select branches"}</summary>
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
  return <div className="space-y-1"><div className="flex gap-1.5"><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste portal URL" className="min-w-0 flex-1 rounded-lg bg-slate-50/70 px-2.5 py-1.5 text-xs text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" /><button type="button" onClick={() => void save()} disabled={saving || draft.trim() === value} className="shrink-0 rounded-lg bg-[#0b587b] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Save"}</button></div>{value && <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0b587b] hover:text-[#0071e3]">Open portal<ExternalLink className="h-3.5 w-3.5" /></button>}</div>;
}

function PanelTrainingCards({ rows, canEdit, saving, onUpdate, onGuide, onPortal, onDelete }: { rows: PanelTrainingRow[]; canEdit: boolean; saving: boolean; onUpdate: (id: string, patch: Partial<PanelTrainingRow>) => Promise<boolean>; onGuide: (row: PanelTrainingRow) => void; onPortal: (row: PanelTrainingRow) => void; onDelete: (row: PanelTrainingRow) => void }) {
  return <div className="grid gap-3">{rows.map((row) => <article key={row.id} className="rounded-2xl border border-slate-100 bg-[#fbfdfe] p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1">{canEdit ? <input aria-label={`Panel name for ${row.panel}`} defaultValue={row.panel} onBlur={(event) => void onUpdate(row.id, { panel: event.target.value })} className="w-full rounded-lg bg-white px-2 py-1 text-sm font-bold text-[#14233b] outline-none ring-1 ring-slate-100 focus:ring-[#0b587b]/30" /> : <h3 className="text-sm font-bold text-[#14233b]">{row.panel}</h3>}<p className="mt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400">Branches</p><div className="mt-1.5">{canEdit ? <PanelAvailabilityEditor value={row.availability} onChange={(availability) => void onUpdate(row.id, { availability })} /> : <div className="flex flex-wrap gap-1">{row.availability.length ? row.availability.map((location) => <span key={location} className="rounded-full bg-[#e8f7fd] px-2 py-1 text-[10px] font-medium text-[#0b587b]">{location}</span>) : <span className="text-xs text-slate-400">Not assigned</span>}</div>}</div></div>{canEdit && <button type="button" onClick={() => onDelete(row)} disabled={saving} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50" aria-label={`Remove ${row.panel}`}><Trash2 className="h-4 w-4" /></button>}</div><div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{row.guideUrl ? <button type="button" onClick={() => onGuide(row)} className="rounded-lg bg-[#e8f7fd] px-3 py-2 text-xs font-medium text-[#0b587b]"><BookOpen className="mr-1 inline h-3.5 w-3.5" />Open guide</button> : <span className="px-1 py-2 text-xs text-slate-400">No guide yet</span>}{canEdit ? <PanelPortalEditor value={row.portalUrl} onSave={(portalUrl) => onUpdate(row.id, { portalUrl })} onOpen={() => onPortal(row)} /> : row.portalUrl ? <button type="button" onClick={() => onPortal(row)} className="rounded-lg px-3 py-2 text-xs font-medium text-[#0b587b] hover:bg-slate-100">Open portal <ExternalLink className="inline h-3.5 w-3.5" /></button> : null}</div></article>)}</div>;
}

function PanelTrainingView({ training, canEdit }: { training: ReturnType<typeof usePanelTraining>; canEdit: boolean }) {
  const [selectedPanel, setSelectedPanelState] = useState<{ row: PanelTrainingRow; kind: "guide" | "portal" } | null>(null);
  const [importingGuide, setImportingGuide] = useState<typeof training.guides[number] | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const setSelectedPanel = (next: { row: PanelTrainingRow; kind: "guide" | "portal" } | null) => {
    if (next?.kind === "portal") {
      window.open(next.row.portalUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setSelectedPanelState(next);
  };
  let rows = training.panels.map((panel) => ({
    id: panel.id, panel: panel.name, availability: panel.availability || [], portalUrl: panel.portal_url || '',
    guideUrl: training.guides.find((guide) => guide.status === 'linked' && guide.panel_id === panel.id)?.drive_url || '',
  }));
  const panelCount = rows.length;
  const searchTerm = search.trim().toLowerCase();
  rows = rows.filter((row) => (!searchTerm || row.panel.toLowerCase().includes(searchTerm)) && (!branchFilter || row.availability.includes(branchFilter)));
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
  const deletePanel = async (row: PanelTrainingRow) => {
    if (!window.confirm(`Remove ${row.panel} from Panel Training? Its guide will be archived here, but the original PDF will remain in Google Drive.`)) return;
    setSaving(true);
    await training.mutate({ action: 'delete_panel', panelId: row.id });
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-bold text-slate-500">{training.loading && panelCount === 0 ? "Loading panel list…" : `${rows.length}${rows.length !== panelCount ? ` of ${panelCount}` : ''} panels listed`}</p><p className="mt-1 text-xs text-slate-400">Search by panel name or filter by branch.</p></div><span className="self-start rounded-full bg-[#e8f7fd] px-3 py-1.5 text-xs font-bold text-[#0b587b] sm:self-auto">{canEdit ? "Admin editing enabled" : "Staff reference · read-only"}</span></div>
    <div className="grid gap-3 rounded-2xl border border-[#dce4ed] bg-white p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_220px]"><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 text-[#60758c]"><Search className="h-4 w-4 shrink-0" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search panels…" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-[#14233b] outline-none placeholder:text-slate-400" /></label><select aria-label="Filter by branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="h-10 rounded-xl bg-slate-50 px-3 text-sm font-medium text-[#29465a] outline-none"><option value="">All branches</option>{PANEL_LOCATIONS.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></div>
    <section aria-busy={training.loading} className="overflow-hidden rounded-[24px] border border-[#dce4ed] bg-white shadow-[0_12px_30px_rgba(16,54,78,0.06)]">
      {training.loading && panelCount === 0 ? <div className="px-6 py-12 text-center"><div className="mx-auto flex max-w-xs items-center justify-center gap-3 text-sm font-semibold text-[#0b587b]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#b9e8f8] border-t-[#0b587b]" aria-hidden="true" />Loading panel training…</div></div> : rows.length === 0 ? <div className="px-6 py-12 text-center"><p className="text-sm font-medium text-slate-500">No panels match this search or branch filter.</p><button type="button" onClick={() => { setSearch(''); setBranchFilter(''); }} className="mt-3 text-sm font-medium text-[#0b587b] hover:text-[#0071e3]">Clear filters</button></div> : <><div className="p-3 lg:hidden"><PanelTrainingCards rows={rows} canEdit={canEdit} saving={saving} onUpdate={updatePanel} onGuide={(row) => setSelectedPanel({ row, kind: 'guide' })} onPortal={(row) => setSelectedPanel({ row, kind: 'portal' })} onDelete={(row) => void deletePanel(row)} /></div><div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[820px] table-fixed text-left"><thead className="bg-[#f7fafc]"><tr className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400"><th className="w-[22%] px-4 py-3">Panel</th><th className="w-[25%] px-4 py-3">Branches</th><th className="w-[16%] px-4 py-3">Guide</th><th className="w-[26%] px-4 py-3">Portal</th>{canEdit && <th className="w-[11%] px-4 py-3 text-right">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row.id} className="transition hover:bg-[#f8fcfe]"><td className="px-4 py-3.5 align-middle">{canEdit ? <input aria-label={`Panel name for ${row.panel}`} defaultValue={row.panel} onBlur={(event) => void updatePanel(row.id, { panel: event.target.value })} className="w-full rounded-lg bg-slate-50/70 px-2.5 py-1.5 text-sm font-medium text-[#14233b] outline-none transition hover:bg-slate-100 focus:bg-white" /> : <span className="text-sm font-medium text-[#14233b]">{row.panel}</span>}</td><td className="px-4 py-3.5 align-middle">{canEdit ? <PanelAvailabilityEditor value={row.availability} onChange={(availability) => void updatePanel(row.id, { availability })} /> : <div className="flex flex-wrap gap-1">{row.availability.length ? row.availability.map((location) => <span key={location} className="inline-flex rounded-full bg-[#eef8fc] px-2 py-1 text-[10px] font-medium text-[#0b587b]">{location}</span>) : <span className="text-xs text-slate-400">Not assigned</span>}</div>}</td><td className="px-4 py-3.5 align-middle">{row.guideUrl ? <button type="button" onClick={() => setSelectedPanel({ row, kind: "guide" })} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0b587b] transition hover:text-[#0071e3]"><BookOpen className="h-4 w-4 text-[#20aee0]" />Open guide<ExternalLink className="h-3.5 w-3.5" /></button> : <span className="text-xs text-slate-400">No guide yet</span>}</td><td className="px-4 py-3.5 align-middle">{canEdit ? <PanelPortalEditor value={row.portalUrl} onSave={(portalUrl) => updatePanel(row.id, { portalUrl })} onOpen={() => setSelectedPanel({ row, kind: "portal" })} /> : row.portalUrl ? <button type="button" onClick={() => setSelectedPanel({ row, kind: "portal" })} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0b587b] hover:text-[#0071e3]">Open portal<ExternalLink className="h-3.5 w-3.5" /></button> : <span className="text-xs text-slate-400">No portal yet</span>}</td>{canEdit && <td className="px-4 py-3.5 text-right align-middle"><button type="button" onClick={() => void deletePanel(row)} disabled={saving} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50" aria-label={`Remove ${row.panel}`}><Trash2 className="h-3.5 w-3.5" />Remove</button></td>}</tr>)}</tbody></table></div></>}
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
  return <ModalShell onClose={onClose} wide><div className="sticky top-0 z-20 -mx-6 -mt-6 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5 sm:-mx-8 sm:-mt-8 sm:px-8"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0b9aca]">Panel training</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{row.panel} · {kind === "guide" ? "Panel guide" : "Panel portal"}</h2><p className="mt-2 text-sm text-slate-500">{row.availability.join(", ") || "Availability not assigned"} · Official AraSpace reference</p></div><button type="button" onClick={onClose} className="relative z-30 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 transition hover:bg-slate-200" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"><iframe title={`${row.panel} ${kind}`} src={panelEmbedUrl(url)} scrolling="yes" className="h-[62vh] min-h-[480px] w-full" /></div><div className="relative z-20 mt-5 flex items-center justify-between gap-4"><p className="text-xs leading-5 text-slate-500">Scroll inside the guide to read the document. If the source does not support embedded scrolling, open the official source.</p><a href={url} target="_blank" rel="noreferrer" className="relative z-30 shrink-0 text-sm font-semibold text-[#0b587b] hover:text-[#0071e3]">Open source <ExternalLink className="inline h-3.5 w-3.5" /></a></div></ModalShell>;
}

const fieldClass = "w-full rounded-xl border border-[#dce4ed] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#0b587b] focus:ring-2 focus:ring-[#0b587b]/10";

function formatToday() {
  return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function AnnouncementsView({ announcements, canEdit, onSave }: { announcements: Announcement[]; canEdit: boolean; onSave: (next: Announcement[], message: string) => Promise<boolean> }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "", audience: "Semua staf", priority: "Biasa" as Announcement["priority"] });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.body.trim()) return;
    setSaving(true);
    const item: Announcement = { id: crypto.randomUUID(), title: draft.title.trim(), body: draft.body.trim(), audience: draft.audience.trim() || "Semua staf", priority: draft.priority, date: formatToday() };
    const saved = await onSave([item, ...announcements], "Announcement published");
    setSaving(false);
    if (saved) { setDraft({ title: "", body: "", audience: "Semua staf", priority: "Biasa" }); setAdding(false); }
  };

  const remove = async (item: Announcement) => {
    if (saving) return;
    setSaving(true);
    await onSave(announcements.filter((entry) => entry.id !== item.id), "Announcement removed");
    setSaving(false);
  };

  return <div className="mx-auto max-w-[1500px] space-y-6">
    <section className="flex flex-col gap-5 rounded-[30px] bg-[#0b3d59] p-8 text-white sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Team updates</p><h2 className="mt-2 text-3xl font-semibold">Announcements</h2><p className="mt-2 text-[#b9cfdd]">Operational changes and information staff need to know.</p></div>{canEdit && !adding && <button onClick={() => setAdding(true)} className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0b587b] transition hover:bg-[#eaf6fb] sm:self-auto"><Plus className="h-4 w-4" />New announcement</button>}</section>
    {canEdit && adding && <form onSubmit={submit} className="space-y-4 rounded-[24px] border border-[#dce4ed] bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">New announcement</h3><button type="button" onClick={() => setAdding(false)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="Cancel"><X className="h-5 w-5" /></button></div>
      <label className="block text-sm font-semibold text-slate-600">Title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={cn(fieldClass, "mt-1.5")} /></label>
      <label className="block text-sm font-semibold text-slate-600">Message<textarea required rows={4} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} className={cn(fieldClass, "mt-1.5 resize-y")} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-600">Audience<input value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value })} className={cn(fieldClass, "mt-1.5")} /></label>
        <label className="block text-sm font-semibold text-slate-600">Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Announcement["priority"] })} className={cn(fieldClass, "mt-1.5")}><option value="Biasa">Normal</option><option value="Penting">Important</option></select></label>
      </div>
      <div className="flex justify-end gap-3"><button type="button" onClick={() => setAdding(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button><button disabled={saving} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a4c6a] disabled:opacity-50">{saving ? "Publishing…" : "Publish"}</button></div>
    </form>}
    {announcements.length === 0 && <p className="rounded-[24px] border border-dashed border-[#dce4ed] bg-white p-8 text-center text-sm text-slate-500">No announcements yet.</p>}
    {announcements.map((item) => <article key={item.id} className={cn("rounded-[24px] border bg-white p-6 sm:p-7", item.priority === "Penting" ? "border-rose-200" : "border-[#dce4ed]")}><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 gap-4"><div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", item.priority === "Penting" ? "bg-rose-50 text-rose-600" : "bg-sky-50 text-sky-600")}><Bell className="h-5 w-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold">{item.title}</p>{item.priority === "Penting" && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-rose-700">Important</span>}</div><p className="mt-2 whitespace-pre-line leading-7 text-slate-600">{item.body}</p></div></div><div className="flex shrink-0 items-start gap-3 text-sm text-slate-400 sm:text-right"><div><p className="font-bold text-slate-600">{item.date}</p><p className="mt-1 text-xs">{item.audience}</p></div>{canEdit && <button onClick={() => void remove(item)} disabled={saving} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label={`Remove ${item.title}`} title="Remove"><Trash2 className="h-4 w-4" /></button>}</div></div></article>)}
  </div>;
}

function normalizeUrl(value: string) {
  const url = value.trim();
  return /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
}

function LinksView({ links, canEdit, onSave }: { links: QuickLink[]; canEdit: boolean; onSave: (next: QuickLink[], message: string) => Promise<boolean> }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: "", url: "", description: "", group: "" });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.url.trim()) return;
    setSaving(true);
    const item: QuickLink = { id: crypto.randomUUID(), title: draft.title.trim(), url: normalizeUrl(draft.url), description: draft.description.trim(), group: draft.group.trim() || "General" };
    const saved = await onSave([...links, item], "Link added");
    setSaving(false);
    if (saved) { setDraft({ title: "", url: "", description: "", group: "" }); setAdding(false); }
  };

  const remove = async (item: QuickLink) => {
    if (saving) return;
    setSaving(true);
    await onSave(links.filter((entry) => entry.id !== item.id), "Link removed");
    setSaving(false);
  };

  return <div className="mx-auto max-w-[1500px]">
    <section className="mb-6 flex flex-col gap-5 rounded-[30px] bg-[#0b3d59] p-8 text-white sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#70d8fa]">Quick access</p><h2 className="mt-2 text-3xl font-semibold">Important links</h2><p className="mt-2 text-[#b9cfdd]">Systems and forms used in daily operations.</p></div>{canEdit && !adding && <button onClick={() => setAdding(true)} className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#0b587b] transition hover:bg-[#eaf6fb] sm:self-auto"><Plus className="h-4 w-4" />New link</button>}</section>
    {canEdit && adding && <form onSubmit={submit} className="mb-6 space-y-4 rounded-[24px] border border-[#dce4ed] bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">New link</h3><button type="button" onClick={() => setAdding(false)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="Cancel"><X className="h-5 w-5" /></button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-600">Title<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={cn(fieldClass, "mt-1.5")} /></label>
        <label className="block text-sm font-semibold text-slate-600">URL<input required value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://" className={cn(fieldClass, "mt-1.5")} /></label>
        <label className="block text-sm font-semibold text-slate-600">Description<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className={cn(fieldClass, "mt-1.5")} /></label>
        <label className="block text-sm font-semibold text-slate-600">Group<input value={draft.group} onChange={(event) => setDraft({ ...draft, group: event.target.value })} placeholder="e.g. Systems, Forms" className={cn(fieldClass, "mt-1.5")} /></label>
      </div>
      <div className="flex justify-end gap-3"><button type="button" onClick={() => setAdding(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-100">Cancel</button><button disabled={saving} className="rounded-xl bg-[#0b587b] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a4c6a] disabled:opacity-50">{saving ? "Saving…" : "Add link"}</button></div>
    </form>}
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{links.map((link) => <div key={link.id} className="relative"><a href={link.url} target="_blank" rel="noreferrer" className="group block h-full rounded-[24px] bg-[#0b3d59] p-6 text-white transition hover:-translate-y-0.5 hover:bg-[#104b6c]"><div className="flex items-center justify-between"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#67cff4]"><Link2 className="h-5 w-5" /></div><ExternalLink className={cn("h-5 w-5 text-[#8eb2c6] group-hover:text-white", canEdit && "mr-11")} /></div><h3 className="mt-5 text-xl font-semibold">{link.title}</h3>{link.description && <p className="mt-2 text-sm text-[#b9cfdd]">{link.description}</p>}<p className="mt-5 text-xs font-bold uppercase tracking-wider text-[#67cff4]">{link.group}</p></a>{canEdit && <button onClick={() => void remove(link)} disabled={saving} className="absolute right-6 top-7 grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-[#b9cfdd] transition hover:bg-rose-500 hover:text-white disabled:opacity-50" aria-label={`Remove ${link.title}`} title="Remove"><Trash2 className="h-4 w-4" /></button>}</div>)}</div>
    {links.length === 0 && <p className="rounded-[24px] border border-dashed border-[#dce4ed] bg-white p-8 text-center text-sm text-slate-500">No links yet.</p>}
  </div>;
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
