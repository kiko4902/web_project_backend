import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createTestApp, ALICE } from './helpers.mjs';

const supabaseSession = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_at: 1900000000,
  // fields the API must not pass on
  provider_token: 'should-not-leak',
  user: { id: ALICE.id, app_metadata: { provider: 'email' } },
};

const signedIn = { data: { user: ALICE, session: supabaseSession }, error: null };

const withProfile = (supabase, username = 'alice') =>
  supabase.on('user_profiles', () => ({ data: { username }, error: null }));

describe('POST /auth/login', () => {
  it('returns the user and a trimmed session', async () => {
    const { app, supabase } = createTestApp();
    withProfile(supabase);
    supabase.authApi.signInWithPassword.mockResolvedValueOnce(signedIn);

    const res = await request(app)
      .post('/auth/login')
      .send({ email: '  Alice@Example.com ', password: 'secret1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: ALICE.id, email: ALICE.email, username: 'alice' },
      session: { access_token: 'access', refresh_token: 'refresh', expires_at: 1900000000 },
    });
    expect(supabase.authApi.signInWithPassword).toHaveBeenCalledWith({
      email: 'alice@example.com',
      password: 'secret1',
    });
  });

  it('signs in on a throwaway client, never the shared one', async () => {
    const { app, supabase } = createTestApp();
    withProfile(supabase);
    supabase.authApi.signInWithPassword.mockResolvedValue(signedIn);

    await request(app).post('/auth/login').send({ email: ALICE.email, password: 'secret1' });
    await request(app).post('/auth/login').send({ email: ALICE.email, password: 'secret1' });

    expect(supabase.auth).toHaveBeenCalledTimes(2);
    expect(supabase.authClients[0]).not.toBe(supabase.authClients[1]);
    // the shared client has no way to start a session at all
    expect(supabase.anon.auth).not.toHaveProperty('signInWithPassword');
  });

  it('answers 401 with a generic message for wrong credentials', async () => {
    const { app } = createTestApp();

    const res = await request(app)
      .post('/auth/login')
      .send({ email: ALICE.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it.each([
    ['a missing password', { email: ALICE.email }],
    ['a malformed email', { email: 'not-an-email', password: 'secret1' }],
    ['a non-string email', { email: { $ne: null }, password: 'secret1' }],
  ])('rejects %s without calling Supabase', async (_name, body) => {
    const { app, supabase } = createTestApp();

    const res = await request(app).post('/auth/login').send(body);

    expect(res.status).toBe(400);
    expect(supabase.auth).not.toHaveBeenCalled();
  });
});

describe('POST /auth/register', () => {
  it('creates the account and passes the username to the profile trigger', async () => {
    const { app, supabase } = createTestApp();
    // availability check finds nothing; the lookup after sign-up finds the new profile
    let lookups = 0;
    supabase.on('user_profiles', () =>
      lookups++ === 0 ? { data: null, error: null } : { data: { username: 'alice' }, error: null },
    );
    supabase.authApi.signUp.mockResolvedValueOnce(signedIn);

    const res = await request(app)
      .post('/auth/register')
      .send({ email: ALICE.email, password: 'secret1', username: 'alice' });

    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('alice');
    expect(res.body.session.access_token).toBe('access');
    expect(supabase.authApi.signUp).toHaveBeenCalledWith({
      email: ALICE.email,
      password: 'secret1',
      options: { data: { username: 'alice' } },
    });
  });

  it('answers 409 when the username is taken, before creating the account', async () => {
    const { app, supabase } = createTestApp();
    supabase.on('user_profiles', () => ({ data: { user_id: 'someone' }, error: null }));

    const res = await request(app)
      .post('/auth/register')
      .send({ email: ALICE.email, password: 'secret1', username: 'alice' });

    expect(res.status).toBe(409);
    expect(supabase.authApi.signUp).not.toHaveBeenCalled();
  });

  it('answers 409 when the email is already registered', async () => {
    const { app, supabase } = createTestApp();
    supabase.authApi.signUp.mockResolvedValueOnce({
      data: null,
      error: { status: 422, code: 'user_already_exists' },
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: ALICE.email, password: 'secret1' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'An account with this email already exists' });
  });

  it('reports that confirmation is pending when Supabase returns no session', async () => {
    const { app, supabase } = createTestApp();
    supabase.authApi.signUp.mockResolvedValueOnce({
      data: { user: ALICE, session: null },
      error: null,
    });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: ALICE.email, password: 'secret1' });

    expect(res.status).toBe(201);
    expect(res.body.session).toBeNull();
    expect(res.body.message).toMatch(/confirm/i);
  });

  it.each([
    ['a password under 6 characters', { email: ALICE.email, password: '12345' }],
    ['a malformed email', { email: 'nope', password: 'secret1' }],
    ['an invalid username', { email: ALICE.email, password: 'secret1', username: 'a b' }],
  ])('rejects %s', async (_name, body) => {
    const { app, supabase } = createTestApp();

    const res = await request(app).post('/auth/register').send(body);

    expect(res.status).toBe(400);
    expect(supabase.authApi.signUp).not.toHaveBeenCalled();
  });
});

describe('POST /auth/refresh', () => {
  it('exchanges a refresh token for a new session', async () => {
    const { app, supabase } = createTestApp();
    withProfile(supabase);
    supabase.authApi.refreshSession.mockResolvedValueOnce(signedIn);

    const res = await request(app).post('/auth/refresh').send({ refresh_token: 'refresh' });

    expect(res.status).toBe(200);
    expect(res.body.session.access_token).toBe('access');
    expect(supabase.authApi.refreshSession).toHaveBeenCalledWith({ refresh_token: 'refresh' });
  });

  it('answers 401 for a refresh token that is no longer valid', async () => {
    const { app } = createTestApp();

    const res = await request(app).post('/auth/refresh').send({ refresh_token: 'revoked' });

    expect(res.status).toBe(401);
  });

  it('requires a refresh token', async () => {
    const { app } = createTestApp();
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/demo', () => {
  it('is unavailable when no demo account is configured', async () => {
    const { app, supabase } = createTestApp();

    const res = await request(app).post('/auth/demo');

    expect(res.status).toBe(404);
    expect(supabase.auth).not.toHaveBeenCalled();
  });

  it('signs in with the credentials from the server environment', async () => {
    const { app, supabase } = createTestApp({
      demoEmail: 'demo@example.com',
      demoPassword: 'from-env',
    });
    withProfile(supabase, 'demo');
    supabase.authApi.signInWithPassword.mockResolvedValueOnce(signedIn);

    const res = await request(app).post('/auth/demo').send({ email: 'x@y.z', password: 'ignored' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('demo');
    expect(supabase.authApi.signInWithPassword).toHaveBeenCalledWith({
      email: 'demo@example.com',
      password: 'from-env',
    });
    expect(JSON.stringify(res.body)).not.toContain('from-env');
  });
});
