import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { oauthIntegrations, type OauthIntegration } from "@/lib/db/schema";
import { refreshAccessToken } from "@/lib/integrations/google";

const PROVIDER = "google";

export async function getGoogleIntegration(
  workspaceId: string,
): Promise<OauthIntegration | null> {
  const rows = await db
    .select()
    .from(oauthIntegrations)
    .where(
      and(
        eq(oauthIntegrations.workspaceId, workspaceId),
        eq(oauthIntegrations.provider, PROVIDER),
      ),
    )
    .orderBy(desc(oauthIntegrations.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertGoogleIntegration(args: {
  workspaceId: string;
  externalUserId: string;
  email: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
}): Promise<void> {
  await db
    .insert(oauthIntegrations)
    .values({
      workspaceId: args.workspaceId,
      provider: PROVIDER,
      externalUserId: args.externalUserId,
      email: args.email,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      scopes: args.scopes,
    })
    .onConflictDoUpdate({
      target: [
        oauthIntegrations.workspaceId,
        oauthIntegrations.provider,
        oauthIntegrations.externalUserId,
      ],
      set: {
        email: args.email,
        accessToken: args.accessToken,
        // Google only returns a refresh_token on first consent; keep the
        // existing one if this exchange didn't include a new one.
        ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}),
        expiresAt: args.expiresAt,
        scopes: args.scopes,
        updatedAt: new Date(),
      },
    });
}

/** Returns a non-expired access token, refreshing + persisting if needed. */
export async function getValidAccessToken(
  workspaceId: string,
): Promise<string | null> {
  const integ = await getGoogleIntegration(workspaceId);
  if (!integ) return null;

  const now = Date.now();
  const exp = integ.expiresAt ? new Date(integ.expiresAt).getTime() : 0;
  if (integ.accessToken && exp > now + 60_000) return integ.accessToken;
  if (!integ.refreshToken) return integ.accessToken ?? null;

  const t = await refreshAccessToken(integ.refreshToken);
  const newExpiry = new Date(now + (t.expires_in ?? 3600) * 1000);
  await db
    .update(oauthIntegrations)
    .set({
      accessToken: t.access_token,
      expiresAt: newExpiry,
      updatedAt: new Date(),
      ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
    })
    .where(eq(oauthIntegrations.id, integ.id));
  return t.access_token;
}
