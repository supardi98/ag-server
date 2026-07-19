export interface Session {
  id: string;
  title: string;
  type: string;
  description: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl: string;
}

export const sessionsService = {
  async getSessions(): Promise<Session[]> {
    const res = await fetch('/api/sessions');
    if (!res.ok) return [];
    return res.json();
  },

  async createSession(workspacePath: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspacePath }),
    });
    return res.json();
  },
};
