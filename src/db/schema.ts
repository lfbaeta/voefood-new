import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ==================== USERS & ROLES ====================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const user_roles = pgTable('user_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull(),
  role: text('role').notNull(), // 'admin' | 'reseller' | 'restaurant_admin'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== RESELLERS & PLANS ====================
export const resellers = pgTable('resellers', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  company_name: text('company_name'),
  slug: text('slug').unique(),
  is_active: boolean('is_active').default(true).notNull(),
  primary_color: text('primary_color').default('16 88% 66%'),
  secondary_color: text('secondary_color').default('220 10% 20%'),
  background_color: text('background_color'),
  foreground_color: text('foreground_color'),
  button_text_color: text('button_text_color'),
  landing_page_enabled: boolean('landing_page_enabled').default(true).notNull(),
  landing_page_logo: text('landing_page_logo'),
  landing_page_title: text('landing_page_title'),
  landing_page_subtitle: text('landing_page_subtitle'),
  landing_page_whatsapp: text('landing_page_whatsapp'),
  landing_page_email: text('landing_page_email'),
  landing_testimonials: jsonb('landing_testimonials'),
  landing_faq: jsonb('landing_faq'),
  landing_stats: jsonb('landing_stats'),
  mp_integration_enabled: boolean('mp_integration_enabled').default(false).notNull(),
  mp_public_key: text('mp_public_key'),
  root_domain: text('root_domain'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscription_plans = pgTable('subscription_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  reseller_id: uuid('reseller_id')
    .notNull()
    .references(() => resellers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  monthly_fee: doublePrecision('monthly_fee').default(0).notNull(),
  setup_fee: doublePrecision('setup_fee').default(0).notNull(),
  trial_days: integer('trial_days').default(7).notNull(),
  features: jsonb('features').$type<string[]>(),
  enabled_features: jsonb('enabled_features').$type<string[]>(),
  is_popular: boolean('is_popular').default(false).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  wa_instances_limit: integer('wa_instances_limit').default(1).notNull(),
  convenience_fee_type: text('convenience_fee_type').default('none'),
  convenience_fee_percent: doublePrecision('convenience_fee_percent').default(0),
  convenience_fee_fixed: doublePrecision('convenience_fee_fixed').default(0),
  convenience_fee_label: text('convenience_fee_label'),
  convenience_fee_description: text('convenience_fee_description'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== RESTAURANTS ====================
export const restaurants = pgTable('restaurants', {
  id: uuid('id').defaultRandom().primaryKey(),
  reseller_id: uuid('reseller_id').references(() => resellers.id, { onDelete: 'set null' }),
  plan_id: uuid('plan_id').references(() => subscription_plans.id, { onDelete: 'set null' }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  business_type: text('business_type').default('restaurant'),
  is_active: boolean('is_active').default(true).notNull(),
  subscription_status: text('subscription_status').default('active').notNull(),
  subscription_start_date: timestamp('subscription_start_date', { withTimezone: true }),
  subscription_end_date: timestamp('subscription_end_date', { withTimezone: true }),
  monthly_fee: doublePrecision('monthly_fee').default(0).notNull(),
  trial_days: integer('trial_days').default(7).notNull(),
  setup_fee: doublePrecision('setup_fee').default(0),
  phone: text('phone'),
  owner_name: text('owner_name'),
  contact_email: text('contact_email'),
  custom_domain: text('custom_domain'),
  mp_subscription_id: text('mp_subscription_id'),
  mp_payer_email: text('mp_payer_email'),
  mp_init_point: text('mp_init_point'),
  mp_subscription_status: text('mp_subscription_status'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const restaurant_admins = pgTable('restaurant_admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull(),
  email: text('email'),
  is_owner: boolean('is_owner').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const store_config = pgTable('store_config', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .unique()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone_whatsapp: text('phone_whatsapp'),
  pix_key: text('pix_key'),
  pix_key_type: text('pix_key_type'),
  pix_message: text('pix_message'),
  logo_url: text('logo_url'),
  cover_url: text('cover_url'),
  is_open: boolean('is_open').default(true).notNull(),
  delivery_fee: doublePrecision('delivery_fee').default(0).notNull(),
  delivery_fee_mode: text('delivery_fee_mode').default('fixed').notNull(),
  min_order_value: doublePrecision('min_order_value').default(0).notNull(),
  address: text('address'),
  delivery_time_min: integer('delivery_time_min').default(30).notNull(),
  delivery_time_max: integer('delivery_time_max').default(45).notNull(),
  primary_color: text('primary_color').default('16 88% 66%'),
  secondary_color: text('secondary_color').default('142 76% 49%'),
  accent_color: text('accent_color'),
  background_color: text('background_color'),
  foreground_color: text('foreground_color'),
  button_text_color: text('button_text_color'),
  pwa_name: text('pwa_name'),
  pwa_short_name: text('pwa_short_name'),
  msg_order_accepted: text('msg_order_accepted'),
  msg_order_preparing: text('msg_order_preparing'),
  msg_order_delivery: text('msg_order_delivery'),
  msg_order_completed: text('msg_order_completed'),
  timezone: text('timezone').default('America/Sao_Paulo'),
  business_type: text('business_type').default('restaurant'),
  menu_labels: jsonb('menu_labels').$type<Record<string, string>>(),
  hero_text_1: text('hero_text_1'),
  hero_text_2: text('hero_text_2'),
  hero_text_3: text('hero_text_3'),
  hero_slogan: text('hero_slogan'),
  menu_layout: text('menu_layout').default('default'),
  kitchen_pin: text('kitchen_pin'),
  meta_pixel_id: text('meta_pixel_id'),
  google_ads_id: text('google_ads_id'),
  google_analytics_id: text('google_analytics_id'),
  tracking_enabled: boolean('tracking_enabled').default(false),
  print_prefs: jsonb('print_prefs'),
  modules_enabled: jsonb('modules_enabled'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== CATALOG ====================
export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  image_url: text('image_url'),
  icon: text('icon'),
  sort_order: integer('sort_order').default(0).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  department: text('department').default('kitchen'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').default(''),
  price: doublePrecision('price').default(0).notNull(),
  promo_price: doublePrecision('promo_price'),
  is_promo: boolean('is_promo').default(false).notNull(),
  image_url: text('image_url'),
  is_available: boolean('is_available').default(true).notNull(),
  is_featured: boolean('is_featured').default(false).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  unit_of_sale: text('unit_of_sale').default('un'),
  allow_weight_variation: boolean('allow_weight_variation').default(false),
  department: text('department').default('kitchen'),
  is_pizza: boolean('is_pizza').default(false),
  pizza_size_id: uuid('pizza_size_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const addon_groups = pgTable('addon_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  is_required: boolean('is_required').default(false).notNull(),
  min_selections: integer('min_selections').default(0).notNull(),
  max_selections: integer('max_selections').default(1).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const addon_options = pgTable('addon_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  group_id: uuid('group_id')
    .notNull()
    .references(() => addon_groups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  price: doublePrecision('price').default(0).notNull(),
  is_available: boolean('is_available').default(true).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const product_addon_groups = pgTable('product_addon_groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  product_id: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  addon_group_id: uuid('addon_group_id')
    .notNull()
    .references(() => addon_groups.id, { onDelete: 'cascade' }),
  sort_order: integer('sort_order').default(0).notNull(),
});

// ==================== HOURS, ZONES, COUPONS ====================
export const business_hours = pgTable('business_hours', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  day_of_week: integer('day_of_week').notNull(),
  open_time: text('open_time').default('18:00').notNull(),
  close_time: text('close_time').default('23:00').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const delivery_zones = pgTable('delivery_zones', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  neighborhood: text('neighborhood').notNull(),
  fee: doublePrecision('fee').default(0).notNull(),
  min_order: doublePrecision('min_order').default(0),
  delivery_time_min: integer('delivery_time_min').default(30),
  delivery_time_max: integer('delivery_time_max').default(45),
  is_active: boolean('is_active').default(true).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const coupons = pgTable('coupons', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  discount_type: text('discount_type').default('percentage').notNull(),
  discount_value: doublePrecision('discount_value').default(0).notNull(),
  min_order_value: doublePrecision('min_order_value').default(0),
  max_uses: integer('max_uses'),
  current_uses: integer('current_uses').default(0).notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== ORDERS ====================
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  customer_name: text('customer_name').notNull(),
  customer_phone: text('customer_phone').notNull(),
  address_street: text('address_street').default('').notNull(),
  address_number: text('address_number').default('').notNull(),
  address_neighborhood: text('address_neighborhood').default('').notNull(),
  address_complement: text('address_complement'),
  address_reference: text('address_reference'),
  total_amount: doublePrecision('total_amount').default(0).notNull(),
  convenience_fee: doublePrecision('convenience_fee').default(0),
  delivery_fee: doublePrecision('delivery_fee').default(0),
  discount: doublePrecision('discount').default(0),
  coupon_code: text('coupon_code'),
  status: text('status').default('pending').notNull(),
  payment_method: text('payment_method').default('pix').notNull(),
  payment_status: text('payment_status').default('pending'),
  change_for: doublePrecision('change_for'),
  notes: text('notes'),
  driver_id: uuid('driver_id'),
  driver_status: text('driver_status'),
  origin: text('origin').default('menu'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const order_items = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  order_id: integer('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  product_id: uuid('product_id'),
  product_name: text('product_name').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  unit_price: doublePrecision('unit_price').default(0).notNull(),
  observation: text('observation'),
  unit_of_sale: text('unit_of_sale').default('un'),
  quantity_grams: integer('quantity_grams'),
  final_quantity_grams: integer('final_quantity_grams'),
  final_unit_price: doublePrecision('final_unit_price'),
  weight_status: text('weight_status').default('fixed'),
  addons_snapshot: jsonb('addons_snapshot'),
  pizza_flavors: jsonb('pizza_flavors'),
  pizza_border: jsonb('pizza_border'),
  department: text('department').default('kitchen'),
  kitchen_status: text('kitchen_status').default('pending'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== TABLES & PDV ====================
export const tables = pgTable('tables', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  name: text('name'),
  capacity: integer('capacity').default(4).notNull(),
  status: text('status').default('available').notNull(),
  current_order_id: integer('current_order_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const table_orders = pgTable('table_orders', {
  id: serial('id').primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  table_id: uuid('table_id').references(() => tables.id, { onDelete: 'set null' }),
  waiter_name: text('waiter_name'),
  customer_count: integer('customer_count').default(1).notNull(),
  status: text('status').default('open').notNull(),
  subtotal: doublePrecision('subtotal').default(0).notNull(),
  discount: doublePrecision('discount').default(0).notNull(),
  discount_type: text('discount_type').default('value').notNull(),
  service_fee_enabled: boolean('service_fee_enabled').default(false).notNull(),
  service_fee_percentage: doublePrecision('service_fee_percentage').default(10).notNull(),
  total_amount: doublePrecision('total_amount').default(0).notNull(),
  payment_method: text('payment_method'),
  notes: text('notes'),
  opened_at: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const table_order_items = pgTable('table_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  table_order_id: integer('table_order_id')
    .notNull()
    .references(() => table_orders.id, { onDelete: 'cascade' }),
  product_id: uuid('product_id'),
  product_name: text('product_name').notNull(),
  quantity: integer('quantity').default(1).notNull(),
  unit_price: doublePrecision('unit_price').default(0).notNull(),
  observation: text('observation'),
  status: text('status').default('pending').notNull(),
  department: text('department').default('kitchen'),
  ordered_at: timestamp('ordered_at', { withTimezone: true }).defaultNow().notNull(),
  delivered_at: timestamp('delivered_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== STAFF & DRIVERS ====================
export const waiters = pgTable('waiters', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone'),
  pin: text('pin').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const delivery_drivers = pgTable('delivery_drivers', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone'),
  pin: text('pin').notNull(),
  vehicle_type: text('vehicle_type').default('moto'),
  vehicle_plate: text('vehicle_plate'),
  photo_url: text('photo_url'),
  is_active: boolean('is_active').default(true).notNull(),
  is_online: boolean('is_online').default(false).notNull(),
  current_lat: doublePrecision('current_lat'),
  current_lng: doublePrecision('current_lng'),
  last_location_at: timestamp('last_location_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const customer_addresses = pgTable('customer_addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  customer_phone: text('customer_phone').notNull(),
  label: text('label').default('Casa'),
  street: text('street').notNull(),
  number: text('number').notNull(),
  neighborhood: text('neighborhood').notNull(),
  complement: text('complement'),
  reference: text('reference'),
  is_default: boolean('is_default').default(false).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== CASH REGISTER ====================
export const cash_sessions = pgTable('cash_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  opened_by: text('opened_by'),
  opened_at: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  opening_balance: doublePrecision('opening_balance').default(0).notNull(),
  closing_balance: doublePrecision('closing_balance'),
  expected_balance: doublePrecision('expected_balance'),
  status: text('status').default('open').notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cash_movements = pgTable('cash_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  session_id: uuid('session_id')
    .notNull()
    .references(() => cash_sessions.id, { onDelete: 'cascade' }),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'sale' | 'supply' | 'withdrawal'
  amount: doublePrecision('amount').default(0).notNull(),
  payment_method: text('payment_method').default('money'),
  description: text('description'),
  order_id: integer('order_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== STOCK & INVENTORY ====================
export const stock_items = pgTable('stock_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  unit: text('unit').default('un').notNull(),
  current_quantity: doublePrecision('current_quantity').default(0).notNull(),
  min_quantity: doublePrecision('min_quantity').default(0).notNull(),
  cost_per_unit: doublePrecision('cost_per_unit').default(0).notNull(),
  sku: text('sku'),
  category: text('category'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stock_movements = pgTable('stock_movements', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  stock_item_id: uuid('stock_item_id')
    .notNull()
    .references(() => stock_items.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'in' | 'out' | 'adjustment'
  quantity: doublePrecision('quantity').default(0).notNull(),
  unit_cost: doublePrecision('unit_cost').default(0),
  reason: text('reason'),
  reference_id: text('reference_id'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  cnpj: text('cnpj'),
  notes: text('notes'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  supplier_id: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
  status: text('status').default('draft').notNull(),
  total_amount: doublePrecision('total_amount').default(0).notNull(),
  invoice_number: text('invoice_number'),
  notes: text('notes'),
  received_at: timestamp('received_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const purchase_items = pgTable('purchase_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  purchase_id: uuid('purchase_id')
    .notNull()
    .references(() => purchases.id, { onDelete: 'cascade' }),
  stock_item_id: uuid('stock_item_id')
    .notNull()
    .references(() => stock_items.id, { onDelete: 'cascade' }),
  quantity: doublePrecision('quantity').default(0).notNull(),
  unit_cost: doublePrecision('unit_cost').default(0).notNull(),
  total_cost: doublePrecision('total_cost').default(0).notNull(),
});

export const product_recipes = pgTable('product_recipes', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  product_id: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  stock_item_id: uuid('stock_item_id')
    .notNull()
    .references(() => stock_items.id, { onDelete: 'cascade' }),
  quantity: doublePrecision('quantity').default(0).notNull(),
});

// ==================== PIZZERIA ====================
export const pizza_sizes = pgTable('pizza_sizes', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slices: integer('slices').default(8).notNull(),
  max_flavors: integer('max_flavors').default(2).notNull(),
  base_price: doublePrecision('base_price').default(0).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pizza_flavors_catalog = pgTable('pizza_flavors_catalog', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').default('tradicional'),
  image_url: text('image_url'),
  is_active: boolean('is_active').default(true).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pizza_flavor_prices = pgTable('pizza_flavor_prices', {
  id: uuid('id').defaultRandom().primaryKey(),
  flavor_id: uuid('flavor_id')
    .notNull()
    .references(() => pizza_flavors_catalog.id, { onDelete: 'cascade' }),
  size_id: uuid('size_id')
    .notNull()
    .references(() => pizza_sizes.id, { onDelete: 'cascade' }),
  price: doublePrecision('price').default(0).notNull(),
});

export const pizza_borders_catalog = pgTable('pizza_borders_catalog', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pizza_border_prices = pgTable('pizza_border_prices', {
  id: uuid('id').defaultRandom().primaryKey(),
  border_id: uuid('border_id')
    .notNull()
    .references(() => pizza_borders_catalog.id, { onDelete: 'cascade' }),
  size_id: uuid('size_id')
    .notNull()
    .references(() => pizza_sizes.id, { onDelete: 'cascade' }),
  price: doublePrecision('price').default(0).notNull(),
});

// ==================== NOTIFICATIONS, BILLING, PRINT, SETTINGS ====================
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  customer_phone: text('customer_phone'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  type: text('type').default('order').notNull(),
  order_id: integer('order_id'),
  is_read: boolean('is_read').default(false).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscription_payments = pgTable('subscription_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  amount: doublePrecision('amount').default(0).notNull(),
  payment_date: timestamp('payment_date', { withTimezone: true }),
  due_date: timestamp('due_date', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').default('pending').notNull(),
  payment_method: text('payment_method'),
  notes: text('notes'),
  mp_payment_id: text('mp_payment_id'),
  mp_external_reference: text('mp_external_reference'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const communication_logs = pgTable('communication_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
  reseller_id: uuid('reseller_id').references(() => resellers.id, { onDelete: 'cascade' }),
  type: text('type').default('whatsapp').notNull(),
  message: text('message').notNull(),
  sent_at: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const print_stations = pgTable('print_stations', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  department: text('department').default('kitchen'),
  printer_width: integer('printer_width').default(80),
  is_active: boolean('is_active').default(true).notNull(),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const print_jobs = pgTable('print_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  restaurant_id: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  station_id: uuid('station_id').references(() => print_stations.id, { onDelete: 'set null' }),
  order_id: integer('order_id'),
  table_order_id: integer('table_order_id'),
  job_type: text('job_type').default('receipt').notNull(),
  payload: jsonb('payload'),
  status: text('status').default('pending').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  printed_at: timestamp('printed_at', { withTimezone: true }),
});

export const business_type_defaults = pgTable('business_type_defaults', {
  id: uuid('id').defaultRandom().primaryKey(),
  business_type: text('business_type').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
  capabilities: jsonb('capabilities'),
  default_categories: jsonb('default_categories'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ==================== RELATIONS ====================
export const resellersRelations = relations(resellers, ({ many }) => ({
  restaurants: many(restaurants),
  plans: many(subscription_plans),
}));

export const restaurantsRelations = relations(restaurants, ({ one, many }) => ({
  reseller: one(resellers, {
    fields: [restaurants.reseller_id],
    references: [resellers.id],
  }),
  plan: one(subscription_plans, {
    fields: [restaurants.plan_id],
    references: [subscription_plans.id],
  }),
  admins: many(restaurant_admins),
  categories: many(categories),
  products: many(products),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  restaurant: one(restaurants, {
    fields: [orders.restaurant_id],
    references: [restaurants.id],
  }),
  items: many(order_items),
}));

export const orderItemsRelations = relations(order_items, ({ one }) => ({
  order: one(orders, {
    fields: [order_items.order_id],
    references: [orders.id],
  }),
}));

export const tableOrdersRelations = relations(table_orders, ({ one, many }) => ({
  table: one(tables, {
    fields: [table_orders.table_id],
    references: [tables.id],
  }),
  items: many(table_order_items),
}));

export const tableOrderItemsRelations = relations(table_order_items, ({ one }) => ({
  tableOrder: one(table_orders, {
    fields: [table_order_items.table_order_id],
    references: [table_orders.id],
  }),
}));
