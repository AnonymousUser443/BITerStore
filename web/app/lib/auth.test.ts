import { beforeEach, describe, expect, it, vi } from 'vitest';
import { destroyBitLoginChallenge, getBitLoginRegistrationToken, type BitLoginChallenge } from './bit-login';
import { loginWithCampusCookie, restoreH5Session } from './h5-auth';

const challenge: BitLoginChallenge = {
  challenge_id: 'challenge-1', access_token: 'challenge-secret', status: 'authenticated',
  requested_services: ['webvpn'], ready_services: ['webvpn'], expires_in: 300,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('Golden H5 authentication', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

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
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ expiresIn: 900, user: { id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' } }))
      .mockResolvedValueOnce(jsonResponse({ id: 'student-1', role: 'USER', campusStatus: 'VERIFIED' }));

    await expect(restoreH5Session()).resolves.toMatchObject({ id: 'student-1', campusStatus: 'VERIFIED' });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/v1/auth/refresh', expect.objectContaining({
      body: JSON.stringify({ sessionTransport: 'cookie' })
    }));
  });
});
