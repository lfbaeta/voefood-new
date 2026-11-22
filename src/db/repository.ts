import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from './index.ts';
import * as schema from './schema.ts';
import { getUserPermissions } from './users.ts';

// Allowlist of Drizzle tables mapped by table name
const TABLE_MAP: Record<string, PgTable> = {
  users: schema.users,
  user_roles: schema.user_roles,
  resellers: schema.resellers,
  resellers_public: schema.resellers,
  resellers_safe: schema.resellers,
  subscription_plans: schema.subscription_plans,
  restaurants: schema.restaurants,
  restaurants_public: schema.restaurants,
  restaurant_admins: schema.restaurant_admins,
  store_config: schema.store_config,
  categories: schema.categories,
  products: schema.products,
  addon_groups: schema.addon_groups,
  addon_options: schema.addon_options,
  product_addon_groups: schema.product_addon_groups,
  business_hours: schema.business_hours,
  delivery_zones: schema.delivery_zones,
  coupons: schema.coupons,
  orders: schema.orders,
  order_items: schema.order_items,
  tables: schema.tables,
  table_orders: schema.table_orders,
  table_order_items: schema.table_order_items,
  waiters: schema.waiters,
  delivery_drivers: schema.delivery_drivers,
  customer_addresses: schema.customer_addresses,
  cash_sessions: schema.cash_sessions,
  cash_movements: schema.cash_movements,
  stock_items: schema.stock_items,
  stock_movements: schema.stock_movements,
  suppliers: schema.suppliers,
  purchases: schema.purchases,
  purchase_items: schema.purchase_items,
  product_recipes: schema.product_recipes,
  pizza_sizes: schema.pizza_sizes,
  pizza_flavors_catalog: schema.pizza_flavors_catalog,
  pizza_flavor_prices: schema.pizza_flavor_prices,
  pizza_borders_catalog: schema.pizza_borders_catalog,
  pizza_border_prices: schema.pizza_border_prices,
  notifications: schema.notifications,
  subscription_payments: schema.subscription_payments,
  communication_logs: schema.communication_logs,
  print_stations: schema.print_stations,
  print_jobs: schema.print_jobs,
  business_type_defaults: schema.business_type_defaults,
};

// Tables that can be read without authentication (public storefront / landing data)
const PUBLIC_READ_TABLES = new Set([
  'resellers_public',
  'restaurants_public',
  'subscription_plans',
  'store_config',
  'categories',
  'products',
  'addon_groups',
  'addon_options',
  'product_addon_groups',
  'business_hours',
  'delivery_zones',
  'coupons',
  'pizza_sizes',
  'pizza_flavors_catalog',
  'pizza_flavor_prices',
  'pizza_borders_catalog',
  'pizza_border_prices',
  'business_type_defaults',
  'tables',
  'orders',
  'order_items',
  'customer_addresses',
  'notifications',
]);

// Tables that allow scoped unauthenticated writes (e.g. customer address saving during checkout)
const PUBLIC_WRITE_TABLES = new Set([
  'customer_addresses',
  'notifications',
]);

export interface QueryFilter {
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'in' | 'is';
  column: string;
  value: unknown;
}

export interface QueryOrder {
  column: string;
  ascending?: boolean;
}

export interface DbQueryPayload {
  table: string;
  action: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  select?: string;
  filters?: QueryFilter[];
  orFilters?: string[];
  orders?: QueryOrder[];
  limit?: number;
  offset?: number;
  single?: boolean;
  maybeSingle?: boolean;
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string;
  count?: 'exact' | 'planned' | 'estimated';
  head?: boolean;
}

function sanitizeRecordForTable(
  table: PgTable,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const columns = getTableColumns(table) as Record<string, any>;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key in columns && value !== undefined) {
      const col = columns[key];
      if (col?.dataType === 'date' && typeof value === 'string') {
        const parsed = new Date(value);
        clean[key] = Number.isNaN(parsed.getTime()) ? null : parsed;
      } else {
        clean[key] = value;
      }
    }
  }
  return clean;
}

function buildWhereClause(table: PgTable, filters: QueryFilter[] = []): SQL | undefined {
  const columns = getTableColumns(table) as Record<string, any>;
  const conditions: SQL[] = [];

  for (const f of filters) {
    const col = columns[f.column];
    if (!col) continue;

    switch (f.op) {
      case 'eq':
        conditions.push(eq(col, f.value));
        break;
      case 'neq':
        conditions.push(ne(col, f.value));
        break;
      case 'gt':
        conditions.push(gt(col, f.value));
        break;
      case 'gte':
        conditions.push(gte(col, f.value));
        break;
      case 'lt':
        conditions.push(lt(col, f.value));
        break;
      case 'lte':
        conditions.push(lte(col, f.value));
        break;
      case 'ilike':
        conditions.push(ilike(col, String(f.value ?? '')));
        break;
      case 'in':
        if (Array.isArray(f.value) && f.value.length > 0) {
          conditions.push(inArray(col, f.value));
        } else {
          // Match nothing safely when IN list is empty
          conditions.push(eq(col, '__never_match__'));
        }
        break;
      case 'is':
        if (f.value === null) {
          conditions.push(isNull(col));
        } else {
          conditions.push(isNotNull(col));
        }
        break;
      default:
        break;
    }
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

function sanitizePublicRows(tableName: string, rows: Record<string, unknown>[], isAuthenticated: boolean) {
  if (isAuthenticated && tableName !== 'resellers_public' && tableName !== 'restaurants_public') {
    return rows;
  }

  if (tableName === 'resellers_public' || tableName === 'resellers_safe') {
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      company_name: r.company_name,
      slug: r.slug,
      is_active: r.is_active,
      primary_color: r.primary_color,
      secondary_color: r.secondary_color,
      background_color: r.background_color,
      foreground_color: r.foreground_color,
      button_text_color: r.button_text_color,
      landing_page_enabled: r.landing_page_enabled,
      landing_page_logo: r.landing_page_logo,
      landing_page_title: r.landing_page_title,
      landing_page_subtitle: r.landing_page_subtitle,
      landing_page_whatsapp: r.landing_page_whatsapp,
      landing_page_email: r.landing_page_email,
      landing_testimonials: r.landing_testimonials,
      landing_faq: r.landing_faq,
      landing_stats: r.landing_stats,
      mp_integration_enabled: r.mp_integration_enabled,
      root_domain: r.root_domain,
    }));
  }

  if (tableName === 'restaurants_public') {
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      business_type: r.business_type,
      is_active: r.is_active,
      subscription_status: r.subscription_status,
      phone: r.phone,
    }));
  }

  if (tableName === 'store_config' && !isAuthenticated) {
    return rows.map(({ kitchen_pin: _kp, pix_key: _pk, ...pub }) => pub);
  }

  return rows;
}

async function hydrateNestedSelect(
  tableName: string,
  selectStr: string | undefined,
  rows: Record<string, unknown>[],
) {
  if (!selectStr || rows.length === 0) return rows;

  // Handle restaurant_admins -> restaurants(slug)
  if (tableName === 'restaurant_admins' && selectStr.includes('restaurants')) {
    const restIds = [...new Set(rows.map((r) => String(r.restaurant_id)).filter(Boolean))];
    if (restIds.length > 0) {
      const restRows = await db
        .select()
        .from(schema.restaurants)
        .where(inArray(schema.restaurants.id, restIds));
      const restMap = new Map(restRows.map((r) => [r.id, r]));
      return rows.map((row) => ({
        ...row,
        restaurants: restMap.get(String(row.restaurant_id)) ?? null,
      }));
    }
  }

  // Handle table_orders -> table_order_items / tables
  if (tableName === 'table_orders') {
    const orderIds = rows.map((r) => Number(r.id)).filter((n) => !Number.isNaN(n));
    const tableIds = [...new Set(rows.map((r) => r.table_id).filter(Boolean).map(String))];
    const [itemRows, tableRows] = await Promise.all([
      selectStr.includes('table_order_items') && orderIds.length > 0
        ? db.select().from(schema.table_order_items).where(inArray(schema.table_order_items.table_order_id, orderIds))
        : Promise.resolve([]),
      selectStr.includes('tables') && tableIds.length > 0
        ? db.select().from(schema.tables).where(inArray(schema.tables.id, tableIds))
        : Promise.resolve([]),
    ]);

    const itemsByOrder = new Map<number, unknown[]>();
    for (const item of itemRows) {
      const list = itemsByOrder.get(item.table_order_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.table_order_id, list);
    }
    const tableMap = new Map(tableRows.map((t) => [t.id, t]));

    return rows.map((row) => ({
      ...row,
      ...(selectStr.includes('table_order_items') ? { table_order_items: itemsByOrder.get(Number(row.id)) ?? [] } : {}),
      ...(selectStr.includes('tables') ? { tables: row.table_id ? tableMap.get(String(row.table_id)) ?? null : null } : {}),
    }));
  }

  // Handle addon_groups -> addon_options
  if (tableName === 'addon_groups' && selectStr.includes('addon_options')) {
    const groupIds = rows.map((r) => String(r.id)).filter(Boolean);
    if (groupIds.length > 0) {
      const opts = await db
        .select()
        .from(schema.addon_options)
        .where(inArray(schema.addon_options.group_id, groupIds))
        .orderBy(asc(schema.addon_options.sort_order));
      const byGroup = new Map<string, unknown[]>();
      for (const opt of opts) {
        const list = byGroup.get(opt.group_id) ?? [];
        list.push(opt);
        byGroup.set(opt.group_id, list);
      }
      return rows.map((row) => ({
        ...row,
        addon_options: byGroup.get(String(row.id)) ?? [],
      }));
    }
  }

  return rows;
}

export async function executeDbQuery(payload: DbQueryPayload, authUid?: string) {
  const table = TABLE_MAP[payload.table];
  if (!table) {
    // Gracefully return empty array for non-core optional feature tables
    if (payload.action === 'select') {
      return { data: payload.single || payload.maybeSingle ? null : [], count: 0 };
    }
    throw new Error(`Tabela não suportada: ${payload.table}`);
  }

  const isAuthenticated = Boolean(authUid);

  // Enforce server-side authentication & RBAC boundaries
  if (payload.action === 'select') {
    if (!isAuthenticated && !PUBLIC_READ_TABLES.has(payload.table)) {
      const err = new Error('Autenticação necessária para acessar este recurso.') as Error & { status?: number };
      err.status = 401;
      throw err;
    }
    if (!isAuthenticated) {
      const filters = payload.filters || [];
      if (payload.table === 'orders' && !filters.some((f) => f.column === 'id' && f.op === 'eq')) {
        const err = new Error('Autenticação necessária para listar pedidos.') as Error & { status?: number };
        err.status = 401;
        throw err;
      }
      if (payload.table === 'order_items' && !filters.some((f) => f.column === 'order_id' && f.op === 'eq')) {
        const err = new Error('Autenticação necessária para listar itens de pedidos.') as Error & { status?: number };
        err.status = 401;
        throw err;
      }
      if (
        payload.table === 'customer_addresses' &&
        !filters.some((f) => f.column === 'customer_phone' && f.op === 'eq')
      ) {
        const err = new Error('Informe o telefone para consultar endereços.') as Error & { status?: number };
        err.status = 401;
        throw err;
      }
    }
  } else {
    if (!isAuthenticated && !PUBLIC_WRITE_TABLES.has(payload.table)) {
      const err = new Error('Autenticação necessária para alterar dados.') as Error & { status?: number };
      err.status = 401;
      throw err;
    }
    if (isAuthenticated && !PUBLIC_WRITE_TABLES.has(payload.table)) {
      const perms = await getUserPermissions(authUid!);
      // Allow authenticated users to create initial reseller if none exists yet, otherwise require admin/reseller role
      if (!perms.isAdmin && !perms.isReseller && !perms.isSuperAdmin) {
        const err = new Error('Permissão insuficiente para executar esta operação.') as Error & { status?: number };
        err.status = 403;
        throw err;
      }
    }
  }

  try {
    const columns = getTableColumns(table) as Record<string, any>;
    const whereClause = buildWhereClause(table, payload.filters);

    if (payload.action === 'select') {
      let query: any = db.select().from(table);
      if (whereClause) {
        query = query.where(whereClause);
      }
      if (payload.orders && payload.orders.length > 0) {
        const orderClauses = payload.orders
          .map((o) => {
            const col = columns[o.column];
            if (!col) return null;
            return o.ascending === false ? desc(col) : asc(col);
          })
          .filter(Boolean);
        if (orderClauses.length > 0) {
          query = query.orderBy(...orderClauses);
        }
      }
      if (typeof payload.limit === 'number' && payload.limit > 0) {
        query = query.limit(Math.min(payload.limit, 1000));
      }
      if (typeof payload.offset === 'number' && payload.offset > 0) {
        query = query.offset(payload.offset);
      }

      const rawRows = (await query) as Record<string, unknown>[];
      const count = rawRows.length;
      if (payload.head) {
        return { data: null, count };
      }

      const hydrated = await hydrateNestedSelect(payload.table, payload.select, rawRows);
      const safeRows = sanitizePublicRows(payload.table, hydrated, isAuthenticated);

      if (payload.single) {
        if (safeRows.length === 0) {
          return { data: null, error: { message: 'Registro não encontrado', code: 'PGRST116' } };
        }
        return { data: safeRows[0], count };
      }
      if (payload.maybeSingle) {
        return { data: safeRows[0] ?? null, count };
      }
      return { data: safeRows, count };
    }

    if (payload.action === 'insert' || payload.action === 'upsert') {
      const items = Array.isArray(payload.values)
        ? payload.values
        : payload.values
          ? [payload.values]
          : [];
      const sanitizedItems = items.map((item) => sanitizeRecordForTable(table, item));
      if (sanitizedItems.length === 0) {
        return { data: payload.single || payload.maybeSingle ? null : [] };
      }

      let insertQuery: any = db.insert(table).values(sanitizedItems);
      const effectiveConflictCol =
        payload.action === 'upsert' && payload.onConflict && columns[payload.onConflict]
          ? payload.onConflict
          : payload.table === 'store_config' && sanitizedItems.length === 1 && sanitizedItems[0].restaurant_id
            ? 'restaurant_id'
            : null;

      if (effectiveConflictCol && columns[effectiveConflictCol]) {
        const first = sanitizedItems[0];
        const updateSet: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(first)) {
          if (k !== effectiveConflictCol && k !== 'id') {
            updateSet[k] = v;
          }
        }
        if ('updated_at' in columns && !('updated_at' in updateSet)) {
          updateSet.updated_at = new Date();
        }
        if (Object.keys(updateSet).length > 0) {
          insertQuery = insertQuery.onConflictDoUpdate({
            target: columns[effectiveConflictCol],
            set: updateSet,
          });
        } else {
          insertQuery = insertQuery.onConflictDoNothing();
        }
      }

      const inserted = (await insertQuery.returning()) as Record<string, unknown>[];

      // Auto-provision store_config for newly created restaurants
      if (payload.table === 'restaurants' && inserted.length > 0) {
        for (const rest of inserted) {
          if (rest.id) {
            await db
              .insert(schema.store_config)
              .values({
                restaurant_id: String(rest.id),
                name: String(rest.name || 'Restaurante'),
                phone_whatsapp: rest.phone ? String(rest.phone) : null,
                business_type: rest.business_type ? String(rest.business_type) : 'restaurant',
                is_open: true,
              })
              .onConflictDoNothing();
          }
        }
      }

      if (payload.single || payload.maybeSingle) {
        return { data: inserted[0] ?? null };
      }
      return { data: inserted };
    }

    if (payload.action === 'update') {
      const updateData = sanitizeRecordForTable(
        table,
        (payload.values as Record<string, unknown>) || {},
      );
      if ('updated_at' in columns && !('updated_at' in updateData)) {
        updateData.updated_at = new Date();
      }
      if (Object.keys(updateData).length === 0) {
        return { data: payload.single || payload.maybeSingle ? null : [] };
      }
      if (!whereClause) {
        throw new Error('Atualização requer pelo menos um filtro.');
      }

      const updated = (await db
        .update(table)
        .set(updateData)
        .where(whereClause)
        .returning()) as Record<string, unknown>[];

      if (payload.single || payload.maybeSingle) {
        return { data: updated[0] ?? null };
      }
      return { data: updated };
    }

    if (payload.action === 'delete') {
      if (!whereClause) {
        throw new Error('Exclusão requer pelo menos um filtro.');
      }
      const deleted = (await db.delete(table).where(whereClause).returning()) as Record<string, unknown>[];
      return { data: deleted };
    }

    throw new Error('Ação de banco de dados inválida.');
  } catch (error) {
    console.error(`Database query failed [${payload.action} ${payload.table}]:`, error);
    if ((error as any)?.status) {
      throw error;
    }
    throw new Error('Erro ao executar operação no banco de dados. Tente novamente.', {
      cause: error,
    });
  }
}

export async function setupInitialReseller(params: {
  uid: string;
  name: string;
  email: string;
  companyName?: string | null;
  phone?: string | null;
}) {
  try {
    const existing = await db.select({ id: schema.resellers.id }).from(schema.resellers).limit(1);
    if (existing.length > 0) {
      throw new Error('O sistema já possui um revendedor configurado.');
    }

    const slugBase = (params.companyName || params.name || 'voefood')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'principal';

    const [reseller] = await db
      .insert(schema.resellers)
      .values({
        user_id: params.uid,
        name: params.name,
        email: params.email,
        company_name: params.companyName || params.name,
        phone: params.phone || null,
        slug: slugBase,
        is_active: true,
        landing_page_enabled: true,
        landing_page_title: 'Cardápio Web e Cardápio Digital Completo para seu Negócio',
        landing_page_subtitle:
          'Venda mais, pague menos taxas. Sistema completo de pedidos online para restaurantes, bares e lanchonetes.',
        landing_page_whatsapp: params.phone || null,
        landing_page_email: params.email,
      })
      .returning();

    // Grant super admin role
    await db.insert(schema.user_roles).values({
      user_id: params.uid,
      role: 'admin',
    });

    // Seed default subscription plans
    const plans = await db
      .insert(schema.subscription_plans)
      .values([
        {
          reseller_id: reseller.id,
          name: 'Básico',
          description: 'Ideal para começar',
          monthly_fee: 49.9,
          setup_fee: 0,
          trial_days: 7,
          features: ['Cardápio digital ilimitado', 'Pedidos online', 'Suporte por email'],
          is_popular: false,
          is_active: true,
          sort_order: 1,
        },
        {
          reseller_id: reseller.id,
          name: 'Profissional',
          description: 'O mais escolhido',
          monthly_fee: 99.9,
          setup_fee: 0,
          trial_days: 14,
          features: ['Tudo do Básico', 'Gestão de mesas (PDV)', 'Relatórios avançados', 'Painel da cozinha'],
          is_popular: true,
          is_active: true,
          sort_order: 2,
        },
        {
          reseller_id: reseller.id,
          name: 'Enterprise',
          description: 'Para grandes operações',
          monthly_fee: 199.9,
          setup_fee: 0,
          trial_days: 30,
          features: ['Tudo do Profissional', 'Múltiplas unidades', 'Controle de estoque', 'Personalização completa'],
          is_popular: false,
          is_active: true,
          sort_order: 3,
        },
      ])
      .returning();

    return { reseller, plans };
  } catch (error) {
    console.error('Database query failed in setupInitialReseller:', error);
    if (error instanceof Error && error.message.includes('já possui')) {
      throw error;
    }
    throw new Error('Não foi possível concluir a configuração inicial.', { cause: error });
  }
}

export async function seedStarterRestaurantMenu(restaurantId: string) {
  try {
    const existingCats = await db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.restaurant_id, restaurantId))
      .limit(1);

    if (existingCats.length > 0) {
      return { seeded: false, message: 'Cardápio já possui categorias.' };
    }

    const [catLanches, catPizzas, catBebidas] = await db
      .insert(schema.categories)
      .values([
        { restaurant_id: restaurantId, name: 'Lanches Artesanais', sort_order: 1, is_active: true, department: 'kitchen' },
        { restaurant_id: restaurantId, name: 'Pizzas Tradicionais', sort_order: 2, is_active: true, department: 'kitchen' },
        { restaurant_id: restaurantId, name: 'Bebidas', sort_order: 3, is_active: true, department: 'bar' },
      ])
      .returning();

    await db.insert(schema.products).values([
      {
        restaurant_id: restaurantId,
        category_id: catLanches.id,
        name: 'X-Burger Clássico',
        description: 'Pão brioche, hambúrguer 160g, queijo cheddar, alface, tomate e molho especial.',
        price: 28.9,
        is_available: true,
        is_featured: true,
        sort_order: 1,
        department: 'kitchen',
      },
      {
        restaurant_id: restaurantId,
        category_id: catPizzas.id,
        name: 'Pizza Calabresa Grande',
        description: 'Molho de tomate artesanal, mussarela, calabresa fatiada, cebola e orégano.',
        price: 54.9,
        is_available: true,
        is_featured: true,
        sort_order: 1,
        department: 'kitchen',
      },
      {
        restaurant_id: restaurantId,
        category_id: catBebidas.id,
        name: 'Refrigerante Lata 350ml',
        description: 'Bem gelado.',
        price: 7.5,
        is_available: true,
        sort_order: 1,
        department: 'bar',
      },
    ]);

    return { seeded: true };
  } catch (error) {
    console.error('Database query failed in seedStarterRestaurantMenu:', error);
    throw new Error('Erro ao criar itens iniciais do cardápio.', { cause: error });
  }
}

export async function executeRpc(
  fnName: string,
  args: Record<string, any> = {},
  authUid?: string,
) {
  try {
    switch (fnName) {
      case 'get_has_any_reseller': {
        const rows = await db.select({ id: schema.resellers.id }).from(schema.resellers).limit(1);
        return rows.length > 0;
      }

      case 'has_role': {
        const uid = args._user_id || authUid;
        const role = args._role;
        if (!uid || !role) return false;
        const rows = await db
          .select({ id: schema.user_roles.id })
          .from(schema.user_roles)
          .where(and(eq(schema.user_roles.user_id, String(uid)), eq(schema.user_roles.role, String(role))))
          .limit(1);
        return rows.length > 0;
      }

      case 'is_reseller_of_restaurant': {
        const uid = args._user_id || authUid;
        const restId = args._restaurant_id;
        if (!uid || !restId) return false;
        const [reseller] = await db
          .select({ id: schema.resellers.id })
          .from(schema.resellers)
          .where(and(eq(schema.resellers.user_id, String(uid)), eq(schema.resellers.is_active, true)))
          .limit(1);
        if (!reseller) return false;
        const [rest] = await db
          .select({ id: schema.restaurants.id })
          .from(schema.restaurants)
          .where(and(eq(schema.restaurants.id, String(restId)), eq(schema.restaurants.reseller_id, reseller.id)))
          .limit(1);
        return !!rest;
      }

      case 'is_admin_of_restaurant': {
        const uid = args._user_id || authUid;
        const restId = args._restaurant_id;
        if (!uid || !restId) return false;
        const perms = await getUserPermissions(String(uid));
        if (perms.isSuperAdmin || perms.restaurantIds.includes(String(restId))) return true;
        if (perms.resellerId) {
          const [rest] = await db
            .select({ id: schema.restaurants.id })
            .from(schema.restaurants)
            .where(and(eq(schema.restaurants.id, String(restId)), eq(schema.restaurants.reseller_id, perms.resellerId)))
            .limit(1);
          return !!rest;
        }
        return false;
      }

      case 'get_default_public_reseller': {
        const rows = await db
          .select()
          .from(schema.resellers)
          .where(and(eq(schema.resellers.is_active, true), eq(schema.resellers.landing_page_enabled, true)))
          .orderBy(asc(schema.resellers.created_at))
          .limit(1);
        return sanitizePublicRows('resellers_public', rows as Record<string, unknown>[], false);
      }

      case 'get_public_reseller_by_slug': {
        const slug = String(args.p_slug || '');
        if (!slug) return [];
        const rows = await db
          .select()
          .from(schema.resellers)
          .where(and(eq(schema.resellers.slug, slug), eq(schema.resellers.is_active, true)))
          .limit(1);
        return sanitizePublicRows('resellers_public', rows as Record<string, unknown>[], false);
      }

      case 'get_restaurant_id_by_slug': {
        const slug = String(args.p_slug || '');
        if (!slug) return null;
        const [row] = await db
          .select({ id: schema.restaurants.id })
          .from(schema.restaurants)
          .where(and(eq(schema.restaurants.slug, slug), eq(schema.restaurants.is_active, true)))
          .limit(1);
        return row?.id ?? null;
      }

      case 'get_public_store_config': {
        const restId = String(args.p_restaurant_id || '');
        if (!restId) return [];
        const rows = await db
          .select()
          .from(schema.store_config)
          .where(eq(schema.store_config.restaurant_id, restId))
          .limit(1);
        return sanitizePublicRows('store_config', rows as Record<string, unknown>[], false);
      }

      case 'get_restaurant_payment_methods': {
        return {
          cash: true,
          pix: true,
          card: true,
          online_pix: false,
          online_card: false,
        };
      }

      case 'get_restaurant_convenience_fee': {
        return {
          fee_type: 'none',
          fee_percent: 0,
          fee_fixed: 0,
          label: null,
          description: null,
        };
      }

      case 'create_customer_order': {
        const restaurantId = String(args.p_restaurant_id || '');
        if (!restaurantId) throw new Error('Restaurante inválido.');

        const [createdOrder] = await db
          .insert(schema.orders)
          .values({
            restaurant_id: restaurantId,
            customer_name: String(args.p_customer_name || 'Cliente'),
            customer_phone: String(args.p_customer_phone || ''),
            address_street: String(args.p_address_street || ''),
            address_number: String(args.p_address_number || ''),
            address_neighborhood: String(args.p_address_neighborhood || ''),
            address_complement: args.p_address_complement ?? null,
            address_reference: args.p_address_reference ?? null,
            total_amount: Number(args.p_total_amount || 0),
            payment_method: String(args.p_payment_method || 'pix'),
            change_for: args.p_change_for != null ? Number(args.p_change_for) : null,
            convenience_fee: Number(args.p_convenience_fee || 0),
            status: 'pending',
          })
          .returning();

        const items = Array.isArray(args.p_items) ? args.p_items : [];
        if (items.length > 0) {
          await db.insert(schema.order_items).values(
            items.map((item: any) => ({
              order_id: createdOrder.id,
              product_id: item.product_id || null,
              product_name: String(item.product_name || 'Item'),
              quantity: Math.max(1, Number(item.quantity || 1)),
              unit_price: Number(item.unit_price || 0),
              observation: item.observation || null,
              unit_of_sale: item.unit_of_sale || 'un',
              quantity_grams: item.quantity_grams ?? null,
              addons_snapshot: item.addons_snapshot ?? null,
              pizza_flavors: item.pizza_flavors ?? null,
              pizza_border: item.pizza_border ?? null,
            })),
          );
        }

        return createdOrder.id;
      }

      case 'search_customer_orders': {
        const phone = String(args.p_phone || '').replace(/\D/g, '');
        const restId = args.p_restaurant_id ? String(args.p_restaurant_id) : null;
        if (!phone) return [];
        const conditions: SQL[] = [ilike(schema.orders.customer_phone, `%${phone}%`)];
        if (restId) conditions.push(eq(schema.orders.restaurant_id, restId));
        return await db
          .select()
          .from(schema.orders)
          .where(and(...conditions))
          .orderBy(desc(schema.orders.created_at))
          .limit(30);
      }

      case 'get_customer_addresses': {
        const phone = String(args.p_phone || '');
        const restId = String(args.p_restaurant_id || '');
        if (!phone || !restId) return [];
        return await db
          .select()
          .from(schema.customer_addresses)
          .where(
            and(
              eq(schema.customer_addresses.restaurant_id, restId),
              eq(schema.customer_addresses.customer_phone, phone),
            ),
          )
          .orderBy(desc(schema.customer_addresses.is_default), desc(schema.customer_addresses.created_at));
      }

      case 'get_open_table_orders': {
        const restId = String(args.p_restaurant_id || '');
        if (!restId) return [];
        return await db
          .select()
          .from(schema.table_orders)
          .where(
            and(
              eq(schema.table_orders.restaurant_id, restId),
              inArray(schema.table_orders.status, ['open', 'requesting_bill']),
            ),
          )
          .orderBy(desc(schema.table_orders.opened_at));
      }

      case 'get_table_order_by_id': {
        const orderId = Number(args.p_order_id);
        if (Number.isNaN(orderId)) return null;
        const [order] = await db
          .select()
          .from(schema.table_orders)
          .where(eq(schema.table_orders.id, orderId))
          .limit(1);
        if (!order) return null;
        const items = await db
          .select()
          .from(schema.table_order_items)
          .where(eq(schema.table_order_items.table_order_id, order.id));
        return { ...order, items };
      }

      case 'validate_waiter_pin': {
        const restId = String(args.p_restaurant_id || '');
        const pin = String(args.p_pin || '');
        const rows = await db
          .select()
          .from(schema.waiters)
          .where(
            and(
              eq(schema.waiters.restaurant_id, restId),
              eq(schema.waiters.pin, pin),
              eq(schema.waiters.is_active, true),
            ),
          )
          .limit(1);
        return rows.map((w) => ({ waiter_id: w.id, waiter_name: w.name }));
      }

      case 'validate_kitchen_pin': {
        const restId = String(args.p_restaurant_id || '');
        const pin = String(args.p_pin || '');
        const [cfg] = await db
          .select({ kitchen_pin: schema.store_config.kitchen_pin })
          .from(schema.store_config)
          .where(eq(schema.store_config.restaurant_id, restId))
          .limit(1);
        return Boolean(cfg?.kitchen_pin && cfg.kitchen_pin === pin);
      }

      case 'validate_driver_pin': {
        const restId = String(args.p_restaurant_id || '');
        const pin = String(args.p_pin || '');
        const rows = await db
          .select()
          .from(schema.delivery_drivers)
          .where(
            and(
              eq(schema.delivery_drivers.restaurant_id, restId),
              eq(schema.delivery_drivers.pin, pin),
              eq(schema.delivery_drivers.is_active, true),
            ),
          )
          .limit(1);
        return rows.map((d) => ({
          driver_id: d.id,
          driver_name: d.name,
          vehicle_type: d.vehicle_type,
          photo_url: d.photo_url,
        }));
      }

      case 'get_active_waiters': {
        const restId = String(args.p_restaurant_id || '');
        if (!restId) return [];
        return await db
          .select({ id: schema.waiters.id, name: schema.waiters.name })
          .from(schema.waiters)
          .where(and(eq(schema.waiters.restaurant_id, restId), eq(schema.waiters.is_active, true)));
      }

      case 'get_open_cash_session': {
        const restId = String(args.p_restaurant_id || '');
        if (!restId) return null;
        const [session] = await db
          .select()
          .from(schema.cash_sessions)
          .where(and(eq(schema.cash_sessions.restaurant_id, restId), eq(schema.cash_sessions.status, 'open')))
          .orderBy(desc(schema.cash_sessions.opened_at))
          .limit(1);
        return session ?? null;
      }

      case 'get_cash_session_summary': {
        const sessionId = String(args.p_session_id || '');
        if (!sessionId) return null;
        const movements = await db
          .select()
          .from(schema.cash_movements)
          .where(eq(schema.cash_movements.session_id, sessionId));
        let totalSales = 0;
        let totalSupplies = 0;
        let totalWithdrawals = 0;
        for (const m of movements) {
          if (m.type === 'sale') totalSales += m.amount;
          else if (m.type === 'supply') totalSupplies += m.amount;
          else if (m.type === 'withdrawal') totalWithdrawals += m.amount;
        }
        return {
          total_sales: totalSales,
          total_supplies: totalSupplies,
          total_withdrawals: totalWithdrawals,
          movement_count: movements.length,
        };
      }

      case 'get_low_stock_items': {
        const restId = String(args.p_restaurant_id || '');
        if (!restId) return [];
        const items = await db
          .select()
          .from(schema.stock_items)
          .where(and(eq(schema.stock_items.restaurant_id, restId), eq(schema.stock_items.is_active, true)));
        return items.filter((i) => i.current_quantity <= i.min_quantity);
      }

      case 'register_stock_movement': {
        if (!authUid) {
          const err = new Error('Autenticação necessária.') as Error & { status?: number };
          err.status = 401;
          throw err;
        }
        const restId = String(args.p_restaurant_id || '');
        const itemId = String(args.p_stock_item_id || '');
        const type = String(args.p_type || 'in');
        const qty = Number(args.p_quantity || 0);
        const [item] = await db
          .select()
          .from(schema.stock_items)
          .where(and(eq(schema.stock_items.id, itemId), eq(schema.stock_items.restaurant_id, restId)))
          .limit(1);
        if (!item) throw new Error('Item de estoque não encontrado.');
        const nextQty =
          type === 'out'
            ? Math.max(0, item.current_quantity - qty)
            : type === 'adjustment'
              ? qty
              : item.current_quantity + qty;

        await db
          .update(schema.stock_items)
          .set({ current_quantity: nextQty, updated_at: new Date() })
          .where(eq(schema.stock_items.id, itemId));

        const [mov] = await db
          .insert(schema.stock_movements)
          .values({
            restaurant_id: restId,
            stock_item_id: itemId,
            type,
            quantity: qty,
            unit_cost: Number(args.p_unit_cost || item.cost_per_unit || 0),
            reason: args.p_reason || null,
          })
          .returning();
        return mov;
      }

      case 'get_drivers_with_location': {
        const restId = String(args.p_restaurant_id || '');
        if (!restId) return [];
        return await db
          .select()
          .from(schema.delivery_drivers)
          .where(and(eq(schema.delivery_drivers.restaurant_id, restId), eq(schema.delivery_drivers.is_active, true)));
      }

      case 'get_driver_orders': {
        const driverId = String(args.p_driver_id || '');
        const pin = String(args.p_pin || '');
        const [driver] = await db
          .select()
          .from(schema.delivery_drivers)
          .where(and(eq(schema.delivery_drivers.id, driverId), eq(schema.delivery_drivers.pin, pin)))
          .limit(1);
        if (!driver) return [];
        return await db
          .select()
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.driver_id, driver.id),
              inArray(schema.orders.status, ['preparing', 'delivery']),
            ),
          )
          .orderBy(desc(schema.orders.created_at));
      }

      case 'driver_update_location': {
        const driverId = String(args.p_driver_id || '');
        const pin = String(args.p_pin || '');
        await db
          .update(schema.delivery_drivers)
          .set({
            current_lat: Number(args.p_lat),
            current_lng: Number(args.p_lng),
            last_location_at: new Date(),
            is_online: true,
          })
          .where(and(eq(schema.delivery_drivers.id, driverId), eq(schema.delivery_drivers.pin, pin)));
        return true;
      }

      case 'driver_action_order': {
        const driverId = String(args.p_driver_id || '');
        const pin = String(args.p_pin || '');
        const orderId = Number(args.p_order_id);
        const action = String(args.p_action || '');
        const [driver] = await db
          .select({ id: schema.delivery_drivers.id })
          .from(schema.delivery_drivers)
          .where(and(eq(schema.delivery_drivers.id, driverId), eq(schema.delivery_drivers.pin, pin)))
          .limit(1);
        if (!driver) throw new Error('Entregador não autorizado.');
        const statusMap: Record<string, { driver_status: string; status?: string }> = {
          accept: { driver_status: 'accepted' },
          refuse: { driver_status: 'refused' },
          pickup: { driver_status: 'picked_up', status: 'delivery' },
          deliver: { driver_status: 'delivered', status: 'completed' },
        };
        const patch = statusMap[action];
        if (patch) {
          await db
            .update(schema.orders)
            .set({ ...patch, updated_at: new Date() })
            .where(and(eq(schema.orders.id, orderId), eq(schema.orders.driver_id, driver.id)));
        }
        return true;
      }

      case 'assign_driver_to_order': {
        if (!authUid) {
          const err = new Error('Autenticação necessária.') as Error & { status?: number };
          err.status = 401;
          throw err;
        }
        await db
          .update(schema.orders)
          .set({
            driver_id: String(args.p_driver_id),
            driver_status: 'assigned',
            updated_at: new Date(),
          })
          .where(eq(schema.orders.id, Number(args.p_order_id)));
        return true;
      }

      case 'list_customer_notifications': {
        const restId = String(args.p_restaurant_id || '');
        const phone = String(args.p_customer_phone || '');
        if (!restId || !phone) return [];
        return await db
          .select()
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.restaurant_id, restId),
              eq(schema.notifications.customer_phone, phone),
            ),
          )
          .orderBy(desc(schema.notifications.created_at))
          .limit(30);
      }

      case 'mark_customer_notification_read': {
        await db
          .update(schema.notifications)
          .set({ is_read: true })
          .where(eq(schema.notifications.id, String(args.p_id)));
        return true;
      }

      case 'mark_customer_notifications_all_read': {
        await db
          .update(schema.notifications)
          .set({ is_read: true })
          .where(
            and(
              eq(schema.notifications.restaurant_id, String(args.p_restaurant_id)),
              eq(schema.notifications.customer_phone, String(args.p_customer_phone)),
            ),
          );
        return true;
      }

      case 'has_fiscal_enabled':
        return false;

      case 'get_order_payment_status': {
        const orderId = Number(args.p_order_id);
        if (Number.isNaN(orderId)) return null;
        const [order] = await db
          .select({ id: schema.orders.id, payment_status: schema.orders.payment_status, status: schema.orders.status })
          .from(schema.orders)
          .where(eq(schema.orders.id, orderId))
          .limit(1);
        return order ?? null;
      }

      case 'get_ai_enhancement_quota':
        return { used: 0, limit: 20, remaining: 20 };

      default:
        return null;
    }
  } catch (error) {
    console.error(`RPC execution failed [${fnName}]:`, error);
    if ((error as any)?.status) throw error;
    throw new Error('Falha ao executar operação no servidor. Tente novamente.', {
      cause: error,
    });
  }
}
