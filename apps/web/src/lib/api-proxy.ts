import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";
const SESSION_COOKIE = "app_session";

function getCookieValue(cookieHeader: string, key: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === key) {
      return decodeURIComponent(rawValue.join("=") || "");
    }
  }
  return null;
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? "local-dev-session-secret";
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function getCompanyIdFromSignedSession(cookieHeader: string): string | null {
  const token = getCookieValue(cookieHeader, SESSION_COOKIE);
  if (!token) {
    return null;
  }

  const decoded = decodeURIComponent(token);
  const [data, sig] = decoded.split(".");
  if (!data || !sig) {
    return null;
  }

  const expected = sign(data);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(sig, "utf8");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as { companyId?: string };
    return payload.companyId?.trim() || null;
  } catch {
    return null;
  }
}

function buildForwardHeaders(request: Request, includeJson: boolean): Headers {
  const headers = new Headers();
  const authHeader = request.headers.get("authorization");
  const companyHeader = request.headers.get("x-company-id");
  const companyFromCookie = getCompanyIdFromSignedSession(request.headers.get("cookie") ?? "");
  const effectiveCompanyHeader = companyHeader ?? companyFromCookie;

  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  if (effectiveCompanyHeader) {
    headers.set("x-company-id", effectiveCompanyHeader);
  }
  if (includeJson) {
    headers.set("content-type", "application/json");
  }

  return headers;
}

async function proxyRequest(request: Request, path: string, init: RequestInit): Promise<NextResponse> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, init);
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as unknown;
      return NextResponse.json(payload, { status: response.status });
    }

    const text = await response.text();
    return NextResponse.json(
      {
        message: text || `Backend request failed (${response.status})`
      },
      { status: response.status }
    );
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 502 });
  }
}

export async function proxyGet(request: Request, path: string): Promise<NextResponse> {
  return proxyRequest(request, path, {
    method: "GET",
    cache: "no-store",
    headers: buildForwardHeaders(request, false)
  });
}

export async function proxyPost(request: Request, path: string): Promise<NextResponse> {
  return proxyRequest(request, path, {
    method: "POST",
    headers: buildForwardHeaders(request, false)
  });
}

export async function proxyPostJson(request: Request, path: string, body: unknown): Promise<NextResponse> {
  return proxyRequest(request, path, {
    method: "POST",
    headers: buildForwardHeaders(request, true),
    body: JSON.stringify(body)
  });
}

export async function proxyPutJson(request: Request, path: string, body: unknown): Promise<NextResponse> {
  return proxyRequest(request, path, {
    method: "PUT",
    headers: buildForwardHeaders(request, true),
    body: JSON.stringify(body)
  });
}

export async function proxyDelete(request: Request, path: string): Promise<NextResponse> {
  return proxyRequest(request, path, {
    method: "DELETE",
    headers: buildForwardHeaders(request, false)
  });
}
