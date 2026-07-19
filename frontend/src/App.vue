<template>
  <div class="layout-container">
    <!-- Horizontal System Status Top Bar (Pinned globally above tabs) -->
    <section class="system-status-bar" v-if="!isLoginPage">
      <!-- Global Antigravity Toggle inside Status Bar -->
      <div class="status-bar-item agent-toggle-wrapper">
        <span class="status-label">Antigravity Process:</span>
        <AgToggle
          size="sm"
          :model-value="isRunning"
          :disabled="agentLoading"
          @update:model-value="toggleAgent"
        />
        <span class="status-badge" :class="isRunning ? 'badge--success' : 'badge--danger'">
          {{ isRunning ? 'Running' : 'Stopped' }}
        </span>
      </div>

      <div class="status-bar-item">
        <span class="status-label">CDP (Chrome Debugging):</span>
        <span :class="['status-badge', status?.cdpConnected ? 'badge--success' : 'badge--danger']">
          {{ status?.cdpConnected ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
      <div class="status-bar-item">
        <span class="status-label">Language Server:</span>
        <span :class="['status-badge', status?.lsConnected ? 'badge--success' : 'badge--danger']">
          {{ status?.lsConnected ? 'Connected' : 'Disconnected' }}
        </span>
      </div>
      <div class="status-bar-item actions">
        <button class="refresh-btn" @click="handleRefreshAll" :disabled="statusLoading" title="Refresh status">
          <RefreshCwIcon class="refresh-icon" :class="{ 'refresh-icon--spinning': statusLoading }" />
          <span class="refresh-label">Refresh</span>
        </button>
      </div>
    </section>

    <!-- Top Header -->
    <header class="app-header">
      <div class="brand">
        <ActivityIcon class="brand-logo-icon" />
        <span class="brand-title">AG Remote</span>
      </div>

      <!-- Horizontal Navigation Tabs -->
      <nav class="nav-tabs">
        <RouterLink 
          to="/" 
          class="tab-item" 
          :class="{ 'tab-item--active': $route.path === '/' || $route.path.startsWith('/conversation/') }"
        >
          <TerminalIcon class="tab-icon-svg" />
          <span class="tab-label">Antigravity</span>
        </RouterLink>

        <RouterLink to="/accounts" class="tab-item" active-class="tab-item--active">
          <UsersIcon class="tab-icon-svg" />
          <span class="tab-label">Account Manager</span>
        </RouterLink>

        <RouterLink to="/proxy" class="tab-item" active-class="tab-item--active">
          <CpuIcon class="tab-icon-svg" />
          <span class="tab-label">API Proxy</span>
        </RouterLink>

        <RouterLink to="/settings" class="tab-item" active-class="tab-item--active">
          <SettingsIcon class="tab-icon-svg" />
          <span class="tab-label">Settings</span>
        </RouterLink>

        <RouterLink to="/log" class="tab-item" active-class="tab-item--active">
          <ScrollTextIcon class="tab-icon-svg" />
          <span class="tab-label">Log</span>
        </RouterLink>
      </nav>

      <div class="header-actions">
        <button class="logout-btn" @click="handleLogout" title="Logout">
          <LogOutIcon class="logout-icon" />
        </button>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { 
  LogOut as LogOutIcon, 
  Terminal as TerminalIcon, 
  Users as UsersIcon, 
  Cpu as CpuIcon, 
  Settings as SettingsIcon,
  Activity as ActivityIcon,
  RefreshCw as RefreshCwIcon,
  ScrollText as ScrollTextIcon,
} from 'lucide-vue-next';
import { authService } from './services/auth';
import { agentService } from './services/agent';
import AgToggle from './components/AgToggle.vue';
import AgSpinner from './components/AgSpinner.vue';

const router = useRouter();
const route = useRoute();

// Global states for header status
const status = ref<any>(null);
const statusLoading = ref(false);
const agent = ref<any>(null);
const agentLoading = ref(false);

const isLoginPage = computed(() => route.path === '/login');
const isRunning = computed(() => agent.value?.running ?? false);

const fetchStatus = async () => {
  try {
    const res = await fetch('/api/status');
    status.value = await res.json();
  } catch (err) {
    console.error('Failed to fetch status', err);
  }
};

const fetchAgentStatus = async () => {
  try {
    agent.value = await agentService.status();
  } catch (err) {
    console.error('Failed to fetch agent status', err);
  }
};

const toggleAgent = async () => {
  agentLoading.value = true;
  try {
    if (isRunning.value) {
      await agentService.stop();
    } else {
      await agentService.start();
    }
    await fetchAgentStatus();
  } catch (err) {
    console.error('Failed to toggle agent process', err);
  } finally {
    agentLoading.value = false;
  }
};

const handleRefreshAll = async () => {
  statusLoading.value = true;
  await Promise.all([fetchStatus(), fetchAgentStatus()]);
  statusLoading.value = false;
};

const handleLogout = async () => {
  await authService.logout();
  router.replace('/login');
};

let pollInterval: any = null;

onMounted(() => {
  handleRefreshAll();
  // Poll system statuses globally every 5 seconds to keep tags in sync across all pages
  pollInterval = setInterval(() => {
    if (!isLoginPage.value) {
      fetchStatus();
      fetchAgentStatus();
    }
  }, 5000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<style scoped>
.layout-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
}

/* Horizontal System Status Bar styling (pinned at absolute top) */
.system-status-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  background: rgba(10, 15, 30, 0.95);
  border-bottom: 1px solid var(--border-color);
  padding: 8px 32px;
  font-size: 12px;
  flex-shrink: 0;
  height: 44px;
}

.status-bar-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-toggle-wrapper {
  gap: 12px;
}

.status-bar-item.actions {
  margin-left: auto;
}

.status-label {
  color: var(--text-secondary);
  font-weight: 500;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
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

.refresh-btn {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.refresh-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.refresh-icon {
  width: 12px;
  height: 12px;
}

.refresh-icon--spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Horizontal Header Tabs */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 52px;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--glass-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-logo-icon {
  width: 18px;
  height: 18px;
  color: var(--color-primary);
  filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.4));
}

.brand-title {
  font-size: 14px;
  font-weight: 700;
  background: linear-gradient(135deg, #ffffff 0%, #9ca3af 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.tab-icon-svg {
  width: 14px;
  height: 14px;
}

/* Navigation Tabs */
.nav-tabs {
  display: flex;
  height: 100%;
  align-items: stretch;
  gap: 4px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: all var(--transition-fast);
  position: relative;
  border-bottom: 2px solid transparent;
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

.tab-item--active {
  background: rgba(99, 102, 241, 0.08) !important;
  color: #a5b4fc !important;
  font-weight: 600;
  border-bottom: 2px solid var(--color-primary);
}

/* Logout Button */
.logout-btn {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.logout-icon {
  width: 15px;
  height: 15px;
}

/* Main Content */
.main-content {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
</style>
