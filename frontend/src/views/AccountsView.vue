<template>
  <div class="accounts-manager">
    <!-- Top Toolbar -->
    <header class="toolbar">
      <div class="toolbar-left">
        <div class="search-box">
          <SearchIcon size="16" class="text-muted" />
          <input type="text" placeholder="Search email..." class="search-input" />
        </div>
        <div class="view-toggles">
          <button class="icon-btn active"><ListIcon size="16" /></button>
          <button class="icon-btn"><GridIcon size="16" /></button>
        </div>
        <div class="filters">
          <button class="filter-badge active">All <span class="count">{{ accounts.length }}</span></button>
          <button class="filter-badge text-indigo">PRO <span class="count">3</span></button>
          <button class="filter-badge text-purple">ULTRA <span class="count">0</span></button>
          <button class="filter-badge text-gray">FREE <span class="count">{{ Math.max(0, accounts.length - 3) }}</span></button>
        </div>
      </div>
      
      <div class="toolbar-right">
        <button class="toolbar-btn icon-only" @click="showAddModal = true" title="Add Account">
          <PlusIcon size="16" />
        </button>
        <button class="toolbar-btn text-blue" @click="fetchAccounts">
          <RefreshCwIcon size="14" :class="{ 'animate-spin': loading }" /> Refresh All
        </button>
        <button class="toolbar-btn bg-orange text-white">
          <SparklesIcon size="14" /> One-click Warmup
        </button>
        <div class="toggle-group">
          <span class="text-xs text-muted">Show All Quotas</span>
          <AgToggle :model-value="false" size="sm" />
        </div>
        <div class="divider"></div>
        <button class="toolbar-btn ghost" @click="fileInputRef?.click()">
          <UploadIcon size="14" /> Import
        </button>
        <button class="toolbar-btn ghost">
          <DownloadIcon size="14" /> Export
        </button>
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
    <div class="table-container">
      <table class="accounts-table">
        <thead>
          <tr>
            <th class="col-checkbox"><input type="checkbox" class="ag-checkbox" /></th>
            <th class="col-email">EMAIL</th>
            <th class="col-quota">MODEL QUOTA</th>
            <th class="col-last-used">LAST USED</th>
            <th class="col-actions">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          <!-- Empty State -->
          <tr v-if="!loading && accounts.length === 0">
            <td colspan="5">
              <div class="empty-state">
                <UsersIcon size="48" class="text-muted opacity-50" />
                <p>No accounts found. Import or add one.</p>
              </div>
            </td>
          </tr>

          <!-- Account Rows -->
          <tr v-for="account in accounts" :key="account.id" class="account-row" :class="{ 'is-current': account.isActive }">
            <td class="col-checkbox">
              <input type="checkbox" class="ag-checkbox" />
            </td>
            
            <td class="col-email">
              <div class="email-cell">
                <GripVerticalIcon size="14" class="drag-handle text-muted" />
                <div class="email-content">
                  <span class="email-text">{{ account.email }}</span>
                  <span class="pro-badge"><DiamondIcon size="10" /> PRO</span>
                </div>
              </div>
            </td>

            <td class="col-quota">
              <div class="quota-grid">
                <!-- Mocking Quotas to match screenshot perfectly -->
                <QuotaItem name="gpt-oss-120b-medium" :icon="BotIcon" time-left="0h 39m" :percentage="0" />
                <QuotaItem name="gemini-pro-agent" :icon="BotIcon" time-left="20h 12m" :percentage="0" />
                <QuotaItem name="3.1 Pro High" :icon="SparklesIcon" time-left="20h 12m" :percentage="0" />
                <QuotaItem name="Image Generation (1:1)" :icon="SparklesIcon" time-left="N/A" :percentage="0" />
                <QuotaItem name="3.1 Pro Low" :icon="SparklesIcon" time-left="20h 12m" :percentage="0" />
                <QuotaItem name="Flash Preview (Flash 3)" :icon="SparklesIcon" time-left="20h 12m" :percentage="0" />
                <QuotaItem name="gemini-3-flash-agent" :icon="BotIcon" time-left="20h 12m" :percentage="0" />
                <QuotaItem name="gemini-3.1-flash-lite" :icon="BotIcon" time-left="20h 12m" :percentage="0" />
              </div>
            </td>

            <td class="col-last-used">
              <div class="last-used-cell">
                <span class="date">7/19/2026</span>
                <span class="time">06:46 PM</span>
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
                <button class="action-btn text-green-500" title="Refresh"><RefreshCwIcon size="14" /></button>
                <button class="action-btn" title="Export"><DownloadIcon size="14" /></button>
                <button class="action-btn text-orange-500" title="Toggle Proxy"><ToggleLeftIcon size="14" /></button>
                <button class="action-btn text-red-500 hover-bg-red" title="Delete" @click="deleteAccount(account.id)">
                  <Trash2Icon size="14" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
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
import { ref, onMounted } from 'vue';
import { useAccountStore } from '../composables/useAccountStore';
import QuotaItem from '../components/QuotaItem.vue';
import AgToggle from '../components/AgToggle.vue';
import AgModal from '../components/AgModal.vue';
import AgButton from '../components/AgButton.vue';
import { 
  Search as SearchIcon, List as ListIcon, Grid as GridIcon, Plus as PlusIcon, 
  RefreshCw as RefreshCwIcon, Sparkles as SparklesIcon, Upload as UploadIcon, 
  Download as DownloadIcon, Users as UsersIcon, GripVertical as GripVerticalIcon,
  Info as InfoIcon, Fingerprint as FingerprintIcon, Tag as TagIcon, 
  ArrowRightLeft as ArrowRightLeftIcon, ToggleLeft as ToggleLeftIcon, Trash2 as Trash2Icon,
  Bot as BotIcon, Diamond as DiamondIcon
} from 'lucide-vue-next';

const { accounts, loading, fetchAccounts, addAccount, switchAccount, deleteAccount } = useAccountStore();

const showAddModal = ref(false);
const newEmail = ref('');
const newRefreshToken = ref('');
const isSubmitting = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

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
    const validEntries = data.filter(item => item.refresh_token && item.refresh_token.startsWith('1//'));
    for (const entry of validEntries) {
      await addAccount(entry.email || 'imported@account', entry.refresh_token);
    }
  } catch (err) {
    console.error('Failed to import JSON', err);
  } finally {
    if (target) target.value = '';
    isSubmitting.value = false;
  }
};

const handleSwitch = async (id: string) => {
  await switchAccount(id);
};
</script>

<style scoped>
.accounts-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: #1a1d24; /* Darker background similar to screenshot */
  color: #e2e8f0;
  font-family: 'Inter', sans-serif;
  overflow: hidden;
}

/* Toolbar */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #1e222b;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  position: sticky;
  top: 0;
  background: #1a1d24;
  z-index: 10;
}

.accounts-table td {
  padding: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  vertical-align: top;
}

.account-row {
  transition: background 0.2s;
}
.account-row:hover {
  background: rgba(255, 255, 255, 0.02);
}
.account-row.is-current {
  background: rgba(59, 130, 246, 0.05); /* Slight blue tint */
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
  color: #e2e8f0;
}
.is-current .email-text {
  color: #60a5fa;
}
.pro-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: white;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
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
  color: #94a3b8;
}
.last-used-cell .time {
  font-size: 10px;
  color: #64748b;
}

.actions-group {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.account-row:hover .actions-group {
  opacity: 1;
}
.action-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #f8fafc;
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
</style>
