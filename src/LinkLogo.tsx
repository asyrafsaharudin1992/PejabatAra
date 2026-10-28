import { BookOpen, CalendarDays, FileText, HeartPulse, Link2, ListOrdered, MessageSquare, Stethoscope } from "lucide-react";
import { cn } from "./lib/utils";

// Quick Access style icon: picked from the link's words, coloured from its title.
const linkIcons: [RegExp, typeof Link2][] = [[/queue|giliran/i, ListOrdered], [/locum|doctor|doktor/i, Stethoscope], [/feedback|maklum ?balas|survey/i, MessageSquare], [/care|sihat|health|patient|pesakit/i, HeartPulse], [/rujukan|reference|guide|panduan/i, BookOpen], [/form|borang/i, FileText], [/jadual|schedule|roster|calendar/i, CalendarDays]];
const linkTones = ["text-[#20c7f4]", "text-emerald-400", "text-[#ffb000]", "text-[#ff7ab6]", "text-[#7258ff]", "text-[#ff6b81]"];
export function LinkLogo({ link }: { link: { title: string; description?: string; group?: string } }) {
  const words = `${link.title} ${link.description || ""} ${link.group || ""}`;
  const Icon = linkIcons.find(([pattern]) => pattern.test(words))?.[1] || Link2;
  const tone = linkTones[[...link.title].reduce((sum, char) => sum + char.charCodeAt(0), 0) % linkTones.length];
  return <span className={cn("grid h-10 w-10 place-items-center rounded-full bg-white/10", tone)}><Icon className="h-5 w-5" /></span>;
}

