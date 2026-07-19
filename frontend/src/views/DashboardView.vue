<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import AgButton from '../components/AgButton.vue';
import AgCard from '../components/AgCard.vue';
import AgModal from '../components/AgModal.vue';
import AgSpinner from '../components/AgSpinner.vue';
import AgToggle from '../components/AgToggle.vue';
import { authService } from '../services/auth';
import { agentService } from '../services/agent';
import type { AgentStatus } from '../types/agent';

const router = useRouter();

// Status API
const status = ref<any>(null);
const statusLoading = ref(true);

// Agent state
const agent = ref<AgentStatus | null>(null);
const agentLoading = ref(false);
const logs = ref<string[]>([]);
const logContainer = ref<HTMLElement | null>(null);
let logStream: EventSource | null = null;

// Error modal
const showErrorModal = ref(false);
const errorMsg = ref('');

const isRunning = computed(() => agent.value?.running ?? false);

const fetchStatus = async () => {
  statusLoading.value = true;
  try {
    const res = await fetch('/api/status');
    status.value = await res.json();
  } catch (err: any) {
    errorMsg.value = err.message;
    showErrorModal.value = true;
  } finally {
    statusLoading.value = false;
  }
};

const fetchAgentStatus = async () => {
  agent.value = await agentService.status();
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
  } finally {
    agentLoading.value = false;
  }
};

const connectLogStream = () => {
  logStream?.close();
  logs.value = [];
  logStream = agentService.streamLogs(
    (line) => {
      logs.value.push(line);
      if (logs.value.length > 500) logs.value.shift();
      setTimeout(() => {
        if (logContainer.value) {
          logContainer.value.scrollTop = logContainer.value.scrollHeight;
        }
      }, 10);
    },
    (newStatus) => {
      agent.value = newStatus;
      // Also update system status variables
      fetchStatus();
    }
  );
};

const handleLogout = async () => {
  logStream?.close();
  await authService.logout();
  router.replace('/login');
};

onMounted(async () => {
  await Promise.all([fetchStatus(), fetchAgentStatus()]);
  connectLogStream();
});

onUnmounted(() => {
  logStream?.close();
});
</script>

<template>
  <div class="dashboard-layout">
    <header class="app-header">
      <div class="brand">
        <span class="logo">🔮</span>
        <h1>Antigravity Remote</h1>
      </div>
      <div class="header-actions">
        <AgButton variant="ghost" @click="$router.push('/settings')">⚙ Settings</AgButton>
        <AgButton variant="ghost" @click="handleLogout">Logout</AgButton>
      </div>
    </header>

    <main class="app-main">
      <div class="grid-container">

        <!-- Antigravity Control Card -->
        <AgCard class="agent-card">
          <template #header>
            <div class="card-title-row">
              <span>Antigravity</span>
              <span :class="['status-dot', isRunning ? 'status-dot--on' : 'status-dot--off']"></span>
            </div>
          </template>

          <div class="agent-body">
            <div class="agent-toggle-row">
              <div class="agent-info">
                <span class="agent-state-label" :class="isRunning ? 'text-success' : 'text-muted'">
                  {{ isRunning ? 'Running' : 'Stopped' }}
                </span>
                <span class="agent-meta" v-if="agent">
                  {{ agent.path }} --remote-debugging-port={{ agent.port }}
                </span>
                <span class="agent-meta" v-if="agent?.pid">PID: {{ agent.pid }}</span>
              </div>
              <AgToggle
                :model-value="isRunning"
                :disabled="agentLoading"
                @update:model-value="toggleAgent"
              />
            </div>
          </div>

          <!-- Live Log Terminal -->
          <div class="log-terminal" ref="logContainer">
            <div v-if="logs.length === 0" class="log-empty">Waiting for output...</div>
            <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
          </div>

          <template #footer>
            <span class="timestamp" v-if="agent?.startedAt">
              Started: {{ new Date(agent.startedAt).toLocaleTimeString() }}
            </span>
            <span class="timestamp" v-else>Not running</span>
          </template>
        </AgCard>

        <!-- System Status Card -->
        <AgCard>
          <template #header>System Status</template>
          <div class="status-list">
            <div class="status-item">
              <span class="label">API Server</span>
              <span class="badge badge--success">Active</span>
            </div>
            <div class="status-item">
              <span class="label">CDP (Chrome Debugging)</span>
              <span :class="['badge', status?.cdpConnected ? 'badge--success' : 'badge--danger']">
                {{ status?.cdpConnected ? 'Connected' : 'Disconnected' }}
              </span>
            </div>
            <div class="status-item">
              <span class="label">Language Server</span>
              <span :class="['badge', status?.lsConnected ? 'badge--success' : 'badge--danger']">
                {{ status?.lsConnected ? 'Connected' : 'Disconnected' }}
              </span>
            </div>
            <div class="status-item">
              <span class="label">Antigravity Process</span>
              <span :class="['badge', isRunning ? 'badge--success' : 'badge--danger']">
                {{ isRunning ? 'Running' : 'Stopped' }}
              </span>
            </div>
          </div>
          <template #footer>
            <AgButton variant="secondary" @click="Promise.all([fetchStatus(), fetchAgentStatus()])" :disabled="statusLoading">
              <AgSpinner v-if="statusLoading" size="sm" />
              <span v-else>Refresh</span>
            </AgButton>
          </template>
        </AgCard>

      </div>
    </main>

    <AgModal :show="showErrorModal" title="Error" @close="showErrorModal = false">
      <p class="error-text">{{ errorMsg }}</p>
      <template #footer>
        <AgButton variant="danger" @click="showErrorModal = false">Close</AgButton>
      </template>
    </AgModal>
  </div>
</template>

<style scoped>
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

.brand { display: flex; align-items: center; gap: 12px; }
.brand h1 {
  font-size: 20px;
  font-weight: 600;
  background: linear-gradient(135deg, #ffffff 0%, var(--text-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.logo { font-size: 24px; }
.header-actions { display: flex; gap: 12px; }

.app-main {
  flex: 1;
  padding: 32px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 24px;
}

/* Agent Card */
.agent-card { grid-column: span 1; }
.card-title-row { display: flex; align-items: center; gap: 10px; }

.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.status-dot--on {
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
  animation: blink 2s ease-in-out infinite;
}
.status-dot--off { background: var(--color-danger); }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.agent-body { margin-bottom: 16px; }
.agent-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.agent-info { display: flex; flex-direction: column; gap: 4px; }
.agent-state-label { font-size: 15px; font-weight: 600; }
.agent-meta { font-size: 12px; color: var(--text-muted); font-family: monospace; }

.text-success { color: var(--color-success); }
.text-muted { color: var(--text-muted); }

/* Log Terminal */
.log-terminal {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px;
  height: 220px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 11px;
  line-height: 1.6;
  color: #a3e635;
  white-space: pre-wrap;
  word-break: break-all;
}
.log-empty { color: var(--text-muted); font-style: italic; }
.log-line { margin: 0; }

/* Status Card */
.status-list { display: flex; flex-direction: column; gap: 16px; }
.status-item { display: flex; justify-content: space-between; align-items: center; }
.label { color: var(--text-secondary); font-size: 14px; }

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

.timestamp { font-size: 12px; color: var(--text-muted); }
.error-text { color: var(--color-danger); font-size: 14px; }
</style>
