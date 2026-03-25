export type QuickRefCardDef = {
  anchorId: string;
  printId: string;
  title: string;
  pdfSlug: string;
  /** Bullets / lines for PDF and print HTML */
  lines: string[];
  keywords: string;
};

export const QUICK_REFERENCE_CARDS: QuickRefCardDef[] = [
  {
    anchorId: "ref-card-wire-sizing",
    printId: "ref-print-wire-sizing",
    title: "Wire Sizing Quick Reference",
    pdfSlug: "wire-sizing-quick-reference",
    lines: [
      "15A = 14 AWG",
      "20A = 12 AWG",
      "30A = 10 AWG",
      "40A = 8 AWG",
      "50A = 6 AWG",
      "60A = 6 AWG",
      "100A = 1 AWG",
      "200A = 3/0 AWG",
    ],
    keywords:
      "wire sizing awg breaker ampacity 14 12 10 8 6 1 3/0 15 20 30 40 50 60 100 200",
  },
  {
    anchorId: "ref-card-gfci-locations",
    printId: "ref-print-gfci-locations",
    title: "GFCI Required Locations",
    pdfSlug: "gfci-required-locations",
    lines: [
      "Bathrooms",
      "Kitchens (within 6 ft of sink)",
      "Garages",
      "Outdoors",
      "Crawl spaces",
      "Unfinished basements",
      "Boathouses",
      "Pool/spa areas",
      "Rooftops",
    ],
    keywords:
      "gfci ground fault bathroom kitchen garage outdoor basement rooftop pool spa boathouse nec 210.8",
  },
  {
    anchorId: "ref-card-afci-locations",
    printId: "ref-print-afci-locations",
    title: "AFCI Required Locations",
    pdfSlug: "afci-required-locations",
    lines: [
      "All 120V 15A and 20A circuits",
      "Bedrooms (since 1999 NEC)",
      "Living rooms, parlors, libraries",
      "Dens, sunrooms, recreation rooms",
      "Closets, hallways, laundry areas",
      "All dwelling unit areas (2020 NEC)",
    ],
    keywords:
      "afci arc fault bedroom living dwelling 15a 20a 120v nec 210.12 closet hallway laundry",
  },
  {
    anchorId: "ref-card-box-fill",
    printId: "ref-print-box-fill",
    title: "Common Box Fill Values",
    pdfSlug: "box-fill-values",
    lines: [
      "14 AWG = 2.0 cubic inches",
      "12 AWG = 2.25 cubic inches",
      "Switch/receptacle = 2× largest wire",
      "Internal clamps = 1× largest wire",
      "Grounding conductors = 1× largest",
    ],
    keywords:
      "box fill 314.16 cubic inch device clamp ground conductor switch receptacle",
  },
  {
    anchorId: "ref-card-conduit-fill",
    printId: "ref-print-conduit-fill",
    title: "Conduit Fill (max 40%)",
    pdfSlug: "conduit-fill-emt",
    lines: [
      '1/2" EMT: 3× 14 AWG THHN',
      '3/4" EMT: 5× 14 AWG THHN',
      '1" EMT: 8× 14 AWG THHN',
      '1-1/4" EMT: 14× 14 AWG THHN',
    ],
    keywords:
      "conduit fill emt thhn 14 awg half three quarter inch 40 percent chapter 9",
  },
  {
    anchorId: "ref-card-central-hudson",
    printId: "ref-print-central-hudson",
    title: "Central Hudson Requirements",
    pdfSlug: "central-hudson-requirements",
    lines: [
      "Meter socket: 200A ringless",
      "Service entrance: minimum 1\" conduit",
      "Meter height: 4–6 feet AFF",
      "Clearances per utility specs",
      "Blue Book 2026 reference",
    ],
    keywords:
      "central hudson utility meter socket ringless service entrance conduit blue book 2026 clearance aff",
  },
];

export function quickReferenceCardsSearchHits() {
  return QUICK_REFERENCE_CARDS.map((c) => ({
    kind: "card",
    title: c.title,
    subtitle: "Quick reference card",
    href: `/reference#${c.anchorId}`,
    anchorId: c.anchorId,
    printId: c.printId,
    keywords: `${c.title} ${c.keywords} ${c.lines.join(" ")}`,
  }));
}
