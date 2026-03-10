import { createHmac, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

export type AuthContext = {
  userId: string;
  companyId: string;
  role?: string;
};

const AUTH_CONTEXT_KEY = Symbol("authContext");

function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? "";
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signHs256(unsignedToken: string, secret: string): string {
  return createHmac("sha256", secret).update(unsignedToken).digest("base64url");
}

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
}

function verifyJwt(token: string, secret: string): AuthContext | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const unsignedToken = `${headerPart}.${payloadPart}`;
  const expectedSig = signHs256(unsignedToken, secret);

  try {
    const expectedBuffer = Buffer.from(expectedSig);
    const actualBuffer = Buffer.from(signaturePart);
    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const payloadRaw = base64UrlDecode(payloadPart);
    const payload = JSON.parse(payloadRaw) as {
      sub?: string;
      company_id?: string;
      role?: string;
      exp?: number;
    };

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }
    if (!payload.sub || !payload.company_id) {
      return null;
    }

    return {
      userId: payload.sub,
      companyId: payload.company_id,
      role: payload.role
    };
  } catch {
    return null;
  }
}

export function getAuthContext(request: FastifyRequest): AuthContext | null {
  return ((request as unknown as Record<symbol, unknown>)[AUTH_CONTEXT_KEY] as AuthContext | undefined) ?? null;
}

export function setAuthContext(request: FastifyRequest, context: AuthContext): void {
  (request as unknown as Record<symbol, unknown>)[AUTH_CONTEXT_KEY] = context;
}

function isStrictAuthEnabled(): boolean {
  return process.env.APP_TENANCY_MODE === "multi_company" || process.env.AUTH_REQUIRED === "true";
}

export function authenticateRequest(request: FastifyRequest): AuthContext | null {
  const token = parseBearerToken(request);
  const secret = getJwtSecret();

  if (!token || !secret) {
    return null;
  }

  return verifyJwt(token, secret);
}

export async function enforceAuthContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const context = authenticateRequest(request);
  if (context) {
    setAuthContext(request, context);
    return true;
  }

  if (isStrictAuthEnabled()) {
    await reply.code(401).send({ message: "Authentication required for this API mode." });
    return false;
  }

  return true;
}
