import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDbPool } from "../db/postgres.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { getAuthContext } from "../utils/auth.js";

const loginSchema = z.object({
  companyId: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8)
});

const onboardAdminSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  companyId: z.string().trim().min(1).max(120).optional(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  password: z.string().min(10).max(200)
});

const inviteUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  role: z.enum(["admin", "estimator", "viewer"])
});

const passwordResetRequestSchema = z.object({
  companyId: z.string().trim().min(1),
  email: z.string().trim().email()
});

const passwordResetConfirmSchema = z.object({
  companyId: z.string().trim().min(1),
  email: z.string().trim().email(),
  resetToken: z.string().trim().min(24),
  newPassword: z.string().min(10).max(200)
});

type CompanyRow = {
  id: string;
  display_name: string;
};

type UserRow = {
  id: string;
  company_id: string;
  email: string;
  full_name: string;
  role: "admin" | "estimator" | "viewer";
  password_hash: string;
  is_active: boolean;
  created_at?: string;
};

function slugifyCompanyId(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return normalized.length >= 3 ? normalized.slice(0, 64) : `company-${normalized || "new"}`;
}

function randomTemporaryPassword(): string {
  const source = randomBytes(12).toString("base64url");
  return `Tmp-${source.slice(0, 14)}!`;
}

function hashResetToken(token: string): string {
  const secret =
    process.env.RESET_TOKEN_SECRET ??
    process.env.JWT_SECRET ??
    (process.env.NODE_ENV === "production" ? "" : "local-dev-reset-secret");
  if (!secret) {
    throw new Error("RESET_TOKEN_SECRET or JWT_SECRET must be configured in production.");
  }
  return createHash("sha256").update(`${token}.${secret}`).digest("hex");
}

async function companyIdExists(companyId: string): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query<{ id: string }>(
    `
    SELECT id
    FROM tenant_companies
    WHERE id = $1
    LIMIT 1
    `,
    [companyId]
  );
  return result.rows.length > 0;
}

async function buildAvailableCompanyId(base: string): Promise<string> {
  if (!(await companyIdExists(base))) {
    return base;
  }
  let suffix = 2;
  while (suffix < 1000) {
    const candidate = `${base}-${suffix}`;
    if (!(await companyIdExists(candidate))) {
      return candidate;
    }
    suffix += 1;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid login payload", issues: parsed.error.flatten() });
    }

    const pool = getDbPool();
    const companyId = parsed.data.companyId.trim().toLowerCase();
    const email = parsed.data.email.trim().toLowerCase();

    const [companyResult, userResult] = await Promise.all([
      pool.query<CompanyRow>(
        `
        SELECT id, display_name
        FROM tenant_companies
        WHERE id = $1
        LIMIT 1
        `,
        [companyId]
      ),
      pool.query<UserRow>(
        `
        SELECT id, company_id, email, full_name, role, password_hash, is_active
        FROM auth_users
        WHERE company_id = $1
          AND lower(email) = $2
        LIMIT 1
        `,
        [companyId, email]
      )
    ]);

    const company = companyResult.rows[0];
    const user = userResult.rows[0];
    if (!company || !user || !user.is_active || !verifyPassword(parsed.data.password, user.password_hash)) {
      return reply.code(401).send({ message: "Invalid company ID, email, or password." });
    }

    return {
      company: {
        id: company.id,
        displayName: company.display_name
      },
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role
      }
    };
  });

  app.post("/auth/onboard-admin", async (request, reply) => {
    const parsed = onboardAdminSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid onboarding payload", issues: parsed.error.flatten() });
    }

    const pool = getDbPool();
    const requestedId = parsed.data.companyId ? slugifyCompanyId(parsed.data.companyId) : null;
    const companyId = requestedId ?? (await buildAvailableCompanyId(slugifyCompanyId(parsed.data.companyName)));
    const adminEmail = parsed.data.email.trim().toLowerCase();

    const existingAdmin = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM auth_users
      WHERE company_id = $1
        AND lower(email) = $2
      LIMIT 1
      `,
      [companyId, adminEmail]
    );

    if (existingAdmin.rows.length > 0) {
      return reply.code(409).send({ message: "Admin email already exists for this company." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
        INSERT INTO tenant_companies (id, display_name)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            updated_at = NOW()
        `,
        [companyId, parsed.data.companyName.trim()]
      );

      const adminId = `usr-${randomUUID()}`;
      await client.query(
        `
        INSERT INTO auth_users (
          id,
          company_id,
          email,
          full_name,
          role,
          password_hash,
          is_active
        ) VALUES ($1,$2,$3,$4,'admin',$5,TRUE)
        `,
        [adminId, companyId, adminEmail, parsed.data.fullName.trim(), hashPassword(parsed.data.password)]
      );
      await client.query("COMMIT");

      const companyResult = await pool.query<CompanyRow>(
        `
        SELECT id, display_name
        FROM tenant_companies
        WHERE id = $1
        LIMIT 1
        `,
        [companyId]
      );

      return {
        company: {
          id: companyResult.rows[0].id,
          displayName: companyResult.rows[0].display_name
        },
        user: {
          id: adminId,
          fullName: parsed.data.fullName.trim(),
          email: adminEmail,
          role: "admin" as const
        }
      };
    } catch (error) {
      await client.query("ROLLBACK");
      return reply.code(502).send({ message: "Could not complete admin onboarding", detail: (error as Error).message });
    } finally {
      client.release();
    }
  });

  app.get("/auth/admin/users", async (request, reply) => {
    const context = getAuthContext(request);
    if (!context?.companyId) {
      return reply.code(401).send({ message: "Authentication required." });
    }

    const pool = getDbPool();
    try {
      const users = await pool.query<UserRow>(
        `
        SELECT id, company_id, email, full_name, role, password_hash, is_active, created_at
        FROM auth_users
        WHERE company_id = $1
        ORDER BY created_at DESC, email ASC
        `,
        [context.companyId]
      );

      return {
        users: users.rows.map((row) => ({
          id: row.id,
          email: row.email,
          fullName: row.full_name,
          role: row.role,
          isActive: row.is_active,
          createdAt: row.created_at ?? new Date().toISOString()
        }))
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not load users", detail: (error as Error).message });
    }
  });

  app.post("/auth/admin/invite-user", async (request, reply) => {
    const context = getAuthContext(request);
    if (!context?.companyId) {
      return reply.code(401).send({ message: "Authentication required." });
    }

    const parsed = inviteUserSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid invite payload", issues: parsed.error.flatten() });
    }

    const pool = getDbPool();
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM auth_users
      WHERE company_id = $1
        AND lower(email) = $2
      LIMIT 1
      `,
      [context.companyId, email]
    );
    if (existing.rows.length > 0) {
      return reply.code(409).send({ message: "A user with this email already exists for your company." });
    }

    const temporaryPassword = randomTemporaryPassword();
    try {
      const created = await pool.query<UserRow>(
        `
        INSERT INTO auth_users (
          id, company_id, email, full_name, role, password_hash, is_active
        ) VALUES ($1,$2,$3,$4,$5,$6,TRUE)
        RETURNING id, company_id, email, full_name, role, password_hash, is_active, created_at
        `,
        [
          `usr-${randomUUID()}`,
          context.companyId,
          email,
          parsed.data.fullName.trim(),
          parsed.data.role,
          hashPassword(temporaryPassword)
        ]
      );

      const row = created.rows[0];
      return {
        invitedUser: {
          id: row.id,
          email: row.email,
          fullName: row.full_name,
          role: row.role,
          isActive: row.is_active,
          createdAt: row.created_at ?? new Date().toISOString()
        },
        temporaryPassword
      };
    } catch (error) {
      return reply.code(502).send({ message: "Could not invite user", detail: (error as Error).message });
    }
  });

  app.post("/auth/password-reset/request", async (request, reply) => {
    const parsed = passwordResetRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid reset request payload", issues: parsed.error.flatten() });
    }

    const pool = getDbPool();
    const companyId = parsed.data.companyId.trim().toLowerCase();
    const email = parsed.data.email.trim().toLowerCase();

    const userResult = await pool.query<UserRow>(
      `
      SELECT id, company_id, email, full_name, role, password_hash, is_active
      FROM auth_users
      WHERE company_id = $1
        AND lower(email) = $2
        AND is_active = TRUE
      LIMIT 1
      `,
      [companyId, email]
    );

    if (userResult.rows.length === 0) {
      return { message: "If the account exists, a reset token has been created.", resetToken: null };
    }

    const user = userResult.rows[0];
    const resetToken = randomBytes(20).toString("base64url");
    const tokenHash = hashResetToken(resetToken);
    const resetId = `rst-${randomUUID()}`;

    await pool.query(
      `
      INSERT INTO auth_password_resets (
        id, company_id, user_id, email, token_hash, expires_at
      ) VALUES ($1,$2,$3,$4,$5,NOW() + INTERVAL '30 minutes')
      `,
      [resetId, user.company_id, user.id, user.email, tokenHash]
    );

    return {
      message: "Reset token created. Use it to set a new password.",
      resetToken,
      expiresInMinutes: 30
    };
  });

  app.post("/auth/password-reset/confirm", async (request, reply) => {
    const parsed = passwordResetConfirmSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: "Invalid reset confirmation payload", issues: parsed.error.flatten() });
    }

    const pool = getDbPool();
    const companyId = parsed.data.companyId.trim().toLowerCase();
    const email = parsed.data.email.trim().toLowerCase();
    const tokenHash = hashResetToken(parsed.data.resetToken.trim());

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const resetResult = await client.query<{ id: string; user_id: string }>(
        `
        SELECT id, user_id
        FROM auth_password_resets
        WHERE company_id = $1
          AND lower(email) = $2
          AND token_hash = $3
          AND used_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
        `,
        [companyId, email, tokenHash]
      );

      if (resetResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return reply.code(400).send({ message: "Reset token is invalid or expired." });
      }

      const reset = resetResult.rows[0];
      await client.query(
        `
        UPDATE auth_users
        SET password_hash = $1,
            updated_at = NOW()
        WHERE id = $2
          AND company_id = $3
        `,
        [hashPassword(parsed.data.newPassword), reset.user_id, companyId]
      );

      await client.query(
        `
        UPDATE auth_password_resets
        SET used_at = NOW()
        WHERE id = $1
        `,
        [reset.id]
      );

      await client.query("COMMIT");
      return { message: "Password updated successfully." };
    } catch (error) {
      await client.query("ROLLBACK");
      return reply.code(502).send({ message: "Could not reset password", detail: (error as Error).message });
    } finally {
      client.release();
    }
  });
};
