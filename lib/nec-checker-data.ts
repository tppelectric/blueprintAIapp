export type NecChecklistItem = {
  id: string;
  section: string;
  label: string;
  necRef: string;
  /** Plain English when unchecked (fail) */
  resolution: string;
};

export const NEC_CHECKLIST_SECTIONS: { title: string; nec: string; items: NecChecklistItem[] }[] =
  [
    {
      title: "Receptacles",
      nec: "NEC 210.52",
      items: [
        {
          id: "r1",
          section: "Receptacles",
          label: "No wall space greater than 6 ft from an outlet?",
          necRef: "210.52(A)(1)",
          resolution:
            "Add receptacles so no point along the floor line is more than 6 ft from an outlet along the wall space.",
        },
        {
          id: "r2",
          section: "Receptacles",
          label: "Kitchen has receptacles along all countertops?",
          necRef: "210.52(C)",
          resolution:
            "Install receptacles so no countertop space exceeds 24 in. from a receptacle along the wall line.",
        },
        {
          id: "r3",
          section: "Receptacles",
          label: "Bathroom has receptacle within 3 ft of basin?",
          necRef: "210.52(D)",
          resolution:
            "Place at least one receptacle within 3 ft of the outside edge of each basin.",
        },
        {
          id: "r4",
          section: "Receptacles",
          label: "All bathroom receptacles are GFCI protected?",
          necRef: "210.8(A)(1)",
          resolution: "Provide Class A GFCI protection for all 125V receptacles in bathrooms.",
        },
        {
          id: "r5",
          section: "Receptacles",
          label: "Garage has at least one receptacle?",
          necRef: "210.52(G)(1)",
          resolution: "Install at least one 120V, 15A or 20A receptacle in each attached garage.",
        },
        {
          id: "r6",
          section: "Receptacles",
          label: "All garage receptacles are GFCI protected?",
          necRef: "210.8(A)(2)",
          resolution: "Provide GFCI protection for 125V receptacles in garages (with listed exceptions).",
        },
        {
          id: "r7",
          section: "Receptacles",
          label: "Outdoor receptacles at front and back?",
          necRef: "210.52(E)",
          resolution:
            "Provide readily accessible outdoor receptacles for front and back (see spacing exceptions).",
        },
        {
          id: "r8",
          section: "Receptacles",
          label: "All outdoor receptacles are GFCI / weather resistant?",
          necRef: "210.8(A)(3), 406.9",
          resolution:
            "Use GFCI and weather-resistant receptacles where required for outdoor locations.",
        },
        {
          id: "r9",
          section: "Receptacles",
          label: "Crawl space receptacles are GFCI?",
          necRef: "210.8(A)(7)",
          resolution: "GFCI-protect 125V receptacles installed in crawl spaces at or below grade.",
        },
        {
          id: "r10",
          section: "Receptacles",
          label: "Unfinished basement receptacles are GFCI?",
          necRef: "210.8(A)(5)",
          resolution: "GFCI-protect 125V receptacles in unfinished basements (exceptions apply).",
        },
      ],
    },
    {
      title: "AFCI protection",
      nec: "NEC 210.12",
      items: [
        {
          id: "a1",
          section: "AFCI",
          label: "Bedroom circuits have AFCI protection?",
          necRef: "210.12(A)",
          resolution:
            "Provide listed combination-type AFCI protection for 120V branch circuits supplying outlets in bedrooms.",
        },
        {
          id: "a2",
          section: "AFCI",
          label: "Living room circuits have AFCI protection?",
          necRef: "210.12(A)",
          resolution: "Extend AFCI protection to living room outlets per dwelling unit rules.",
        },
        {
          id: "a3",
          section: "AFCI",
          label: "Dining room circuits have AFCI protection?",
          necRef: "210.12(A)",
          resolution: "Extend AFCI protection to dining room outlets per dwelling unit rules.",
        },
        {
          id: "a4",
          section: "AFCI",
          label: "Kitchen circuits have AFCI protection?",
          necRef: "210.12(A)",
          resolution:
            "AFCI applies to kitchen outlets except where GFCI-only is permitted; coordinate GFCI/AFCI devices.",
        },
        {
          id: "a5",
          section: "AFCI",
          label: "Hallway circuits have AFCI protection?",
          necRef: "210.12(A)",
          resolution: "Provide AFCI for hallway branch circuits supplying 120V outlets.",
        },
        {
          id: "a6",
          section: "AFCI",
          label: "Closet circuits have AFCI protection?",
          necRef: "210.12(A)",
          resolution: "Provide AFCI for closet outlets where required as dwelling unit outlets.",
        },
      ],
    },
    {
      title: "Kitchen",
      nec: "NEC 210.52(B)",
      items: [
        {
          id: "k1",
          section: "Kitchen",
          label: "Minimum 2 small-appliance circuits (20A)?",
          necRef: "210.11(C)(1), 210.52(B)(1)",
          resolution:
            "Install at least two 20A small-appliance branch circuits for kitchen receptacle outlets.",
        },
        {
          id: "k2",
          section: "Kitchen",
          label: "Refrigerator on dedicated circuit?",
          necRef: "210.52(B)(1) Ex 2",
          resolution:
            "Place refrigerator on an individual branch circuit where required; verify local interpretation.",
        },
        {
          id: "k3",
          section: "Kitchen",
          label: "Dishwasher on dedicated circuit?",
          necRef: "210.52(B)(1) Ex 1",
          resolution: "Do not combine dishwasher with small-appliance circuits; use dedicated branch.",
        },
        {
          id: "k4",
          section: "Kitchen",
          label: "Microwave on dedicated circuit?",
          necRef: "210.52(B)(2)",
          resolution:
            "If cord-and-plug microwave is installed, provide outlet per small-appliance rules (often dedicated in practice).",
        },
      ],
    },
    {
      title: "Bathrooms",
      nec: "NEC 210.11(C)(3)",
      items: [
        {
          id: "b1",
          section: "Bathrooms",
          label: "Dedicated 20A circuit for bathroom receptacles?",
          necRef: "210.11(C)(3)",
          resolution:
            "At least one 20A branch circuit supplies bathroom receptacle outlets (no other outlets on that circuit unless exceptions met).",
        },
        {
          id: "b2",
          section: "Bathrooms",
          label: "All receptacles are GFCI?",
          necRef: "210.8(A)(1)",
          resolution: "GFCI-protect all 125V receptacles installed in bathrooms.",
        },
        {
          id: "b3",
          section: "Bathrooms",
          label: "Exhaust fan installed where required?",
          necRef: "MEC / IRC ventilation — coordinate",
          resolution:
            "Verify mechanical exhaust per building code; electrical circuit sized per fan load and manufacturer instructions.",
        },
      ],
    },
    {
      title: "Service",
      nec: "NEC 230.79",
      items: [
        {
          id: "s1",
          section: "Service",
          label: "Service size adequate for calculated load?",
          necRef: "220, 230.79",
          resolution:
            "Complete load calculation per Article 220; upgrade service or reduce load to match available capacity.",
        },
        {
          id: "s2",
          section: "Service",
          label: "Main disconnect properly rated?",
          necRef: "230.70, 240",
          resolution:
            "Main disconnect ampacity must be not less than calculated load and service conductor ampacity.",
        },
        {
          id: "s3",
          section: "Service",
          label: "NYS 2023: 200A minimum for new single-family dwelling?",
          necRef: "NYS / local amendment",
          resolution:
            "Confirm with NYS and local amendments: many jurisdictions require minimum 200A service for new one-family dwellings.",
        },
      ],
    },
    {
      title: "EV charger",
      nec: "NEC 625.40",
      items: [
        {
          id: "e1",
          section: "EV",
          label: "Dedicated circuit for EV charger?",
          necRef: "625.40",
          resolution:
            "EV supply equipment must be on an individual branch circuit; no other outlets on that circuit.",
        },
        {
          id: "e2",
          section: "EV",
          label: "Circuit sized correctly (40A min typical for Level 2)?",
          necRef: "625.41, 625.42",
          resolution:
            "Size conductors and OCP per continuous load (125%) and manufacturer rating; 40A branch common for 32A continuous output.",
        },
        {
          id: "e3",
          section: "EV",
          label: "GFCI protection where required?",
          necRef: "625.54, 210.8",
          resolution:
            "Apply GFCI where required for receptacle-type EVSE; follow 2023 NEC and product listing constraints.",
        },
        {
          id: "e4",
          section: "EV",
          label: "Outdoor outlet / EVSE weatherproof?",
          necRef: "625.50, 406.9",
          resolution: "Use weatherproof enclosures and in-use covers for outdoor EVSE installations.",
        },
      ],
    },
  ];

export const ALL_CHECKLIST_ITEMS: NecChecklistItem[] =
  NEC_CHECKLIST_SECTIONS.flatMap((s) => s.items);

export function countViolations(
  answers: Record<string, boolean | undefined>,
): { pass: number; fail: number; total: number } {
  let pass = 0;
  let fail = 0;
  for (const item of ALL_CHECKLIST_ITEMS) {
    const v = answers[item.id];
    if (v === true) pass++;
    else if (v === false) fail++;
  }
  return { pass, fail, total: ALL_CHECKLIST_ITEMS.length };
}
