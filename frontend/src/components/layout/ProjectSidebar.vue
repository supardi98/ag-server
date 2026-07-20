<script setup lang="ts">
import { defineProps, defineEmits, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  FolderPlus as FolderPlusIcon,
  MessageSquare as ConversationIcon,
  ChevronRight as ChevronRightIcon,
  RefreshCw as RefreshCwIcon,
  ArrowUpDown as SortIcon,
  Check as CheckIcon,
  Plus as PlusIcon
} from 'lucide-vue-next';
import AgButton from '../AgButton.vue';

const router = useRouter();

const props = defineProps([
  'status',
  'activeConversationId',
  'projectsRefreshing',
  'projectsLoading',
  'projects',
  'sortedProjects',
  'sortKey',
  'sortOptions',
  'expandedProjects',
  'isConversationRunning',
]);

const emit = defineEmits([
  'update:activeConversationId',
  'refresh-projects',
  'set-sort-key',
  'show-connect-modal',
  'toggle-project-folder',
  'select-project',
]);

const showSortMenu = ref(false);

const formatRelativeTime = (time?: string) => {
  if (!time) return '';
  const date = new Date(time);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return date.toLocaleDateString();
};
</script>

<template>
  <aside class="sessions-sidebar">
    <div class="sidebar-top-actions">
      <AgButton
        variant="primary"
        class="w-full new-conv-btn"
        :disabled="!status?.cdpConnected"
        @click="emit('update:activeConversationId', null); router.push('/')"
      >
        <PlusIcon class="btn-icon-svg" /> New Conversation
      </AgButton>
    </div>

    <div class="sidebar-section-header">
      <span class="sidebar-section-title">Projects</span>
      <div class="sidebar-header-actions">
        <button
          class="refresh-projects-btn"
          :disabled="projectsRefreshing"
          @click="emit('refresh-projects')"
          title="Refresh projects"
        >
          <RefreshCwIcon class="refresh-projects-icon" :class="{ 'spin': projectsRefreshing }" />
        </button>

        <!-- Sort dropdown -->
        <div class="sort-dropdown-wrapper">
          <button
            class="refresh-projects-btn"
            :class="{ 'sort-btn--active': sortKey !== 'last-updated' }"
            @click.stop="showSortMenu = !showSortMenu"
            title="Sort conversations"
          >
            <SortIcon class="refresh-projects-icon" />
          </button>
          <div v-if="showSortMenu" class="sort-menu">
            <div class="sort-menu-group">Sort Conversations</div>
            <button
              v-for="opt in sortOptions"
              :key="opt.key"
              class="sort-menu-item"
              :class="{ 'sort-menu-item--active': sortKey === opt.key }"
              @click="emit('set-sort-key', opt.key); showSortMenu = false"
            >
              <CheckIcon v-if="sortKey === opt.key" class="sort-check-icon" />
              <span v-else class="sort-check-spacer"></span>
              {{ opt.label }}
            </button>
          </div>
        </div>

        <!-- New Folder Plus icon button -->
        <button
          class="refresh-projects-btn"
          @click="emit('show-connect-modal')"
          title="Connect local workspace folder"
        >
          <FolderPlusIcon class="refresh-projects-icon" />
        </button>
      </div>
    </div>
    
    <div v-if="projectsRefreshing" class="sidebar-refreshing">Refreshing...</div>
    <div v-if="projectsLoading" class="sidebar-empty">Loading projects...</div>
    <div v-else-if="projects.length === 0" class="sidebar-empty">No projects found</div>

    <div v-else class="project-tree">
      <div
        v-for="project in sortedProjects"
        :key="project.folderUri"
        class="project-group"
      >
        <!-- Project folder header -->
        <div class="project-group-header">
          <button
            class="project-folder-btn"
            @click="emit('toggle-project-folder', project.folderUri)"
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
          </button>
          <button
            class="add-conv-btn"
            :title="`New conversation in ${project.name}`"
            @click.stop="emit('select-project', project)"
          >
            <PlusIcon class="add-conv-icon" />
          </button>
          <span class="conv-count">{{ project.conversations.length }}</span>
        </div>

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
            @click="emit('update:activeConversationId', conv.id)"
          >
            <ConversationIcon class="conv-icon" />
            <span class="conv-title">
              {{ conv.title }}
              <span v-if="isConversationRunning(conv.id)" class="conv-running-pulse" title="Running active cascade..." />
            </span>
            <span class="conv-time">{{ formatRelativeTime(conv.lastModifiedTime) }}</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
<style scoped>
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
  margin-bottom: 14px;
}

.new-conv-btn {
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: 600;
  height: 32px;
  font-size: 12px;
  padding: 0 12px;
}

.new-conv-btn :deep(.btn-icon-svg) {
  width: 14px;
  height: 14px;
  margin-right: 4px;
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
}

.sidebar-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding: 0 8px;
}

.sidebar-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sort-btn--active {
  color: var(--color-primary) !important;
}

.sort-dropdown-wrapper {
  position: relative;
}

.sort-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 100;
  background: #1a2235;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  min-width: 180px;
  padding: 4px 0;
  backdrop-filter: blur(12px);
}

.sort-menu-group {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 8px 12px 4px;
  pointer-events: none;
}

.sort-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.sort-menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.sort-menu-item--active {
  color: var(--text-primary);
  font-weight: 500;
}

.sort-check-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: var(--color-primary);
}

.sort-check-spacer {
  width: 12px;
  flex-shrink: 0;
}


.refresh-projects-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  transition: color var(--transition-fast);
  flex-shrink: 0;
}

.refresh-projects-btn:hover:not(:disabled) {
  color: var(--text-primary);
}

.refresh-projects-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.refresh-projects-icon {
  width: 12px;
  height: 12px;
}

.sidebar-refreshing {
  font-size: 11px;
  color: var(--color-primary);
  padding: 0 8px 8px;
  opacity: 0.8;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
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
  flex: 1;
  min-width: 0;
}

.project-group-header {
  display: flex;
  align-items: center;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
}

.project-group-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.project-group-header:hover .add-conv-btn {
  opacity: 1;
}

.add-conv-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  margin-right: 4px;
  opacity: 0;
  transition: opacity var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
}

.add-conv-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.add-conv-icon {
  width: 12px;
  height: 12px;
}

.project-folder-btn:hover {
  background: none;
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
  margin-right: 6px;
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

.conv-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-running-pulse {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  flex-shrink: 0;
  display: inline-block;
  animation: pulseGlow 1.5s infinite ease-in-out;
}

@keyframes pulseGlow {
  0%, 100% {
    transform: scale(1);
    opacity: 0.4;
    box-shadow: 0 0 4px #10b981;
  }
  50% {
    transform: scale(1.2);
    opacity: 1;
    box-shadow: 0 0 10px #10b981;
  }
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

.conv-time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
  white-space: nowrap;
}

.btn-icon-svg {
  width: 14px;
  height: 14px;
  margin-right: 6px;
}

</style>
