export interface AuthStatus {
  authenticated: boolean;
  authEnabled: boolean;
}

export const authService = {
  async me(): Promise<AuthStatus> {
    const res = await fetch('/api/auth/me');
    return res.json();
  },

  async login(password: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.error };
    return { success: true };
  },

  async logout(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' });
  },
};
