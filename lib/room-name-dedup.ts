/**
 * Conservative room-name matching for cross-page / cross-sheet deduplication.
 * Prefer under-merging: only merge when names are clearly the same room.
 */

const DISTINGUISHING_QUALIFIERS = new Set([
  "master",
  "primary",
  "secondary",
  "guest",
  "jr",
  "junior",
  "half",
  "powder",
  "ensuite",
  "suite",
  "upper",
  "lower",
  "north",
  "south",
  "east",
  "west",
]);

/** Extra tokens allowed when one name extends another (open-plan labels). */
const COMPOUND_SUFFIX_TOKENS = new Set([
  "living",
  "dining",
  "area",
  "space",
  "entry",
  "foyer",
  "hall",
]);

const STOP_WORDS = new Set(["the", "a", "an", "room", "rm", "and"]);

export function normalizeRoomNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[&/]/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function roomNameTokens(name: string): string[] {
  return normalizeRoomNameForMatch(name)
    .split(" ")
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

type ParsedRoomName = {
  tokens: string[];
  trailingNumber: number | null;
  qualifiers: Set<string>;
  baseTokens: string[];
};

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function parseRoomName(name: string): ParsedRoomName {
  const raw = roomNameTokens(name);
  const qualifiers = new Set<string>();
  const tokens: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const t = raw[i]!;
    if (t === "en" && raw[i + 1] === "suite") {
      qualifiers.add("ensuite");
      i += 1;
      continue;
    }
    if (DISTINGUISHING_QUALIFIERS.has(t)) {
      qualifiers.add(t);
      continue;
    }
    if (/^[a-d]$/.test(t)) {
      qualifiers.add(`letter:${t}`);
      continue;
    }
    tokens.push(t);
  }

  let trailingNumber: number | null = null;
  const baseTokens = [...tokens];
  if (baseTokens.length > 0) {
    const last = baseTokens[baseTokens.length - 1]!;
    if (/^\d+$/.test(last)) {
      trailingNumber = parseInt(last, 10);
      baseTokens.pop();
    }
  }

  return { tokens, trailingNumber, qualifiers, baseTokens };
}

/**
 * True only when two names are clearly the same room with different labeling.
 * Never merges numbered variants, qualifier variants, or ambiguous pairs.
 */
export function roomNamesSimilar(a: string, b: string): boolean {
  const pa = parseRoomName(a);
  const pb = parseRoomName(b);

  const na = normalizeRoomNameForMatch(a);
  const nb = normalizeRoomNameForMatch(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  if (!setsEqual(pa.qualifiers, pb.qualifiers)) return false;

  if (pa.trailingNumber !== null && pb.trailingNumber !== null) {
    if (pa.trailingNumber !== pb.trailingNumber) return false;
  } else if (pa.trailingNumber !== null || pb.trailingNumber !== null) {
    return false;
  }

  const baseA = pa.baseTokens;
  const baseB = pb.baseTokens;

  if (baseA.join(" ") === baseB.join(" ")) return true;

  const [shorter, longer] =
    baseA.length <= baseB.length ? [baseA, baseB] : [baseB, baseA];

  if (shorter.length > 0 && shorter.every((t) => longer.includes(t))) {
    const extra = longer.filter((t) => !shorter.includes(t));
    if (extra.length > 0 && extra.every((t) => COMPOUND_SUFFIX_TOKENS.has(t))) {
      return true;
    }
  }

  if (baseA.length === 1 && baseB.length === 1) {
    const [s, l] =
      baseA[0]!.length <= baseB[0]!.length
        ? [baseA[0]!, baseB[0]!]
        : [baseB[0]!, baseA[0]!];
    if (s.length >= 4 && l.startsWith(s) && s !== l) return true;
  }

  return false;
}

function pickDim(a: number | null, b: number | null): number | null {
  if (a != null && a > 0 && b != null && b > 0) return Math.max(a, b);
  if (a != null && a > 0) return a;
  if (b != null && b > 0) return b;
  return null;
}

/**
 * Greedy merge: each room matches the first same-floor room with a similar name.
 */
export function mergeRoomsByFloorAndSimilarName<T>(
  rooms: T[],
  getFloor: (r: T) => number,
  getName: (r: T) => string,
  mergePair: (existing: T, incoming: T) => T,
): T[] {
  const result: T[] = [];
  for (const room of rooms) {
    const floor = getFloor(room);
    const name = getName(room);
    let matchIdx = -1;
    for (let i = 0; i < result.length; i++) {
      const existing = result[i]!;
      if (
        getFloor(existing) === floor &&
        roomNamesSimilar(name, getName(existing))
      ) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx >= 0) {
      result[matchIdx] = mergePair(result[matchIdx]!, room);
    } else {
      result.push(room);
    }
  }
  return result;
}

export function computeRoomScanTotals(
  rooms: { sq_ft?: number | null; floor?: number | null }[],
): {
  totalSq: number;
  floors: number;
  roomCount: number;
} {
  if (!rooms.length) {
    return { totalSq: 0, floors: 0, roomCount: 0 };
  }
  let totalSq = 0;
  const floorSet = new Set<number>();
  for (const r of rooms) {
    if (r.sq_ft != null && r.sq_ft > 0) totalSq += r.sq_ft;
    if (r.floor != null && Number.isFinite(r.floor)) {
      floorSet.add(Math.round(r.floor));
    }
  }
  return {
    totalSq: Math.round(totalSq),
    floors: floorSet.size > 0 ? floorSet.size : 1,
    roomCount: rooms.length,
  };
}

export { pickDim };
