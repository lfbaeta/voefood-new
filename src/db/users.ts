import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { users, user_roles, resellers, restaurant_admins } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, name?: string | null) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        name: name ?? null,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          name: name ?? undefined,
          updated_at: new Date(),
        },
      })
      .returning();

    // Link any invited restaurant_admins records matching this user's email
    if (email) {
      await db
        .update(restaurant_admins)
        .set({ user_id: uid })
        .where(eq(restaurant_admins.user_id, `pending:${email.toLowerCase()}`));
    }

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account. Please try again later.', {
      cause: error,
    });
  }
}

export async function getUserPermissions(uid: string) {
  try {
    const [rolesRows, resellerRows, adminRows] = await Promise.all([
      db.select().from(user_roles).where(eq(user_roles.user_id, uid)),
      db.select().from(resellers).where(eq(resellers.user_id, uid)),
      db.select().from(restaurant_admins).where(eq(restaurant_admins.user_id, uid)),
    ]);

    const isSuperAdmin = rolesRows.some((r) => r.role === 'admin');
    const activeReseller = resellerRows.find((r) => r.is_active) ?? null;
    const isReseller = isSuperAdmin || !!activeReseller;
    const restaurantIds = adminRows.map((a) => a.restaurant_id);
    const isAdmin = isSuperAdmin || isReseller || restaurantIds.length > 0;

    return {
      isSuperAdmin,
      isReseller,
      isAdmin,
      resellerId: activeReseller?.id ?? null,
      restaurantIds,
    };
  } catch (error) {
    console.error('Database query failed in getUserPermissions:', error);
    throw new Error('Failed to load user permissions. Please try again later.', {
      cause: error,
    });
  }
}
