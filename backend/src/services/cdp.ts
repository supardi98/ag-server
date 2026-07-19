import { dbService } from './db.js';

export interface CdpSession {
  id: string;
  title: string;
  type: string;
  description: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl: string;
}

export const cdpService = {
  getCdpUrl(): string {
    const port = dbService.getSetting('antigravity_port') || '9000';
    return `http://127.0.0.1:${port}`;
  },

  async getSessions(): Promise<CdpSession[]> {
    try {
      const res = await fetch(`${this.getCdpUrl()}/json/list`);
      if (!res.ok) return [];
      const list = (await res.json()) as CdpSession[];
      // Filter only page targets which usually represent active session workspaces/conversations
      return list.filter((item) => item.type === 'page');
    } catch {
      return [];
    }
  },

  async createSession(workspacePath: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
    try {
      // For Antigravity 2.0+, opening a new session is done by pointing the tab to the correct local UI URL.
      // E.g. https://127.0.0.1:41141/c/new?workspace=/path/to/project
      // We first query the active sessions to get the domain/port of the local hub UI
      const active = await this.getSessions();
      let targetUrl = '';
      if (active.length > 0 && active[0].devtoolsFrontendUrl) {
        // Parse the URL from the active session's URL/devtools url if available
        const originalUrl = (active[0] as any).url || '';
        if (originalUrl) {
          const parsed = new URL(originalUrl);
          targetUrl = `${parsed.protocol}//${parsed.host}/c/new`;
        }
      }
      if (!targetUrl) {
        targetUrl = 'https://127.0.0.1:41141/c/new'; // fallback
      }
      
      const query = workspacePath ? `?workspace=${encodeURIComponent(workspacePath)}` : '';
      const cdpTargetUrl = `${targetUrl}${query}`;
      
      const res = await fetch(`${this.getCdpUrl()}/json/new?${encodeURIComponent(cdpTargetUrl)}`, { method: 'PUT' });
      if (!res.ok) {
        return { ok: false, error: `CDP returned status ${res.status}` };
      }
      const data = (await res.json()) as CdpSession;
      return { ok: true, sessionId: data.id };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to connect to CDP' };
    }
  },
};
