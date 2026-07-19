import type { AgentStatus } from '../types/agent';

export const agentService = {
  async status(): Promise<AgentStatus> {
    const res = await fetch('/api/agent/status');
    return res.json();
  },

  async start(): Promise<{ ok: boolean; message: string }> {
    const res = await fetch('/api/agent/start', { method: 'POST' });
    return res.json();
  },

  async stop(): Promise<{ ok: boolean; message: string }> {
    const res = await fetch('/api/agent/stop', { method: 'POST' });
    return res.json();
  },

  streamLogs(onMessage: (line: string) => void, onStatusChange?: (status: AgentStatus) => void, onError?: () => void): EventSource {
    const es = new EventSource('/api/agent/logs');
    es.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        onMessage(event.data);
      }
    };
    if (onStatusChange) {
      es.addEventListener('status-change', (event: MessageEvent) => {
        try {
          onStatusChange(JSON.parse(event.data));
        } catch (e) {
          console.error('Failed to parse status change', e);
        }
      });
    }
    if (onError) es.onerror = onError;
    return es;
  },
};
