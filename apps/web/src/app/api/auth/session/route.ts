import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "app_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type SessionPayload = {
  companyId: string;
  companyName: string;
  userName: string;
  userRole: string;
  userEmail: string;
};

type SessionResponse = {
  signedIn: boolean;
  companyId: string | null;
  companyName: string | null;
  userName: string | null;
  userRole: string | null;
  userEmail: string | null;
};

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET or JWT_SECRET must be configured in production.");
  }
  return "local-dev-session-secret";
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function encodeSession(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = sign(data);
  return `${data}.${sig}`;
}

function decodeSession(token: string | undefined): SessionPayload | null {
  if (!token) {
    return null;
  }
  const [data, sig] = token.split(".");
  if (!data || !sig) {
    return null;
  }
  const expected = sign(data);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const sigBuffer = Buffer.from(sig, "utf8");
  if (expectedBuffer.length !== sigBuffer.length || !timingSafeEqual(expectedBuffer, sigBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.companyId || !parsed.companyName || !parsed.userName) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toResponse(session: SessionPayload | null): SessionResponse {
  if (!session) {
    return {
      signedIn: false,
      companyId: null,
      companyName: null,
      userName: null,
      userRole: null,
      userEmail: null
    };
  }

  return {
    signedIn: true,
    companyId: session.companyId,
    companyName: session.companyName,
    userName: session.userName,
    userRole: session.userRole,
    userEmail: session.userEmail
  };
}

export async function GET(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)app_session=([^;]+)/)?.[1];
  return NextResponse.json(toResponse(decodeSession(token ? decodeURIComponent(token) : undefined)));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<SessionPayload>;
  const payload: SessionPayload = {
    companyId: body.companyId?.trim() ?? "",
    companyName: body.companyName?.trim() ?? "",
    userName: body.userName?.trim() ?? "Company Admin",
    userRole: body.userRole?.trim() ?? "admin",
    userEmail: body.userEmail?.trim() ?? ""
  };

  if (!payload.companyId || !payload.companyName) {
    return NextResponse.json({ message: "Company sign-in requires company ID and company name." }, { status: 400 });
  }

  const response = NextResponse.json(toResponse(payload));
  response.cookies.set(SESSION_COOKIE, encodeURIComponent(encodeSession(payload)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ signedIn: false });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
