// Tipurile de zi din orarele oficiale („De luni până vineri”, „Weekend și sărbători legale”).
// Modul pur (fără DOM), folosit și de planificator în teste.
export const isWeekendLabel = (s: string) => /weekend|s[âa]mb[ăa]t|duminic/i.test(s);
export const isWeekdayLabel = (s: string) => /luni|lucr[ăa]toare/i.test(s);
export const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

/** indexul tipului de zi potrivit, sau -1 dacă linia nu are orar pentru acel tip de zi */
export const dayIndex = (dayTypes: string[], weekend: boolean) => dayTypes.findIndex((d) => (weekend ? isWeekendLabel(d) : isWeekdayLabel(d)));
