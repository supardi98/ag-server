import { dbService } from './db.js';
import CDP from 'chrome-remote-interface';
import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface CdpSession {
  id: string;
  title: string;
  type: string;
  description: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl: string;
}

export interface Snapshot {
  html: string;
  css: string;
  agentRunning: boolean;
  hash?: string;
  timestamp?: string;
}

const CAPTURE_SCRIPT = `
(async () => {
  let container =
    document.querySelector('.scrollbar-hide[class*="overflow-y-auto"]') ||
    document.querySelector('[data-testid="conversation-view"]') ||
    document.getElementById('conversation') ||
    document.getElementById('chat') ||
    document.getElementById('cascade');

  if (!container || container.clientHeight === 0) {
    const inputBox = document.getElementById('antigravity.agentSidePanelInputBox');
    if (inputBox) {
      let newSessionRoot = inputBox;
      for (let i = 0; i < 10; i++) {
        if (!newSessionRoot.parentElement) break;
        newSessionRoot = newSessionRoot.parentElement;
        if ((newSessionRoot.className || '').includes('animate-fade-in')) break;
      }
      container = newSessionRoot;
    }
  }

  if (!container) return { html: '', css: '', agentRunning: false };

  const stopBtn =
    document.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]') ||
    document.querySelector('button svg.lucide-square')?.closest('button');
  const agentRunning = !!(stopBtn && stopBtn.offsetParent !== null);

  const clone = container.cloneNode(true);
  
  // Clean up unwanted elements (like the input area itself if we're not on new session)
  const isNewSession = !document.querySelector('.scrollbar-hide[class*="overflow-y-auto"]');
  if (!isNewSession) {
    clone.querySelectorAll('[contenteditable="true"], [data-lexical-editor], [role="textbox"], form').forEach(el => {
      let target = el;
      while (target.parentElement && target.parentElement !== clone) {
        target = target.parentElement;
      }
      target.remove();
    });
  }

  let html = clone.innerHTML;
  html = html.replace(/class="([^"]*)"/g, (match, classes) => {
    if (!classes.includes('[object Object]')) return match;
    const cleaned = classes.replace(/\\[object Object\\]/g, '').replace(/\\s+/g, ' ').trim();
    return 'class="' + cleaned + '"';
  });

  let css = '';
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = document.body ? getComputedStyle(document.body) : null;
  const themeRules = [];
  const seen = new Set();
  for (const source of [rootStyle, bodyStyle]) {
    if (!source) continue;
    for (const name of source) {
      if (name.startsWith('--') && !seen.has(name)) {
        const val = source.getPropertyValue(name).trim();
        if (val) {
          themeRules.push(name + ':' + val);
          seen.add(name);
        }
      }
    }
  }
  if (themeRules.length > 0) {
    css = ':root{' + themeRules.join(';') + '}\\n' + css;
  }

  return { html, css, agentRunning };
})()
`;

class CdpPollingService extends EventEmitter {
  private client: any = null;
  private timer: NodeJS.Timeout | null = null;
  private lastHash: string | null = null;
  private cachedSnapshot: Snapshot | null = null;

  getCdpPort(): string {
    return dbService.getSetting('antigravity_port') || '9000';
  }

  getCdpUrl(): string {
    return `http://127.0.0.1:${this.getCdpPort()}`;
  }

  async getSessions(): Promise<CdpSession[]> {
    try {
      const res = await fetch(`${this.getCdpUrl()}/json/list`);
      if (!res.ok) return [];
      const list = (await res.json()) as CdpSession[];
      return list.filter((item) => item.type === 'page');
    } catch {
      return [];
    }
  }

  async createSession(workspacePath: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
    try {
      const active = await this.getSessions();
      let targetUrl = '';
      if (active.length > 0 && active[0].devtoolsFrontendUrl) {
        const originalUrl = (active[0] as any).url || '';
        if (originalUrl) {
          const parsed = new URL(originalUrl);
          targetUrl = `${parsed.protocol}//${parsed.host}/c/new`;
        }
      }
      if (!targetUrl) {
        targetUrl = 'https://127.0.0.1:41141/c/new';
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
  }

  private hashString(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  private async captureSnapshot(): Promise<Snapshot | null> {
    if (!this.client) return null;
    try {
      const { result, exceptionDetails } = await this.client.Runtime.evaluate({
        expression: CAPTURE_SCRIPT,
        awaitPromise: true,
        returnByValue: true,
      });
      if (exceptionDetails || !result.value) {
        return null;
      }
      return result.value as Snapshot;
    } catch (e) {
      return null;
    }
  }

  private async poll() {
    if (!this.client) {
      // Try to connect
      try {
        const sessions = await this.getSessions();
        if (sessions.length > 0) {
          this.client = await CDP({ port: parseInt(this.getCdpPort()), target: sessions[0].id });
          await this.client.Runtime.enable();
          this.client.on('disconnect', () => {
            this.client = null;
          });
        }
      } catch (e) {
        // Ignore
      }
    }

    if (this.client) {
      const snapshot = await this.captureSnapshot();
      if (snapshot) {
        const hash = this.hashString(snapshot.html + snapshot.css);
        if (hash !== this.lastHash) {
          snapshot.hash = hash;
          snapshot.timestamp = new Date().toISOString();
          this.cachedSnapshot = snapshot;
          this.lastHash = hash;
          this.emit('snapshot', snapshot);
        } else if (snapshot.agentRunning !== this.cachedSnapshot?.agentRunning) {
          if (this.cachedSnapshot) {
            this.cachedSnapshot.agentRunning = snapshot.agentRunning;
          }
          this.emit('status', { agentRunning: snapshot.agentRunning });
        }
      }
    }

    this.timer = setTimeout(() => this.poll(), 500);
  }

  startPolling() {
    if (!this.timer) {
      this.poll();
    }
  }

  async uploadImage(base64: string, mimetype: string, filename: string): Promise<{ ok: boolean; reason?: string }> {
    if (!this.client) return { ok: false, reason: 'no_cdp_client' };
    
    // Construct the payload as valid JS code
    const safeBase64 = JSON.stringify(base64);
    const safeMimetype = JSON.stringify(mimetype);
    const safeFileName = JSON.stringify(filename);
    
    const expression = `
      (async () => {
        const base64 = ${safeBase64};
        const mimetype = ${safeMimetype};
        const fileName = ${safeFileName};

        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const file = new File([bytes], fileName, { type: mimetype });

        const editorCandidates = document.querySelectorAll(
          '[data-lexical-editor="true"], [contenteditable="true"][role="textbox"], [contenteditable="true"]'
        );
        let editor = null;
        for (const el of editorCandidates) {
          if (el.offsetParent !== null) editor = el;
        }
        if (!editor) return { ok: false, reason: 'no_editor' };

        const dt = new DataTransfer();
        dt.items.add(file);

        editor.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
        editor.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
        editor.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));

        return { ok: true };
      })()
    `;

    try {
      const { result, exceptionDetails } = await this.client.Runtime.evaluate({
        expression,
        awaitPromise: true,
        returnByValue: true,
      });

      if (exceptionDetails) {
        return { ok: false, reason: exceptionDetails.exception?.description || 'evaluation_error' };
      }
      return result.value;
    } catch (err: any) {
      return { ok: false, reason: err.message };
    }
  }

  getCachedSnapshot(): Snapshot | null {
    return this.cachedSnapshot;
  }
}

export const cdpService = new CdpPollingService();
cdpService.startPolling();
