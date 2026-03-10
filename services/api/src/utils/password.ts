import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, storedDerived] = storedHash.split(":");
  if (!salt || !storedDerived) {
    return false;
  }

  try {
    const provided = scryptSync(password, salt, KEY_LENGTH).toString("hex");
    const providedBuffer = Buffer.from(provided, "hex");
    const storedBuffer = Buffer.from(storedDerived, "hex");
    if (providedBuffer.length !== storedBuffer.length) {
      return false;
    }
    return timingSafeEqual(providedBuffer, storedBuffer);
  } catch {
    return false;
  }
}
