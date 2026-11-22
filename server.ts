import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { requireAuth, optionalAuth, type AuthRequest } from './src/middleware/auth.ts';
import { getOrCreateUser, getUserPermissions } from './src/db/users.ts';
import {
  executeDbQuery,
  executeRpc,
  seedStarterRestaurantMenu,
  setupInitialReseller,
  type DbQueryPayload,
} from './src/db/repository.ts';
import { db } from './src/db/index.ts';
import * as schema from './src/db/schema.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  // Authenticated user profile & permissions
  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email || `${uid}@firebase.local`;
      const name = req.user!.name || null;

      const user = await getOrCreateUser(uid, email, name);
      const permissions = await getUserPermissions(uid);

      return res.json({
        user: {
          id: uid,
          uid,
          email: user.email,
          name: user.name,
        },
        permissions,
      });
    } catch (error: any) {
      console.error('Failed to load authenticated user:', error);
      return res.status(500).json({ error: error?.message || 'Erro ao carregar perfil.' });
    }
  });

  // Initial reseller bootstrap (protected by Firebase Auth)
  app.post('/api/setup/reseller', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = String(req.body?.email || req.user!.email || '').trim();
      const name = String(req.body?.name || req.user!.name || 'Administrador').trim();
      const companyName = req.body?.companyName ? String(req.body.companyName).trim() : null;
      const phone = req.body?.phone ? String(req.body.phone).trim() : null;

      if (!name || !email) {
        return res.status(400).json({ error: 'Nome e email são obrigatórios.' });
      }

      const result = await setupInitialReseller({
        uid,
        name,
        email,
        companyName,
        phone,
      });

      return res.status(201).json(result);
    } catch (error: any) {
      console.error('Failed to setup initial reseller:', error);
      const status = error?.message?.includes('já possui') ? 409 : 500;
      return res.status(status).json({ error: error?.message || 'Erro ao configurar revendedor.' });
    }
  });

  // Parameterized Drizzle query endpoint
  app.post('/api/db/query', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const payload = req.body as DbQueryPayload;
      if (!payload || typeof payload.table !== 'string' || typeof payload.action !== 'string') {
        return res.status(400).json({ error: 'Requisição de consulta inválida.' });
      }

      const result = await executeDbQuery(payload, req.user?.uid);
      return res.json(result);
    } catch (error: any) {
      const status = typeof error?.status === 'number' ? error.status : 500;
      return res.status(status).json({
        data: null,
        error: { message: error?.message || 'Erro ao executar consulta.' },
      });
    }
  });

  // Parameterized Drizzle RPC endpoint
  app.post('/api/db/rpc/:fnName', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const fnName = req.params.fnName;
      const args = (req.body && typeof req.body === 'object') ? req.body : {};
      const data = await executeRpc(fnName, args, req.user?.uid);
      return res.json({ data, error: null });
    } catch (error: any) {
      const status = typeof error?.status === 'number' ? error.status : 500;
      return res.status(status).json({
        data: null,
        error: { message: error?.message || 'Erro ao executar RPC.' },
      });
    }
  });

  // Server-side actions (replaces legacy edge function invocations)
  app.post('/api/functions/:fnName', optionalAuth, async (req: AuthRequest, res) => {
    const fnName = req.params.fnName;
    const body = (req.body && typeof req.body === 'object') ? req.body : {};

    try {
      if (fnName === 'setup-reseller') {
        if (!req.user) {
          return res.status(401).json({
            data: null,
            error: { message: 'Faça login com Google para concluir a configuração inicial.' },
          });
        }
        const result = await setupInitialReseller({
          uid: req.user.uid,
          name: String(body.name || req.user.name || 'Administrador').trim(),
          email: String(body.email || req.user.email || '').trim(),
          companyName: body.companyName ? String(body.companyName).trim() : null,
          phone: body.phone ? String(body.phone).trim() : null,
        });
        return res.json({ data: result, error: null });
      }

      if (fnName === 'seed-restaurant-menu') {
        if (!req.user) {
          return res.status(401).json({ data: null, error: { message: 'Autenticação necessária.' } });
        }
        const restaurantId = String(body.restaurant_id || body.restaurantId || '');
        if (!restaurantId) {
          return res.status(400).json({ data: null, error: { message: 'restaurant_id é obrigatório.' } });
        }
        const result = await seedStarterRestaurantMenu(restaurantId);
        return res.json({ data: result, error: null });
      }

      if (fnName === 'create-restaurant-admin') {
        if (!req.user) {
          return res.status(401).json({ data: null, error: { message: 'Autenticação necessária.' } });
        }
        const perms = await getUserPermissions(req.user.uid);
        if (!perms.isReseller && !perms.isSuperAdmin) {
          return res.status(403).json({ data: null, error: { message: 'Permissão negada.' } });
        }
        const restaurantId = String(body.restaurant_id || body.restaurantId || '');
        const email = String(body.email || '').trim().toLowerCase();
        if (!restaurantId || !email) {
          return res.status(400).json({ data: null, error: { message: 'Restaurante e email são obrigatórios.' } });
        }
        const [existingUser] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1);

        const targetUid = existingUser?.uid || `pending:${email}`;
        const [admin] = await db
          .insert(schema.restaurant_admins)
          .values({
            restaurant_id: restaurantId,
            user_id: targetUid,
            email,
            is_owner: Boolean(body.is_owner ?? true),
          })
          .returning();

        return res.json({ data: { admin }, error: null });
      }

      if (fnName === 'get-admin-emails') {
        if (!req.user) {
          return res.status(401).json({ data: null, error: { message: 'Autenticação necessária.' } });
        }
        const restaurantId = String(body.restaurant_id || body.restaurantId || '');
        if (!restaurantId) return res.json({ data: { emails: {} }, error: null });
        const admins = await db
          .select()
          .from(schema.restaurant_admins)
          .where(eq(schema.restaurant_admins.restaurant_id, restaurantId));
        const emails: Record<string, string> = {};
        for (const a of admins) {
          if (a.email) emails[a.user_id] = a.email;
        }
        return res.json({ data: { emails }, error: null });
      }

      if (fnName === 'notify-event') {
        return res.json({ data: { ok: true }, error: null });
      }

      return res.json({
        data: { ok: false, message: `Integração "${fnName}" requer configuração externa.` },
        error: null,
      });
    } catch (error: any) {
      console.error(`Function ${fnName} failed:`, error);
      return res.status(500).json({
        data: null,
        error: { message: error?.message || 'Erro ao executar ação no servidor.' },
      });
    }
  });

  // Safe image upload (validates raster image MIME and size, returns clean data URL)
  app.post('/api/upload', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { mimeType, base64 } = req.body || {};
      if (!mimeType || !ALLOWED_IMAGE_MIMES.has(String(mimeType))) {
        return res.status(400).json({ error: 'Formato de imagem inválido. Use PNG, JPG, WEBP ou GIF.' });
      }
      if (!base64 || typeof base64 !== 'string') {
        return res.status(400).json({ error: 'Conteúdo da imagem ausente.' });
      }
      const approxBytes = Math.ceil((base64.length * 3) / 4);
      if (approxBytes > 4 * 1024 * 1024) {
        return res.status(413).json({ error: 'Imagem muito grande. Limite máximo de 4MB.' });
      }
      const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
      const publicUrl = `data:${mimeType};base64,${cleanBase64}`;
      return res.json({ publicUrl });
    } catch (error: any) {
      console.error('Upload failed:', error);
      return res.status(500).json({ error: 'Erro ao processar imagem.' });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
