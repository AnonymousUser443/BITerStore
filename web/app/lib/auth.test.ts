import { beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyBitLoginChallenge, getBitLoginRegistrationToken, startBitLogin, type BitLoginChallenge } from './bit-login';
import { h5ApiRequest, loginWithCampusCookie, restoreH5Session, updateH5Profile } from './h5-auth';

const challenge: BitLoginChallenge = {
  challenge_id: 'challenge-1', access_token: 'challenge-secret', status: 'authenticated',
  requested_services: ['jwb'], ready_services: ['jwb'], expires_in: 300,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Golden H5 authentication', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

  it('starts authentication through the direct campus CAS service', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(challenge));

    await expect(startBitLogin('student', 'password')).resolves.toEqual(challenge);

    expect(fetch).toHaveBeenCalledWith('https://login.example.test/api/auth/start', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ username: 'student', password: 'password', services: ['jwb'], wait_seconds: 1 }),
    }));
  });

  it('requests a biterstore registration token and destroys the challenge', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ registration_token: 'registration-jwt' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'deleted' }));

    await expect(getBitLoginRegistrationToken(challenge)).resolves.toBe('registration-jwt');
    await destroyBitLoginChallenge(challenge);

    expect(fetch).toHaveBeenNthCalledWith(1, 'https://login.example.test/api/auth/challenge-1/registration-token', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Challenge-Token': 'challenge-secret' }),
      body: JSON.stringify({ audience: 'biterstore' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, 'https://login.example.test/api/auth/challenge-1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('exchanges the registration token without exposing session tokens', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      expiresIn: 900, user: { id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' }
    }));

    const result = await loginWithCampusCookie('registration-jwt');
    expect(result.user.id).toBe('student-1');
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/campus', expect.objectContaining({
      credentials: 'include',
      body: JSON.stringify({ registrationToken: 'registration-jwt', platform: 'h5', sessionTransport: 'cookie' }),
    }));
  });

  it('refreshes an expired access cookie once before restoring the profile', async () => {
    const profile = { id: 'student-1', nickname: 'BITer1120230000', avatarUrl: null, campus: null, bio: '', role: 'USER', status: 'ACTIVE', campusStatus: 'VERIFIED', createdAt: '2026-08-28', wechatBound: false };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ expiresIn: 900, user: { id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' } }))
      .mockResolvedValueOnce(jsonResponse(profile));

    await expect(restoreH5Session()).resolves.toMatchObject({ id: 'student-1', nickname: 'BITer1120230000' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/v1/me', expect.objectContaining({ credentials: 'include' }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/auth/refresh', expect.objectContaining({
      body: JSON.stringify({ sessionTransport: 'cookie' })
    }));
  });

  it('shares one refresh across concurrent requests when the access cookie expires', async () => {
    const profile = { id: 'student-1', nickname: 'BITer1120230000' };
    let profileRequests = 0;
    let refreshRequests = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshRequests += 1;
        await Promise.resolve();
        return jsonResponse({ expiresIn: 900, user: { id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' } });
      }
      profileRequests += 1;
      return profileRequests <= 2 ? jsonResponse({ message: 'expired' }, 401) : jsonResponse(profile);
    });

    await expect(Promise.all([h5ApiRequest('/me'), h5ApiRequest('/me')])).resolves.toEqual([profile, profile]);
    expect(refreshRequests).toBe(1);
    expect(profileRequests).toBe(4);
  });

  it('updates nickname, avatar, campus and bio through the real profile API', async () => {
    const input = { nickname: 'New BITer', avatarUrl: 'data:image/jpeg;base64,YQ==', campus: '良乡', bio: 'Hello' };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ id: 'student-1', ...input }));

    await updateH5Profile(input);

    expect(fetch).toHaveBeenCalledWith('/api/v1/me', expect.objectContaining({
      method: 'PATCH', credentials: 'include', body: JSON.stringify(input)
    }));
  });

  it('does not declare JSON content for a bodyless DELETE request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ deleted: true }));

    await h5ApiRequest('/listings/listing-1', { method: 'DELETE' });

    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });
});
