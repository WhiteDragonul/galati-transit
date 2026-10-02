// Forma datelor brute descărcate de pe transurbgalati.ro (data/raw/transurb-*.json).

export interface TransurbTimetable {
  dayType: string; // ex. „DE LUNI PÂNĂ VINERI”
  times: string[]; // „HH:MM”, în ordinea de pe site
  other: string[]; // celule care nu sunt ore (păstrate ca să nu pierdem nimic)
}

export interface TransurbStop {
  name: string; // numele oficial, așa cum apare pe site
  url: string;
  timetables: TransurbTimetable[];
}

export interface TransurbVariant {
  key: string; // parametrul variantaStatii (ex. „standard”, „S”)
  label: string | null; // eticheta variantei de pe site
  tur: TransurbStop[];
  retur: TransurbStop[];
}

export interface TransurbLine {
  ref: string;
  section: 'urban' | 'extraurban';
  colorClass: string | null; // grupa de culoare de pe site
  category: 'bus' | 'trolleybus' | 'tram';
  url: string;
  variants: TransurbVariant[];
}

export interface TransurbRaw {
  fetchedAt: string;
  source: string;
  lines: TransurbLine[];
}
