// A staff member's photo in a circle, or their initials when there is no photo (or it cannot be shown).
const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
export function StaffAvatar({ name, url, size = 40, className = '' }: { name: string; url?: string; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) };
  if (url) return <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" style={style} className={`shrink-0 rounded-full bg-slate-100 object-cover ${className}`} />;
  return <span aria-hidden="true" style={style} className={`grid shrink-0 place-items-center rounded-full bg-[#d6eef7] font-semibold text-[#0b3d59] ${className}`}>{initialsOf(name)}</span>;
}
