import { vi } from 'vitest';
import appModule from '../src/app.js';

const { createApp } = appModule;

export const ALICE = { id: '11111111-1111-1111-1111-111111111111', email: 'alice@example.com' };
export const BOB = { id: '22222222-2222-2222-2222-222222222222', email: 'bob@example.com' };

const TOKENS = { 'token-alice': ALICE, 'token-bob': BOB };

export const asAlice = { Authorization: 'Bearer token-alice' };
export const asBob = { Authorization: 'Bearer token-bob' };

// A recorded query: which client ran it, on which table, and the chain of
// builder calls (select, eq, insert, ...) that made it up.
class Query {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.ops = [];
  }
  // Arguments of the first call to `name`, or undefined if it was never called.
  args(name) {
    return this.ops.find(([op]) => op === name)?.slice(1);
  }
  has(name) {
    return this.ops.some(([op]) => op === name);
  }
  // Value passed to .eq(column, value)
  eq(column) {
    return this.ops.find(([op, col]) => op === 'eq' && col === column)?.[2];
  }
  get action() {
    return ['insert', 'update', 'upsert', 'delete'].find((op) => this.has(op)) || 'select';
  }
}

// Stands in for the object src/supabase.js builds. Tests register a handler
// per table (or rpc name) that receives the recorded Query and returns the
// { data, error, count } PostgREST would have.
export function createFakeSupabase() {
  const handlers = {};
  const queries = [];

  const run = (query) => {
    queries.push(query);
    const handler = handlers[query.table];
    return handler ? handler(query) : { data: [], error: null, count: 0 };
  };

  const builder = (client, table) => {
    const query = new Query(client, table);
    const proxy = new Proxy(
      {},
      {
        get(_, prop) {
          if (prop === 'then') {
            return (resolve, reject) => Promise.resolve(run(query)).then(resolve, reject);
          }
          return (...args) => {
            query.ops.push([prop, ...args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const dbClient = (name) => ({ from: (table) => builder(name, table) });

  // One object per auth() call, so tests can check that sign-in never reuses a client.
  const authClients = [];
  const authApi = {
    signInWithPassword: vi.fn(async () => ({
      data: null,
      error: { status: 400, code: 'invalid_credentials' },
    })),
    signUp: vi.fn(async () => ({ data: null, error: { status: 500 } })),
    refreshSession: vi.fn(async () => ({ data: { session: null }, error: { status: 400 } })),
  };

  return {
    anon: {
      ...dbClient('anon'),
      auth: {
        getUser: vi.fn(async (token) =>
          TOKENS[token]
            ? { data: { user: TOKENS[token] }, error: null }
            : { data: { user: null }, error: { status: 401 } },
        ),
      },
    },
    auth: vi.fn(() => {
      const client = { auth: authApi };
      authClients.push(client);
      return client;
    }),
    forToken: vi.fn((token) => dbClient(`user:${token}`)),
    admin: () => null,

    // test controls
    on(table, handler) {
      handlers[table] = handler;
      return this;
    },
    queries,
    authApi,
    authClients,
    last(table) {
      return queries.filter((query) => query.table === table).at(-1);
    },
  };
}

export function createTestApp(configOverrides = {}) {
  const supabase = createFakeSupabase();
  const config = {
    corsOrigins: ['https://app.example.com', 'https://app-*.example.dev'],
    demoEmail: '',
    demoPassword: '',
    rateLimit: { enabled: false },
    ...configOverrides,
  };
  return { app: createApp({ config, supabase }), supabase, config };
}

export const movieRow = (overrides = {}) => ({
  id: 1,
  title: 'The Shawshank Redemption',
  overview: 'Two imprisoned men bond over a number of years.',
  poster_url: 'https://m.media-amazon.com/images/M/abc@._V1_UX67_CR0,0,67,98_AL_.jpg',
  certificate: 'A',
  runtime: '142 min',
  imdb_rating: 9.3,
  meta_score: 80,
  no_of_votes: 2343110,
  gross: '28,341,469',
  release_date: 1994,
  avg_rating: null,
  ...overrides,
});

export const reviewRow = (overrides = {}) => ({
  id: 10,
  user_id: ALICE.id,
  movie_id: 1,
  rating: 5,
  comment: 'Great',
  created_at: '2026-01-01T00:00:00+00:00',
  updated_at: null,
  user_profiles: { username: 'alice' },
  ...overrides,
});
