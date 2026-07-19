<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AgButton from './components/AgButton.vue';
import AgCard from './components/AgCard.vue';
import AgModal from './components/AgModal.vue';
import AgSpinner from './components/AgSpinner.vue';

interface Status {
  status: string;
  cdpConnected: boolean;
  lsConnected: boolean;
  timestamp: string;
}

const status = ref<Status | null>(null);
const loading = ref(true);
const showErrorModal = ref(false);
const errorMsg = ref('');

const fetchStatus = async () => {
  loading.value = true;
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error('Failed to fetch status');
    status.value = await res.json();
  } catch (err: any) {
    errorMsg.value = err.message || 'Something went wrong';
    showErrorModal.value = true;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchStatus();
});
</script>

<template>
  <div class="dashboard-layout">
    <header class="app-header">
      <div class="brand">
        <span class="logo">🔮</span>
        <h1>Antigravity Remote</h1>
      </div>
      <div class="actions">
        <AgButton variant="secondary" @click="fetchStatus" :disabled="loading">
          <AgSpinner v-if="loading" size="sm" />
          <span v-else>Refresh Status</span>
        </AgButton>
      </div>
    </header>

    <main class="app-main">
      <div class="grid-container">
        <!-- Status Card -->
        <AgCard>
          <template #header>System Status</template>
          <div class="status-list">
            <div class="status-item">
              <span class="label">API Server Status:</span>
              <span class="badge badge--success">Active</span>
            </div>
            <div class="status-item">
              <span class="label">CDP (Chrome Debugging):</span>
              <span :class="['badge', status?.cdpConnected ? 'badge--success' : 'badge--danger']">
                {{ status?.cdpConnected ? 'Connected' : 'Disconnected' }}
              </span>
            </div>
            <div class="status-item">
              <span class="label">Language Server (LS):</span>
              <span :class="['badge', status?.lsConnected ? 'badge--success' : 'badge--danger']">
                {{ status?.lsConnected ? 'Connected' : 'Disconnected' }}
              </span>
            </div>
          </div>
          <template #footer>
            <span class="timestamp" v-if="status?.timestamp">
              Last checked: {{ new Date(status.timestamp).toLocaleTimeString() }}
            </span>
            <span class="timestamp" v-else>Fetching status...</span>
          </template>
        </AgCard>

        <!-- Quick Actions Card -->
        <AgCard>
          <template #header>Quick Interactions</template>
          <div class="actions-grid">
            <AgButton variant="primary">Start New Session</AgButton>
            <AgButton variant="secondary">View active sessions</AgButton>
          </div>
        </AgCard>
      </div>
    </main>

    <!-- Error Modal -->
    <AgModal :show="showErrorModal" title="Error" @close="showErrorModal = false">
      <p class="error-text">{{ errorMsg }}</p>
      <template #footer>
        <AgButton variant="danger" @click="showErrorModal = false">Close</AgButton>
      </template>
    </AgModal>
  </div>
</template>

<style>
/* Import global variables */
@import './styles/variables.css';

.dashboard-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 32px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--glass-border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand h1 {
  font-size: 20px;
  font-weight: 600;
  background: linear-gradient(135deg, #ffffff 0%, var(--text-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.logo {
  font-size: 24px;
}

.app-main {
  flex: 1;
  padding: 32px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  color: var(--text-secondary);
  font-size: 14px;
}

.badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.badge--success {
  background-color: rgba(16, 185, 129, 0.15);
  color: var(--color-success);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.badge--danger {
  background-color: rgba(239, 68, 68, 0.15);
  color: var(--color-danger);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.timestamp {
  font-size: 12px;
  color: var(--text-muted);
}

.actions-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.error-text {
  color: var(--color-danger);
  font-size: 14px;
}
</style>
