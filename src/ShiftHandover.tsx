import { CheckCircle2, ClipboardCheck, MessageCircle, Moon, Sun } from "lucide-react";

export type Shift = "AM" | "PM";

export type GuideSection = {
  title: string;
  items: string[];
};

export type ShiftGuide = { label: string; hours: string; summary: string; sections: GuideSection[] };
export type ShiftGuides = Record<Shift, ShiftGuide>;

export const shiftGuides: ShiftGuides = {
  AM: {
    label: "AM Shift tasks",
    hours: "9:00 AM – 9:00 PM",
    summary: "A daily task reference for the day team.",
    sections: [
      { title: "Medicine", items: ["Count low-stock / out-of-stock medicine.", "Repack relevant medicine when needed."] },
      { title: "Clinic supplies", items: ["Inform Clinical Admin of any items that need purchasing.", "List non-medicine items already informed to Clinical Admin, for example Dengue Combo Test."] },
      { title: "Clinic cleanliness", items: ["Dispose of rubbish.", "Ensure toilets and all clinic areas are clean.", "Sterilise used equipment.", "Sanitise clinic and playground with nanospray and hydrogen peroxide."] },
      { title: "Finance", items: ["Record cash vouchers and approvals correctly.", "Open a CV if petty cash is used and inform the responsible person."] },
      { title: "Patient engagement & TeamARA", items: ["Invite Google reviews by QR code when appropriate.", "Send appointment reminders for the following day.", "Request locum doctor feedback by QR code.", "Take a patient photo with the placard only with permission.", "Post WhatsApp status, complete TeamARA registration and generate outstanding TeamARA cards.", "Follow up PEKAB40 when required."] },
      { title: "Laboratory", items: ["Ensure samples are labelled correctly, forms are completed and samples are sent to the laboratory.", "Inform Clinical Admin of equipment issues.", "Update results with patients.", "Update results and samples in the WhatsApp group.", "Update results in Plato."] },
      { title: "Panel & TeamARA checking", items: ["Double-check all panel submissions before leaving and ensure each claim is correct.", "Double-check TeamARA subscriptions and photos in Plato before leaving."] },
    ],
  },
  PM: {
    label: "PM Shift tasks",
    hours: "9:00 PM – 9:00 AM",
    summary: "A daily task reference for the night team.",
    sections: [
      { title: "Medicine", items: ["Count low-stock / out-of-stock medicine.", "Repack relevant medicine when needed."] },
      { title: "Clinic supplies", items: ["Inform Clinical Admin of any items that need purchasing.", "List non-medicine items already informed to Clinical Admin, for example Combo Test stock."] },
      { title: "Clinic cleanliness", items: ["Sweep rubbish and mop floors.", "Clean toilets and ensure every clinic area remains clean.", "Sterilise used equipment and dispose of rubbish.", "Sanitise clinic and playground with nanospray and hydrogen peroxide."] },
      { title: "Finance & documents", items: ["Record cash vouchers and approvals correctly.", "Open a CV if petty cash is used and inform the responsible person.", "Print clinic address labels, notification forms, appointment cards, CV forms and the sales template when required.", "Follow up PEKAB40 when required."] },
      { title: "Panel checking", items: ["Double-check all panel submissions before leaving and ensure each claim is correct."] },
    ],
  },
};

export default function ShiftHandoverView({ guides = shiftGuides }: { guides?: ShiftGuides }) {
  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <section className="rounded-[30px] bg-[#0b3d59] p-7 text-white sm:p-10">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#70d8fa]">Clinic Assistants · Staff reference</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Shift passover guide</h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#bed2df]">Daily task templates for the AM and PM team.</p>
          </div>
          <p className="max-w-xs text-sm leading-6 text-[#bed2df] lg:text-right">Choose either card below to view the full daily task guide.</p>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-[26px] border border-[#8cdbf7] bg-[#edf9fe] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0b3d59] text-[#70d8fa]"><MessageCircle className="h-6 w-6" /></div>
          <div><p className="font-semibold text-[#14233b]">Actual passover stays on WhatsApp</p><p className="mt-1 max-w-2xl text-sm leading-6 text-[#60758c]">AraSpace does not record, submit or replace the WhatsApp passover channel. This page is only a template and daily-task guide for staff training.</p></div>
        </div>
        <span className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#0b587b] shadow-sm">Reference only</span>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {(["AM", "PM"] as Shift[]).map((shift) => {
          const guide = guides[shift];
          const Icon = shift === "AM" ? Sun : Moon;

          return <section key={shift} className="overflow-hidden rounded-[30px] border border-[#dce4ed] bg-white shadow-[0_15px_40px_rgba(16,54,78,0.06)]">
            <div className="flex flex-col gap-5 bg-[#f9fbfc] p-7 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#e8f7fd] text-[#0b587b]"><Icon className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#0b9aca]">{shift} shift · {guide.hours}</p><h3 className="mt-1.5 text-2xl font-semibold tracking-tight text-[#14233b]">{guide.label}</h3><p className="mt-1 text-sm leading-6 text-[#60758c]">{guide.summary}</p></div></div>
            </div>
            <div className="divide-y divide-[#e7edf2]">{guide.sections.map((section, index) => <div key={section.title} className="p-5"><div className="flex items-baseline gap-3"><p className="text-[11px] font-bold text-[#0b9aca]">0{index + 1}</p><h4 className="text-sm font-semibold text-[#14233b]">{section.title}</h4></div><ul className="mt-3 space-y-1.5 pl-6">{section.items.map((item) => <li key={item} className="list-disc pl-1 text-[12px] leading-5 text-[#60758c] marker:text-[#0b9aca]">{item}</li>)}</ul></div>)}</div>
          </section>;
        })}
      </div>

      <section className="rounded-[26px] border border-[#dce4ed] bg-white p-6 sm:p-8"><div className="flex items-center gap-3"><ClipboardCheck className="h-5 w-5 text-[#0b587b]" /><div><h3 className="font-semibold">How to use this guide</h3><p className="mt-1 text-sm text-[#60758c]">Read the relevant AM or PM list, complete your normal work, then share only outstanding matters through the official WhatsApp passover.</p></div></div><div className="mt-6 grid gap-3 md:grid-cols-3">{["Use the correct shift template.", "Do not leave out any important passovers.", "Send real handover through WhatsApp."].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-[#f7f9fc] p-4 text-sm font-medium text-[#526a80]"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />{item}</div>)}</div></section>

    </div>
  );
}
