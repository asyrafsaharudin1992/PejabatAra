// The AraOffice logo, used where an office shows its name (the top of the menu, the phone header, the sign-in page) instead of a plain icon.
// The logo is dark blue, so it sits in a thin white frame to stand out on the dark blue menu.
export function AraLogo({ className = 'h-11 w-11' }: { className?: string }) {
  return <span className={`inline-flex shrink-0 items-center justify-center bg-white p-[2px] shadow-[0_2px_8px_rgba(0,0,0,0.25)] ${className}`}><img src="/icons/araoffice-192.png" alt="AraOffice" width={96} height={96} draggable={false} className="h-full w-full rounded-[inherit] object-contain" /></span>;
}
