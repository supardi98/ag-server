<template>
  <div class="accounts-manager">
    <!-- Top Toolbar -->
    <header class="toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          <SearchIcon size="16" class="text-muted" />
          <input type="text" v-model="searchQuery" placeholder="Search email..." class="search-input" />
        </div>
        <div class="view-toggles">
          <button class="icon-btn" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'"><ListIcon size="16" /></button>
          <button class="icon-btn" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'"><GridIcon size="16" /></button>
        </div>
        <div class="filters">
          <button class="filter-badge" :class="{ active: activeFilter === 'ALL' }" @click="activeFilter = 'ALL'">
            All <span class="count">{{ accounts.length }}</span>
          </button>
          <button class="filter-badge text-indigo" :class="{ active: activeFilter === 'PRO' }" @click="activeFilter = 'PRO'">
            PRO <span class="count">{{ counts.pro }}</span>
          </button>
          <button class="filter-badge text-purple" :class="{ active: activeFilter === 'ULTRA' }" @click="activeFilter = 'ULTRA'">
            ULTRA <span class="count">{{ counts.ultra }}</span>
          </button>
          <button class="filter-badge text-gray" :class="{ active: activeFilter === 'FREE' }" @click="activeFilter = 'FREE'">
            FREE <span class="count">{{ counts.free }}</span>
          </button>
        </div>
      </div>
      
      <div class="toolbar-right">
        <button class="toolbar-btn icon-only" @click="showAddModal = true" title="Add Account">
          <PlusIcon size="16" />
        </button>
        <template v-if="selectedAccountIds.length > 0">
          <button class="btn-batch btn-batch-delete" @click="handleBatchDelete">
            <Trash2Icon size="16" /> Delete ({{ selectedAccountIds.length }})
          </button>
          <button class="btn-batch btn-batch-disable" @click="handleBatchDisable">
            <ToggleLeftIcon size="16" /> Disable ({{ selectedAccountIds.length }})
          </button>
          <button class="btn-batch btn-batch-enable" @click="handleBatchEnable">
            <ToggleLeftIcon size="16" /> Enable ({{ selectedAccountIds.length }})
          </button>
          <button class="btn-batch btn-batch-refresh" @click="handleBatchRefresh">
            <RefreshCwIcon size="16" /> Refresh ({{ selectedAccountIds.length }})
          </button>
          <button class="btn-batch btn-batch-warmup" @click="handleBatchWarmup">
            <SparklesIcon size="16" /> Warmup ({{ selectedAccountIds.length }})
          </button>
        </template>
        <template v-else>
          <button class="toolbar-btn text-blue" @click="handleRefreshAll">
            <RefreshCwIcon size="14" :class="{ 'animate-spin': loading }" /> Refresh All
          </button>
          <button class="toolbar-btn bg-orange text-white">
            <SparklesIcon size="14" /> One-click Warmup
          </button>
        </template>
        <div style="display: flex; gap: 4px;">
          <button class="toolbar-btn ghost" @click="fileInputRef?.click()">
            <UploadIcon size="14" /> Import
          </button>
          <button class="toolbar-btn ghost" @click="handleExportAll">
            <DownloadIcon size="14" /> Export
          </button>
        </div>
        <input 
          type="file" 
          ref="fileInputRef" 
          accept=".json,application/json" 
          style="display: none" 
          @change="handleFileChange" 
        />
      </div>
    </header>

    <!-- Table Content -->
    <div class="table-container" v-if="viewMode === 'list'">
      <table class="accounts-table">
        <thead>
          <tr>
            <th class="col-checkbox"><input type="checkbox" class="ag-checkbox" v-model="selectAll" /></th>
            <th class="col-email">EMAIL</th>
            <th class="col-quota">MODEL QUOTA</th>
            <th class="col-last-used">LAST USED</th>
            <th class="col-actions">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          <!-- Empty State -->
          <tr v-if="!loading && filteredAccounts.length === 0">
            <td colspan="5">
              <div class="empty-state">
                <UsersIcon size="48" class="text-muted opacity-50" />
                <p>No accounts found matching your filters.</p>
              </div>
            </td>
          </tr>

          <!-- Account Rows -->
          <tr v-for="account in filteredAccounts" :key="account.id" class="account-row" :class="{ 'is-current': account.isActive, 'is-disabled': account.isDisabled }">
            <td class="col-checkbox">
              <input type="checkbox" class="ag-checkbox" :value="account.id" v-model="selectedAccountIds" />
            </td>
            
            <td class="col-email">
              <div class="email-cell">
                <GripVerticalIcon size="14" class="drag-handle text-muted" />
                <div class="email-content">
                  <span class="email-text" :class="{ 'opacity-50 line-through': account.isDisabled }">{{ account.email }}</span>
                  <span class="pro-badge tier-disabled" v-if="account.isDisabled">
                    <BanIcon size="10" /> Disabled
                  </span>
                  <span class="pro-badge" v-if="account.quota?.subscription_tier" :class="getTierClass(account.quota.subscription_tier)">
                    <DiamondIcon size="10" /> {{ formatSubscriptionTier(account.quota.subscription_tier) }}
                  </span>
                </div>
              </div>
            </td>

            <td class="col-quota">
              <div class="quota-grid" v-if="account.quota?.models?.length > 0">
                  <QuotaItem 
                  v-for="model in account.quota.models" 
                  :key="model.name"
                  :id="model.id"
                  :name="model.name" 
                  :icon="getModelIcon(model.name)" 
                  :time-left="formatTimeLeft(model.reset_time)" 
                  :percentage="model.percentage" 
                />
              </div>
              <div v-else class="text-muted text-xs opacity-50 p-2">
                No quota data available. Please click the green Refresh button in Actions.
              </div>
            </td>

            <td class="col-last-used">
              <div class="last-used-cell" v-if="account.last_used">
                <span class="date">{{ new Date(account.last_used * 1000).toLocaleDateString() }}</span>
                <span class="time">{{ new Date(account.last_used * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</span>
              </div>
              <div class="last-used-cell" v-else>
                <span class="date text-muted">Never</span>
              </div>
            </td>

            <td class="col-actions">
              <div class="actions-group">
                <button class="action-btn" title="Details"><InfoIcon size="14" /></button>
                <button class="action-btn" title="Fingerprint"><FingerprintIcon size="14" /></button>
                <button class="action-btn text-orange-500" title="Tag"><TagIcon size="14" /></button>
                <button class="action-btn text-blue-500" title="Switch" @click="handleSwitch(account.id)">
                  <ArrowRightLeftIcon size="14" />
                </button>
                <button class="action-btn text-green-500" title="Refresh Live Quota" @click="handleRefreshQuota(account.id)">
                  <RefreshCwIcon size="14" :class="{ 'animate-spin': refreshingId === account.id }" />
                </button>
                <button class="action-btn text-orange-500" title="Toggle Disable" @click="toggleAccount(account.id, !account.isDisabled)">
                  <ToggleLeftIcon size="14" />
                </button>
                <button class="action-btn text-indigo" title="Export Account" @click="handleExportSingle(account.id)">
                  <DownloadIcon size="14" />
                </button>
                <button class="action-btn text-red-500 hover-bg-red" title="Delete" @click="handleDeleteSingle(account)">
                  <Trash2Icon size="14" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Cards Content -->
    <div class="cards-container" v-else-if="viewMode === 'grid'">
      <div v-if="!loading && filteredAccounts.length === 0" class="empty-state">
        <UsersIcon size="48" class="text-muted opacity-50" />
        <p>No accounts found matching your filters.</p>
      </div>

      <div class="cards-grid">
        <div 
          v-for="account in filteredAccounts" 
          :key="'card-'+account.id" 
          class="account-card" 
          :class="{ 'is-current': account.isActive, 'is-disabled': account.isDisabled }"
        >
          <!-- Card Header -->
          <div class="card-header">
            <input type="checkbox" class="ag-checkbox" :value="account.id" v-model="selectedAccountIds" />
            <div class="card-header-info">
              <span class="email-text" :class="{ 'line-through opacity-50': account.isDisabled }">{{ account.email }}</span>
              <div class="card-badges-row">
                <div class="card-badges">
                  <span class="pro-badge tier-disabled" v-if="account.isDisabled">
                    <BanIcon size="10" /> Disabled
                  </span>
                  <span class="pro-badge" v-if="account.quota?.subscription_tier" :class="getTierClass(account.quota.subscription_tier)">
                    <DiamondIcon size="10" /> {{ formatSubscriptionTier(account.quota.subscription_tier) }}
                  </span>
                </div>
                <span class="last-used-text text-muted text-xs" v-if="account.last_used">
                  {{ new Date(account.last_used * 1000).toLocaleDateString() }}, {{ new Date(account.last_used * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Card Quota Grid -->
          <div class="card-body">
            <div class="card-quota-list" v-if="account.quota?.models?.length > 0">
              <QuotaItem 
                v-for="model in account.quota.models" 
                :key="'card-'+model.name"
                :id="model.id"
                :name="model.name" 
                :icon="getModelIcon(model.name)" 
                :time-left="formatTimeLeft(model.reset_time)" 
                :percentage="model.percentage" 
              />
            </div>
            <div v-else class="text-muted text-xs opacity-50 p-2 text-center">
              No quota data available. Please click the refresh button.
            </div>
          </div>

          <!-- Card Actions Footer -->
          <div class="card-footer">
            <div class="actions-group">
              <button class="action-btn" title="Details"><InfoIcon size="14" /></button>
              <button class="action-btn" title="Fingerprint"><FingerprintIcon size="14" /></button>
              <button class="action-btn text-orange-500" title="Tag"><TagIcon size="14" /></button>
              <button class="action-btn text-blue-500" title="Switch" @click="handleSwitch(account.id)">
                <ArrowRightLeftIcon size="14" />
              </button>
              <button class="action-btn text-green-500" title="Refresh Live Quota" @click="handleRefreshQuota(account.id)">
                <RefreshCwIcon size="14" :class="{ 'animate-spin': refreshingId === account.id }" />
              </button>
              <button class="action-btn text-orange-500" title="Toggle Disable" @click="toggleAccount(account.id, !account.isDisabled)">
                <ToggleLeftIcon size="14" />
              </button>
              <button class="action-btn text-indigo" title="Export Account" @click="handleExportSingle(account.id)">
                <DownloadIcon size="14" />
              </button>
              <button class="action-btn text-red-500 hover-bg-red" title="Delete" @click="handleDeleteSingle(account)">
                <Trash2Icon size="14" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Account Modal -->
    <AgModal v-model="showAddModal" title="Add New Account">
      <div class="modal-form">
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" v-model="newEmail" class="ag-input" placeholder="you@example.com" />
        </div>
        <div class="form-group">
          <label>Refresh Token</label>
          <input type="text" v-model="newRefreshToken" class="ag-input" placeholder="1//0e..." />
        </div>
      </div>
      <template #footer>
        <AgButton variant="secondary" @click="showAddModal = false">Cancel</AgButton>
        <AgButton variant="primary" @click="handleAdd" :disabled="isSubmitting || !newEmail || !newRefreshToken">
          Add Account
        </AgButton>
      </template>
    </AgModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAccountStore } from '../composables/useAccountStore';
import QuotaItem from '../components/QuotaItem.vue';
import AgToggle from '../components/AgToggle.vue';
import AgModal from '../components/AgModal.vue';
import AgButton from '../components/AgButton.vue';
import { 
  Plus as PlusIcon, 
  Trash2 as Trash2Icon, 
  RefreshCw as RefreshCwIcon,
  ToggleLeft as ToggleLeftIcon,
  ToggleRight as ToggleRightIcon,
  Info as InfoIcon,
  Fingerprint as FingerprintIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  ArrowRightLeft as ArrowRightLeftIcon,
  Sparkles as SparklesIcon,
  Tag as TagIcon,
  Search as SearchIcon,
  List as ListIcon,
  Grid as GridIcon,
  Users as UsersIcon,
  GripVertical as GripVerticalIcon,
  Diamond as DiamondIcon,
  Bot as BotIcon,
  Cpu as CpuIcon,
  Zap as ZapIcon,
  Ban as BanIcon
} from 'lucide-vue-next';
import { useStorage } from '@vueuse/core';

const { accounts, loading, fetchAccounts, addAccount, switchAccount, deleteAccount, refreshQuota, toggleAccount, exportAccounts } = useAccountStore();

const viewMode = useStorage<'list' | 'grid'>('ag-view-mode', 'grid');
const showAddModal = ref(false);
const newEmail = ref('');
const newRefreshToken = ref('');
const isSubmitting = ref(false);
const refreshingId = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const selectedAccountIds = ref<string[]>([]);
const searchQuery = ref('');
const activeFilter = ref('ALL');

const counts = computed(() => {
  let pro = 0, ultra = 0, free = 0;
  for (const acc of accounts.value) {
    const tier = formatSubscriptionTier(acc.quota?.subscription_tier);
    if (tier === 'ULTRA') ultra++;
    else if (tier === 'PRO') pro++;
    else free++;
  }
  return { pro, ultra, free };
});

const filteredAccounts = computed(() => {
  let list = accounts.value;
  
  if (activeFilter.value !== 'ALL') {
    list = list.filter(a => formatSubscriptionTier(a.quota?.subscription_tier) === activeFilter.value);
  }
  
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(a => a.email.toLowerCase().includes(q));
  }
  
  return list;
});

const selectAll = computed({
  get: () => filteredAccounts.value.length > 0 && selectedAccountIds.value.length === filteredAccounts.value.length,
  set: (val) => {
    if (val) {
      selectedAccountIds.value = filteredAccounts.value.map(a => a.id);
    } else {
      selectedAccountIds.value = [];
    }
  }
});

const handleBatchDelete = async () => {
  if (!confirm(`Are you sure you want to delete ${selectedAccountIds.value.length} accounts?`)) return;
  for (const id of selectedAccountIds.value) {
    await deleteAccount(id);
  }
  selectedAccountIds.value = [];
};

const handleBatchDisable = async () => {
  for (const id of selectedAccountIds.value) {
    await toggleAccount(id, true);
  }
  selectedAccountIds.value = [];
};

const handleBatchEnable = async () => {
  for (const id of selectedAccountIds.value) {
    await toggleAccount(id, false);
  }
  selectedAccountIds.value = [];
};

const handleBatchRefresh = async () => {
  const idsToRefresh = [...selectedAccountIds.value];
  selectedAccountIds.value = [];
  for (const id of idsToRefresh) {
    await handleRefreshQuota(id);
  }
};

const handleExportAll = () => {
  exportAccounts();
};

const handleExportSingle = (id: string) => {
  exportAccounts([id]);
};

const handleBatchWarmup = async () => {
  const idsToWarmup = [...selectedAccountIds.value];
  selectedAccountIds.value = [];
  alert(`Warmup triggered for ${idsToWarmup.length} accounts. (Backend logic pending)`);
};

onMounted(() => {
  fetchAccounts();
});

const handleAdd = async () => {
  if (!newEmail.value.trim() || !newRefreshToken.value.trim()) return;
  isSubmitting.value = true;
  try {
    await addAccount(newEmail.value.trim(), newRefreshToken.value.trim());
    showAddModal.value = false;
    newEmail.value = '';
    newRefreshToken.value = '';
  } catch (err) {
    console.error('Failed to add account', err);
  } finally {
    isSubmitting.value = false;
  }
};

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  isSubmitting.value = true;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Invalid format');
    const validEntries = data.map((item: any) => ({
      ...item,
      token: item.refresh_token || item.refreshToken || (item.token_data ? item.token_data.refresh_token : null)
    })).filter((item: any) => item.token && item.token.startsWith('1//'));
    
    // Add all accounts sequentially
    for (const entry of validEntries) {
      await addAccount(entry.email || 'imported@account', entry.token, entry.last_used, entry.quota);
    }

    // Automatically trigger a background quota fetch for the imported accounts
    // We don't await this so the UI unblocks immediately and the spinners show up
    const importedEmails = validEntries.map(e => e.email);
    const importedAccounts = accounts.value.filter(a => importedEmails.includes(a.email));
    
    importedAccounts.forEach(acc => {
      // Set the refreshing UI state manually since we are not awaiting it here
      refreshingId.value = acc.id;
      refreshQuota(acc.id).catch(err => console.error('Auto-refresh failed:', err)).finally(() => {
        if (refreshingId.value === acc.id) refreshingId.value = null;
      });
    });
  } catch (err) {
    console.error('Failed to import JSON', err);
  } finally {
    if (target) target.value = '';
    isSubmitting.value = false;
  }
};

const formatSubscriptionTier = (tier: string) => {
  if (!tier) return '';
  const t = tier.toLowerCase();
  if (t.includes('ultra')) return 'ULTRA';
  if (t.includes('pro')) return 'PRO';
  return 'FREE';
};

const getTierClass = (tier: string) => {
  if (!tier) return '';
  const t = tier.toLowerCase();
  if (t.includes('ultra')) return 'tier-ultra';
  if (t.includes('pro')) return 'tier-pro';
  return 'tier-free';
};

const getModelIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('agent') || n.includes('oss')) return BotIcon;
  if (n.includes('claude') || n.includes('reasoning') || n.includes('thinking')) return CpuIcon;
  if (n.includes('flash') || n.includes('lite')) return ZapIcon;
  return SparklesIcon;
};

const handleSwitch = async (id: string) => {
  await switchAccount(id);
};

const handleRefreshQuota = async (id: string) => {
  if (refreshingId.value) return;
  refreshingId.value = id;
  try {
    await refreshQuota(id);
  } catch (err) {
    console.error('Failed to refresh quota', err);
  } finally {
    refreshingId.value = null;
  }
};

const handleRefreshAll = async () => {
  for (const account of accounts.value) {
    if (!account.isDisabled) {
      await handleRefreshQuota(account.id);
    }
  }
};

const handleDeleteSingle = async (account: any) => {
  if (confirm(`Are you sure you want to delete ${account.email}?`)) {
    await deleteAccount(account.id);
  }
};

const formatTimeLeft = (resetTimeStr?: string) => {
  if (!resetTimeStr) return 'N/A';
  
  // Google API returns ISO strings like "2024-07-20T12:00:00Z"
  const resetDate = new Date(resetTimeStr);
  const resetMs = resetDate.getTime();
  if (isNaN(resetMs)) return resetTimeStr;
  
  const now = Date.now();
  let diffMs = resetMs - now;
  
  if (diffMs <= 0) {
    return '0h 0m';
  }
  
  const diffSecs = Math.floor(diffMs / 1000);
  const h = Math.floor(diffSecs / 3600);
  const m = Math.floor((diffSecs % 3600) / 60);
  return `${h}h ${m}m`;
};
</script>

<style scoped>
.accounts-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: transparent;
  color: var(--text-primary);
  font-family: var(--font-family);
  overflow: hidden;
}

/* Toolbar */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 6px 12px;
  border-radius: 8px;
  width: 220px;
}
.search-input {
  background: transparent;
  border: none;
  color: #fff;
  font-size: 13px;
  outline: none;
  width: 100%;
}

.view-toggles {
  display: flex;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 2px;
}
.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.icon-btn.active {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.filters {
  display: flex;
  gap: 4px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  padding: 2px;
}
.filter-badge {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.filter-badge.active { background: rgba(255, 255, 255, 0.1); color: #fff; }
.count {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.toolbar-btn:hover { background: rgba(255, 255, 255, 0.1); }
.toolbar-btn.icon-only { padding: 6px; }
.toolbar-btn.text-blue { background: #3b82f6; color: #fff; border-color: #3b82f6; }
.toolbar-btn.text-blue:hover { background: #2563eb; }
.toolbar-btn.bg-orange { background: #f97316; color: #fff; border-color: #f97316; }
.toolbar-btn.bg-orange:hover { background: #ea580c; }
.toolbar-btn.ghost { background: transparent; border-color: transparent; }
.toolbar-btn.ghost:hover { background: rgba(255, 255, 255, 0.05); }

.toggle-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.divider { width: 1px; height: 16px; background: rgba(255, 255, 255, 0.1); }

/* Table Content */
.table-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.accounts-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  text-align: left;
}

.accounts-table th {
  padding: 8px 12px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  z-index: 10;
}

.accounts-table td {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: top;
}

.account-row {
  transition: background 0.2s;
}
.account-row:hover {
  background: rgba(255, 255, 255, 0.02);
}

/* Columns */
.col-checkbox { width: 40px; text-align: center; }
.col-email { width: 300px; }
.col-quota { min-width: 400px; }
.col-last-used { width: 120px; }
.col-actions { width: 260px; text-align: right; }

/* Elements */
.ag-checkbox {
  appearance: none;
  width: 16px;
  height: 16px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.ag-checkbox:checked {
  background: #3b82f6;
  border-color: #3b82f6;
}

.email-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}
.email-content {
  display: flex;
  align-items: center;
  gap: 8px;
}
.email-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}
.pro-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
}
.pro-badge.tier-ultra {
  background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
  color: white;
}
.pro-badge.tier-pro {
  background: linear-gradient(135deg, #60a5fa 0%, #6366f1 100%);
  color: white;
}
.pro-badge.tier-free {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
}

.quota-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.last-used-cell {
  display: flex;
  flex-direction: column;
  font-family: monospace;
}
.last-used-cell .date {
  font-size: 12px;
  color: var(--text-secondary);
}
.last-used-cell .time {
  font-size: 10px;
  color: var(--text-muted);
}

/* Actions */
.actions-group {
  display: flex;
  gap: 8px;
  justify-content: center;
}

/* Cards Layout */
.cards-container {
  padding: 24px;
  overflow-y: auto;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.account-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: all 0.2s;
}

.account-card:hover {
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.account-card.is-disabled {
  opacity: 0.6;
}

.card-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.card-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-grow: 1;
}

.card-badges-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.card-badges {
  display: flex;
  gap: 8px;
  align-items: center;
}

.card-body {
  flex-grow: 1;
}

.card-quota-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-footer {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
  display: flex;
  justify-content: center;
}
.action-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

/* Modals / Forms */
.modal-form { display: flex; flex-direction: column; gap: 16px; padding: 16px 0; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 13px; color: var(--text-muted); }
.ag-input {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 10px 12px;
  color: #fff;
  font-family: inherit;
}
.ag-input:focus {
  outline: none;
  border-color: #3b82f6;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px;
  color: var(--text-muted);
}

/* Custom Checkbox */
.ag-checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s;
  margin: 0;
}
.ag-checkbox:hover {
  border-color: rgba(255, 255, 255, 0.4);
}
.ag-checkbox:checked {
  background: #3b82f6;
  border-color: #3b82f6;
}
.ag-checkbox:checked::after {
  content: '';
  position: absolute;
  width: 4px;
  height: 8px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
  margin-top: -2px;
}

/* Color Utilities */
.text-green-500 { color: #10b981 !important; }
.text-blue-500 { color: #3b82f6 !important; }
.text-red-500 { color: #ef4444 !important; }
.text-orange-500, .text-orange { color: #f97316 !important; }
.text-indigo { color: #6366f1 !important; }
.text-purple { color: #a855f7 !important; }
.text-gray { color: #9ca3af !important; }
.text-muted { color: var(--text-muted) !important; }

.text-xs { font-size: 11px !important; }
.text-sm { font-size: 12px !important; }

.line-through { text-decoration: line-through; }
.opacity-50 { opacity: 0.5; }

/* Batch Action Buttons */
.btn-batch {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  color: #fff;
  transition: opacity 0.2s;
  white-space: nowrap;
}
.btn-batch:hover {
  opacity: 0.9;
}
.btn-batch-delete { background: #ef4444; }
.btn-batch-disable { background: #f97316; }
.btn-batch-enable { background: #22c55e; }
.btn-batch-refresh { background: #3b82f6; }
.btn-batch-warmup { background: #a855f7; }

/* Disabled Row Styling */
.account-row.is-disabled {
  opacity: 0.5;
  background: rgba(0, 0, 0, 0.2);
}
.account-row.is-disabled .email-text {
  text-decoration: line-through;
}
</style>
