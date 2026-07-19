<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  FolderPlus as FolderPlusIcon,
  MessageSquare as ConversationIcon,
  ChevronRight as ChevronRightIcon,
} from 'lucide-vue-next';
import AgButton from '../components/AgButton.vue';
import AgCard from '../components/AgCard.vue';
import AgModal from '../components/AgModal.vue';
import AgSpinner from '../components/AgSpinner.vue';
import AgToggle from '../components/AgToggle.vue';
import { authService } from '../services/auth';
import { agentService } from '../services/agent';
import { sessionsService, type Session } from '../services/sessions';
import type { AgentStatus } from '../types/agent';

interface Conversation {
  id: string;
  title: string;
  lastModifiedTime?: string;
}

interface Project {
  name: string;
  folderUri: string;
  conversations: Conversation[];
}

const router = useRouter();

// Status & Sessions
const status = ref<any>(null);
const statusLoading = ref(true);
const sessions = ref<Session[]>([]);
const sessionsLoading = ref(false);
const activeSessionId = ref<string | null>(null);

// Projects tree
const projects = ref<Project[]>([]);
const projectsLoading = ref(false);
const expandedProjects = ref<Set<string>>(new Set());
const activeConversationId = ref<string | null>(null);

// Connect workspace modal
const showConnectModal = ref(false);
const newWorkspacePath = ref('');
const connectingWorkspace = ref(false);

// Agent state
const agent = ref<AgentStatus | null>(null);
const agentLoading = ref(false);

// Error modal
const showErrorModal = ref(false);
const errorMsg = ref('');

const isRunning = computed(() => agent.value?.running ?? false);

const activeSession = computed(() => {
  return sessions.value.find((s) => s.id === activeSessionId.value) || null;
});

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

const fetchSessions = async () => {
  if (!status.value?.cdpConnected) {
    sessions.value = [];
    activeSessionId.value = null;
    return;
  }
  sessionsLoading.value = true;
  try {
    const list = await sessionsService.getSessions();
    sessions.value = list;
    if (list.length > 0 && !activeSessionId.value) {
      activeSessionId.value = list[0].id;
    }
  } catch (err: any) {
    console.error('Failed to load sessions', err);
  } finally {
    sessionsLoading.value = false;
  }
};

const fetchProjects = async () => {
  projectsLoading.value = true;
  try {
    const res = await fetch('/api/projects');
    if (!res.ok) return;
    const data = await res.json();
    projects.value = data.projects || [];
    // Auto-expand all projects initially
    const expanded = new Set<string>();
    for (const p of projects.value) expanded.add(p.folderUri);
    expandedProjects.value = expanded;
  } catch (err) {
    console.error('Failed to load projects', err);
  } finally {
    projectsLoading.value = false;
  }
};

const toggleProjectFolder = (uri: string) => {
  if (expandedProjects.value.has(uri)) {
    expandedProjects.value.delete(uri);
  } else {
    expandedProjects.value.add(uri);
  }
  // Trigger reactivity
  expandedProjects.value = new Set(expandedProjects.value);
};

const handleConnectWorkspace = async () => {
  if (!newWorkspacePath.value.trim()) return;
  connectingWorkspace.value = true;
  try {
    const res = await sessionsService.createSession(newWorkspacePath.value.trim());
    if (res.ok) {
      showConnectModal.value = false;
      newWorkspacePath.value = '';
      await fetchSessions();
      if (res.sessionId) {
        activeSessionId.value = res.sessionId;
      }
    } else {
      errorMsg.value = res.error || 'Failed to connect workspace';
      showErrorModal.value = true;
    }
  } catch (err: any) {
    errorMsg.value = err.message;
    showErrorModal.value = true;
  } finally {
    connectingWorkspace.value = false;
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
  } finally {
    agentLoading.value = false;
  }
};


const handleRefreshAll = async () => {
  await Promise.all([fetchStatus(), fetchAgentStatus()]);
  await Promise.all([fetchSessions(), fetchProjects()]);
};

onMounted(async () => {
  await Promise.all([fetchStatus(), fetchAgentStatus()]);
  await Promise.all([fetchSessions(), fetchProjects()]);
});

onUnmounted(() => {
  // nothing to teardown
});
</script>

<template>
  <div class="antigravity-view">
    <!-- Sidebar for conversations/sessions -->
    <aside class="sessions-sidebar">
      <div class="sidebar-top-actions">
        <AgButton
          variant="primary"
          class="w-full new-conv-btn"
          :disabled="!status?.cdpConnected"
          @click="showConnectModal = true"
        >
          <FolderPlusIcon class="btn-icon-svg" /> New Conversation
        </AgButton>
      </div>

      <div class="sidebar-section-title">Projects</div>

      <div v-if="projectsLoading" class="sidebar-empty">Loading projects...</div>
      <div v-else-if="projects.length === 0" class="sidebar-empty">No projects found</div>

      <div v-else class="project-tree">
        <div
          v-for="project in projects"
          :key="project.folderUri"
          class="project-group"
        >
          <!-- Project folder header -->
          <button
            class="project-folder-btn"
            @click="toggleProjectFolder(project.folderUri)"
          >
            <ChevronRightIcon
              class="chevron-icon"
              :class="{ 'chevron-open': expandedProjects.has(project.folderUri) }"
            />
            <component
              :is="expandedProjects.has(project.folderUri) ? FolderOpenIcon : FolderIcon"
              class="folder-icon"
            />
            <span class="project-name">{{ project.name }}</span>
            <span class="conv-count">{{ project.conversations.length }}</span>
          </button>

          <!-- Conversations inside project -->
          <div
            v-if="expandedProjects.has(project.folderUri)"
            class="conversation-list"
          >
            <div v-if="project.conversations.length === 0" class="conv-empty">
              No conversations
            </div>
            <button
              v-for="conv in project.conversations"
              :key="conv.id"
              class="conv-item"
              :class="{ 'conv-item--active': activeConversationId === conv.id }"
              @click="activeConversationId = conv.id"
            >
              <ConversationIcon class="conv-icon" />
              <span class="conv-title">{{ conv.title }}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Workspace Content -->
    <div class="workspace-area">
      <!-- Top Workspace Context Header -->
      <header class="workspace-header" v-if="activeSession">
        <div class="header-left">
          <FolderIcon class="header-icon-svg" />
          <div class="header-details">
            <h3>{{ activeSession.title || 'Untitled Workspace' }}</h3>
            <span class="header-sub">{{ activeSession.id }}</span>
          </div>
        </div>
      </header>

      <div class="workspace-content-grid">
        <div class="left-col">
          <div class="empty-workspace">
            <FolderIcon class="empty-icon" />
            <p>Select a conversation from the sidebar</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Connect Workspace Modal -->
    <AgModal :show="showConnectModal" title="Connect Workspace" @close="showConnectModal = false">
      <div class="modal-form-group">
        <label for="workspacePath">Local Workspace Path</label>
        <input 
          id="workspacePath"
          v-model="newWorkspacePath"
          type="text" 
          placeholder="e.g. /home/user/my-project"
          :disabled="connectingWorkspace"
          @keyup.enter="handleConnectWorkspace"
        />
        <p class="input-help">Masukkan absolute path ke direktori lokal di mesin server.</p>
      </div>
      <template #footer>
        <AgButton variant="secondary" @click="showConnectModal = false" :disabled="connectingWorkspace">Cancel</AgButton>
        <AgButton variant="primary" @click="handleConnectWorkspace" :disabled="connectingWorkspace || !newWorkspacePath.trim()">
          <AgSpinner v-if="connectingWorkspace" size="sm" />
          <span v-else>Connect</span>
        </AgButton>
      </template>
    </AgModal>

    <!-- Error Modal -->
    <AgModal :show="showErrorModal" title="Error" @close="showErrorModal = false">
      <p class="error-text">{{ errorMsg }}</p>
      <template #footer>
        <AgButton variant="danger" @click="showErrorModal = false">Close</AgButton>
      </template>
    </AgModal>
  </div>
</template>

<style scoped>
.antigravity-view {
  display: flex;
  height: calc(100vh - 96px); /* subtract header (52px) and global status bar (44px) */
  background: #0b0f19;
}

/* Sidebar for sessions */
.sessions-sidebar {
  width: 280px;
  background: rgba(15, 23, 42, 0.4);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  padding: 16px;
}

.sidebar-top-actions {
  margin-bottom: 20px;
}

.new-conv-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: 600;
  height: 42px;
}

.w-full {
  width: 100%;
}

.sidebar-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-bottom: 12px;
  padding: 0 8px;
}

.sidebar-empty {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  padding: 24px 8px;
  font-style: italic;
}

.project-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
}

.project-group {
  display: flex;
  flex-direction: column;
}

.project-folder-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  background: none;
  border: none;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-size: 13px;
  font-weight: 600;
  transition: background var(--transition-fast);
}

.project-folder-btn:hover {
  background: rgba(255, 255, 255, 0.04);
}

.chevron-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.2s ease;
}

.chevron-open {
  transform: rotate(90deg);
}

.folder-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #fbbf24;
}

.project-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-count {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  background: rgba(255,255,255,0.06);
  padding: 1px 5px;
  border-radius: 8px;
  flex-shrink: 0;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-left: 12px;
  margin-bottom: 4px;
}

.conv-empty {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  padding: 6px 10px;
}

.conv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-size: 12px;
  transition: all var(--transition-fast);
}

.conv-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

.conv-item--active {
  background: rgba(99, 102, 241, 0.12) !important;
  color: #a5b4fc !important;
  font-weight: 500;
}

.conv-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--text-muted);
}

.conv-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.btn-icon-svg {
  width: 14px;
  height: 14px;
  margin-right: 6px;
}

/* Main Workspace Content Area */
.workspace-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-header {
  height: 64px;
  border-bottom: 1px solid var(--border-color);
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(15, 23, 42, 0.2);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon-svg {
  width: 18px;
  height: 18px;
  color: var(--color-primary);
}

.header-details h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.header-sub {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
}

.workspace-content-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.left-col {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  justify-content: center;
}

.empty-workspace {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
  padding: 40px;
}

.empty-icon {
  width: 40px;
  height: 40px;
  opacity: 0.3;
}

.empty-workspace p {
  font-size: 14px;
}

/* Agent console */
.console-card {
  flex: 1;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

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

.status-dot--off {
  background: var(--color-danger);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.agent-body {
  margin-bottom: 16px;
}

.agent-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.agent-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agent-state-label {
  font-size: 14px;
  font-weight: 600;
}

.agent-meta {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
}

/* Log Terminal */
.log-terminal {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px;
  height: 320px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 11px;
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

/* Status Cards & badges */
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
  font-size: 13px;
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

.error-text {
  color: var(--color-danger);
  font-size: 14px;
}

/* Modal Form Styles */
.modal-form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
}

.modal-form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.modal-form-group input {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
}

.modal-form-group input:focus {
  border-color: var(--color-primary);
}

.input-help {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
