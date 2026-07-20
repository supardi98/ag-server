import { ref, computed } from 'vue';

export interface Account {
  id: string;
  email: string;
  isActive: boolean;
  isDisabled?: boolean;
  last_used?: number;
  custom_label?: string;
  quota?: any;
}

// Global state
const accounts = ref<Account[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

export function useAccountStore() {
  const currentAccount = computed(() => accounts.value.find((a) => a.isActive) || null);

  const fetchAccounts = async () => {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      accounts.value = data.accounts || [];
    } catch (err: any) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  };

  const addAccount = async (email: string, refreshToken: string, last_used?: number, quota?: any) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, refreshToken, last_used, quota }),
      });
      if (!res.ok) throw new Error('Failed to add account');
      await fetchAccounts();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const switchAccount = async (accountId: string) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch('/api/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) throw new Error('Failed to switch account');
      await fetchAccounts();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const deleteAccount = async (accountId: string) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete account');
      await fetchAccounts();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const refreshQuota = async (accountId: string) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`/api/accounts/${accountId}/refresh-quota`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to refresh quota');
      await fetchAccounts(); // Refresh the list
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const toggleAccount = async (accountId: string, disabled: boolean) => {
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`/api/accounts/${accountId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle account');
      await fetchAccounts();
    } catch (err: any) {
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  return {
    accounts,
    currentAccount,
    loading,
    error,
    fetchAccounts,
    addAccount,
    switchAccount,
    deleteAccount,
    refreshQuota,
    toggleAccount,
  };
}
