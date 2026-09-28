import { eq } from "drizzle-orm";

import { hashPassword } from "../src/auth/jwt.js";
import { ensurePlatformAdminSeed, writeAuditLog } from "../src/auth/platform-auth.js";
import { closeDb, db } from "../src/db/client.js";
import { platformAdmins } from "../src/db/schema.js";

/**
 * Read the new password from PLATFORM_ADMIN_PASSWORD, or from stdin when the
 * variable is unset so it never lands in shell history:
 *   printf '%s' 'the-new-password' | bun run platform-admin:reset-password
 */
async function readNewPassword(): Promise<string> {
  const fromEnv = process.env.PLATFORM_ADMIN_PASSWORD;
  if (fromEnv) return fromEnv.trim();

  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8").trim();
  }

  throw new Error(
    "Set PLATFORM_ADMIN_PASSWORD (16+ characters) or pipe the password on stdin.",
  );
}

async function resetPlatformAdminPassword() {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();

  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL explicitly before running this command.");
  }
  if (!email) {
    throw new Error("Set PLATFORM_ADMIN_EMAIL to the account to reset.");
  }
  const password = await readNewPassword();
  if (password.length < 16) {
    throw new Error("The new password must be at least 16 characters.");
  }

  try {
    // Create the bootstrap admin if this database has not been seeded yet.
    // Existing rows are deliberately left untouched by the seeder; the update below
    // is the explicit password-reset operation.
    await ensurePlatformAdminSeed();

    const admin = await db.query.platformAdmins.findFirst({
      where: eq(platformAdmins.email, email),
    });
    if (!admin) {
      throw new Error(`No platform admin found for ${email}; no password was changed.`);
    }
    if (admin.status !== "active") {
      throw new Error(`Platform admin ${email} is ${admin.status}; no password was changed.`);
    }

    const [updated] = await db
      .update(platformAdmins)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(platformAdmins.id, admin.id))
      .returning({ id: platformAdmins.id });

    if (!updated) {
      throw new Error(`Platform admin ${email} was not updated.`);
    }

    try {
      await writeAuditLog({
        adminId: admin.id,
        action: "password_reset_cli",
        entityType: "platform_admin",
        entityId: admin.id,
        metadata: { source: "maintenance_script" },
      });
    } catch {
      console.warn("Password was reset, but the audit log entry could not be written.");
    }

    console.log(`Password reset for active platform admin ${email}.`);
  } finally {
    await closeDb().catch(() => undefined);
  }
}

resetPlatformAdminPassword().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Platform-admin password reset failed.");
  process.exitCode = 1;
});
