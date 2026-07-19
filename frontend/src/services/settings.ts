export const settingsService = {
  async getAll(): Promise<Record<string, string>> {
    const res = await fetch('/api/settings');
    return res.json();
  },

  async update(data: Record<string, string>): Promise<{ updated: string[]; rejected: string[] }> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
};
