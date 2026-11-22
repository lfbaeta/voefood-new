import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  auth,
  googleAuthProvider,
  getFirebaseIdToken,
  clearFirebaseTokenCache,
} from '@/lib/firebase';

export interface CompatUser {
  id: string;
  email?: string;
  user_metadata: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
  };
  app_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
}

export interface CompatSession {
  access_token: string;
  token_type: 'bearer';
  user: CompatUser;
}

function toCompatUser(fbUser: FirebaseUser): CompatUser {
  return {
    id: fbUser.uid,
    email: fbUser.email ?? undefined,
    user_metadata: {
      full_name: fbUser.displayName ?? undefined,
      name: fbUser.displayName ?? undefined,
      avatar_url: fbUser.photoURL ?? undefined,
    },
    app_metadata: { provider: 'google' },
    aud: 'authenticated',
    created_at: fbUser.metadata.creationTime ?? new Date().toISOString(),
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = await getFirebaseIdToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'in' | 'is';

interface QueryResult<T = any> {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

class CloudSqlQueryBuilder implements PromiseLike<QueryResult> {
  private table: string;
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private selectClause?: string;
  private filters: Array<{ op: FilterOp; column: string; value: unknown }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitVal?: number;
  private offsetVal?: number;
  private singleVal = false;
  private maybeSingleVal = false;
  private valuesVal?: Record<string, unknown> | Record<string, unknown>[];
  private onConflictVal?: string;
  private countVal?: 'exact' | 'planned' | 'estimated';
  private headVal = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.selectClause = columns;
    if (options?.count) this.countVal = options.count;
    if (options?.head) this.headVal = options.head;
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = 'insert';
    this.valuesVal = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.action = 'update';
    this.valuesVal = values;
    return this;
  }

  upsert(values: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
    this.action = 'upsert';
    this.valuesVal = values;
    if (options?.onConflict) this.onConflictVal = options.onConflict;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ op: 'neq', column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ op: 'gt', column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ op: 'lt', column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }

  ilike(column: string, value: string) {
    this.filters.push({ op: 'ilike', column, value });
    return this;
  }

  like(column: string, value: string) {
    this.filters.push({ op: 'ilike', column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ op: 'in', column, value: values });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ op: 'is', column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === 'is' && value === null) {
      this.filters.push({ op: 'is', column, value: 'not_null' });
    } else if (operator === 'eq') {
      this.filters.push({ op: 'neq', column, value });
    }
    return this;
  }

  or(_expression: string) {
    return this;
  }

  filter(column: string, operator: string, value: unknown) {
    const allowed: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'in', 'is'];
    if (allowed.includes(operator as FilterOp)) {
      this.filters.push({ op: operator as FilterOp, column, value });
    }
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.limitVal = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetVal = from;
    this.limitVal = Math.max(1, to - from + 1);
    return this;
  }

  single() {
    this.singleVal = true;
    return this;
  }

  maybeSingle() {
    this.maybeSingleVal = true;
    return this;
  }

  private async execute(): Promise<QueryResult> {
    try {
      const response = await fetch('/api/db/query', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          select: this.selectClause,
          filters: this.filters,
          orders: this.orders,
          limit: this.limitVal,
          offset: this.offsetVal,
          single: this.singleVal,
          maybeSingle: this.maybeSingleVal,
          values: this.valuesVal,
          onConflict: this.onConflictVal,
          count: this.countVal,
          head: this.headVal,
        }),
      });

      const json = await response.json();
      if (!response.ok || json.error) {
        return {
          data: null,
          error: json.error || { message: json.message || 'Erro ao comunicar com o servidor.' },
          count: null,
        };
      }

      return {
        data: json.data ?? (this.singleVal || this.maybeSingleVal ? null : []),
        error: null,
        count: json.count ?? null,
      };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error?.message || 'Erro de conexão com o servidor.' },
        count: null,
      };
    }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

const uploadedUrlMap = new Map<string, string>();

function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const storageClient = {
  from(bucket: string) {
    return {
      async upload(path: string, file: File | Blob) {
        try {
          const base64 = await fileToBase64(file);
          const mimeType = file.type || 'image/png';
          const res = await fetch('/api/upload', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ bucket, path, mimeType, base64 }),
          });
          const json = await res.json();
          if (!res.ok || !json.publicUrl) {
            return { data: null, error: { message: json.error || 'Falha no envio da imagem.' } };
          }
          uploadedUrlMap.set(`${bucket}/${path}`, json.publicUrl);
          return { data: { path }, error: null };
        } catch (error: any) {
          return { data: null, error: { message: error?.message || 'Falha no envio da imagem.' } };
        }
      },
      getPublicUrl(path: string) {
        const stored = uploadedUrlMap.get(`${bucket}/${path}`);
        return {
          data: {
            publicUrl: stored || path,
          },
        };
      },
      async remove(paths: string[]) {
        for (const p of paths) {
          uploadedUrlMap.delete(`${bucket}/${p}`);
        }
        return { data: paths, error: null };
      },
    };
  },
};

const authClient = {
  async getSession() {
    await auth.authStateReady();
    const fbUser = auth.currentUser;
    if (!fbUser) {
      return { data: { session: null }, error: null };
    }
    const token = (await getFirebaseIdToken()) || '';
    const session: CompatSession = {
      access_token: token,
      token_type: 'bearer',
      user: toCompatUser(fbUser),
    };
    return { data: { session }, error: null };
  },

  async getUser() {
    await auth.authStateReady();
    const fbUser = auth.currentUser;
    return {
      data: { user: fbUser ? toCompatUser(fbUser) : null },
      error: null,
    };
  },

  onAuthStateChange(callback: (event: string, session: CompatSession | null) => void) {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        clearFirebaseTokenCache();
        callback('SIGNED_OUT', null);
        return;
      }
      const token = (await getFirebaseIdToken()) || '';
      callback('SIGNED_IN', {
        access_token: token,
        token_type: 'bearer',
        user: toCompatUser(fbUser),
      });
    });

    return {
      data: {
        subscription: {
          unsubscribe,
        },
      },
    };
  },

  async signInWithGoogle() {
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const token = (await getFirebaseIdToken(true)) || '';
      return {
        data: {
          user: toCompatUser(cred.user),
          session: {
            access_token: token,
            token_type: 'bearer' as const,
            user: toCompatUser(cred.user),
          },
        },
        error: null,
      };
    } catch (error: any) {
      return {
        data: { user: null, session: null },
        error: { message: error?.message || 'Erro ao autenticar com Google.' },
      };
    }
  },

  async signInWithPassword(_credentials: { email: string; password: string }) {
    return {
      data: { user: null, session: null },
      error: { message: 'Use o botão "Entrar com Google" para acessar o sistema.' },
    };
  },

  async signUp(_credentials: { email: string; password: string; options?: unknown }) {
    return {
      data: { user: null, session: null },
      error: { message: 'Use o botão "Entrar com Google" para criar sua conta.' },
    };
  },

  async resetPasswordForEmail(_email: string, _options?: unknown) {
    return {
      data: null,
      error: { message: 'A autenticação é gerenciada pela sua conta Google.' },
    };
  },

  async signOut() {
    clearFirebaseTokenCache();
    await firebaseSignOut(auth);
    return { error: null };
  },
};

class NoopRealtimeChannel {
  on(_type: string, _filter: unknown, _callback: (payload: any) => void) {
    return this;
  }
  subscribe(_cb?: (status: string) => void) {
    return this;
  }
  unsubscribe() {
    return Promise.resolve('ok');
  }
}

export const supabase: any = {
  from(table: string) {
    return new CloudSqlQueryBuilder(table);
  },

  async rpc(fnName: string, args: Record<string, unknown> = {}) {
    try {
      const res = await fetch(`/api/db/rpc/${encodeURIComponent(fnName)}`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(args),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        return {
          data: null,
          error: json.error || { message: 'Erro ao executar operação.' },
        };
      }
      return { data: json.data, error: null };
    } catch (error: any) {
      return {
        data: null,
        error: { message: error?.message || 'Erro de conexão com o servidor.' },
      };
    }
  },

  functions: {
    async invoke(fnName: string, options?: { body?: Record<string, unknown> }) {
      try {
        const res = await fetch(`/api/functions/${encodeURIComponent(fnName)}`, {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify(options?.body ?? {}),
        });
        const json = await res.json();
        if (!res.ok || json.error) {
          return {
            data: json.data ?? null,
            error: json.error || { message: json.error?.message || 'Erro ao executar função.' },
          };
        }
        return { data: json.data, error: null };
      } catch (error: any) {
        return {
          data: null,
          error: { message: error?.message || 'Erro de conexão com o servidor.' },
        };
      }
    },
  },

  storage: storageClient,
  auth: authClient,

  channel(_name: string) {
    return new NoopRealtimeChannel();
  },

  removeChannel(_channel: unknown) {
    return Promise.resolve('ok');
  },
};
