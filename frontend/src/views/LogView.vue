<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Terminal as TerminalIcon, Trash2 as ClearIcon } from 'lucide-vue-next';
import { agentService } from '../services/agent';
import type { AgentStatus } from '../types/agent';

const agent = ref<AgentStatus | null>(null);
const logs = ref<string[]>([]);
const logContainer = ref<HTMLElement | null>(null);
let logStream: EventSource | null = null;

const isRunning = computed(() => agent.value?.running ?? false);

const clearLogs = () => {
  logs.value = [];
};

const scrollToBottom = () => {
  setTimeout(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  }, 10);
};

const connectLogStream = () => {
  logStream?.close();
  logs.value = [];
  logStream = agentService.streamLogs(
    (line) => {
      logs.value.push(line);
      if (logs.value.length > 1000) logs.value.shift();
      scrollToBottom();
    },
    async (newStatus) => {
      agent.value = newStatus;
    }
  );
};

onMounted(async () => {
  agent.value = await agentService.status();
  connectLogStream();
});

onUnmounted(() => {
  logStream?.close();
});
</script>

<template>
  <div class="log-view">
    <div class="log-header">
      <div class="log-title">
        <TerminalIcon class="log-title-icon" />
        <span>Antigravity Process Output</span>
        <span :class="['status-dot', isRunning ? 'status-dot--on' : 'status-dot--off']"></span>
        <span class="status-label">{{ isRunning ? 'Running' : 'Stopped' }}</span>
      </div>
      <div class="log-actions">
        <span class="line-count">{{ logs.length }} lines</span>
        <button class="clear-btn" @click="clearLogs" title="Clear logs">
          <ClearIcon class="clear-icon" />
          <span>Clear</span>
        </button>
      </div>
    </div>

    <div class="terminal-wrapper">
      <div class="log-terminal" ref="logContainer">
        <div v-if="logs.length === 0" class="log-empty">Waiting for output...</div>
        <div v-for="(line, i) in logs" :key="i" class="log-line">{{ line }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 96px);
  background: #0b0f19;
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(15, 23, 42, 0.5);
  flex-shrink: 0;
}

.log-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-title-icon {
  width: 16px;
  height: 16px;
  color: var(--color-primary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot--on {
  background: var(--color-success);
  box-shadow: 0 0 8px var(--color-success);
  animation: blink 2s ease-in-out infinite;
}

.status-dot--off {
  background: var(--color-danger);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.status-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
}

.log-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.line-count {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.clear-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: var(--color-danger);
}

.clear-icon {
  width: 13px;
  height: 13px;
}

.terminal-wrapper {
  flex: 1;
  overflow: hidden;
  padding: 16px 24px;
}

.log-terminal {
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #a3e635;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-empty {
  color: var(--text-muted);
  font-style: italic;
}

.log-line {
  margin: 0;
}

.log-line:hover {
  background: rgba(255, 255, 255, 0.03);
}
</style>
