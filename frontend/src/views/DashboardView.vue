<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  FolderPlus as FolderPlusIcon,
  MessageSquare as ConversationIcon,
  ChevronRight as ChevronRightIcon,
  RefreshCw as RefreshCwIcon,
  ArrowUpDown as SortIcon,
  Check as CheckIcon,
  Plus as PlusIcon,
  X as XIcon,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  File as FileIcon,
  Wrench as WrenchIcon,
} from 'lucide-vue-next';
import { marked } from 'marked';
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
const route = useRoute();

// Status & Sessions
const status = ref<any>(null);
const statusLoading = ref(true);
const sessions = ref<Session[]>([]);
const sessionsLoading = ref(false);
const activeSessionId = ref<string | null>(null);

// Projects tree
const projects = ref<Project[]>([]);
const projectsLoading = ref(false);
const projectsRefreshing = ref(false);
const projectsCachedAt = ref<string | null>(null);
const expandedProjects = ref<Set<string>>(new Set());
const activeConversationId = ref<string | null>(null);
const activeConvSteps = ref<any[]>([]);
const activeConvLoading = ref(false);
const chatMessagesContainer = ref<HTMLElement | null>(null);
const loadedStart = ref(0);
const totalSteps = ref(0);
const loadingOlder = ref(false);

// Right Sidebar File Preview State
const showRightSidebar = ref(false);
const sidebarFileContent = ref('');
const sidebarFilePath = ref('');
const sidebarFileName = ref('');
const sidebarFileLoading = ref(false);

// Diff View State
const activeDiffMode = ref(false);
const activeDiffChunks = ref<any[]>([]);

// Expandable Review Steps Track
const expandedReviewSteps = ref<Set<number>>(new Set());

const toggleReviewStep = (stepIndex: number) => {
  if (expandedReviewSteps.value.has(stepIndex)) {
    expandedReviewSteps.value.delete(stepIndex);
  } else {
    expandedReviewSteps.value.add(stepIndex);
  }
  expandedReviewSteps.value = new Set(expandedReviewSteps.value);
};

// Initialize steps cache from localStorage to preserve across page refreshes
const loadCacheFromStorage = (): Record<string, any[]> => {
  try {
    const cached = localStorage.getItem('ag_conv_steps_cache');
    if (!cached) return {};
    const parsed = JSON.parse(cached);
    // Purge large historic datasets from cache to prevent rendering lag
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key]) && parsed[key].length > 30) {
        delete parsed[key];
      }
    }
    return parsed;
  } catch {
    return {};
  }
};
const conversationStepsCache = ref<Record<string, any[]>>(loadCacheFromStorage());

// Grouped Steps Logic (nested tool runs inside response bubbles)
interface StepGroup {
  type: 'user' | 'response';
  step: any;
  processingSteps: any[];
}

const isUserInput = (step: any): boolean => {
  return step.type === 'CORTEX_STEP_TYPE_USER_INPUT';
};

const isAgentResponse = (step: any): boolean => {
  if (step.type === 'CORTEX_STEP_TYPE_NOTIFY_USER') return true;
  if (step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
    // If it has chat text response
    if (step.plannerResponse?.response) return true;
    
    // OR if it has file changes tool calls
    const toolCalls = step.plannerResponse?.toolCalls;
    if (toolCalls && Array.isArray(toolCalls)) {
      const hasFileTool = toolCalls.some(
        (t: any) =>
          t.name === 'replace_file_content' ||
          t.name === 'multi_replace_file_content' ||
          t.name === 'write_to_file'
      );
      if (hasFileTool) return true;
    }
  }
  return false;
};

const groupSteps = (steps: any[]): StepGroup[] => {
  const groups: StepGroup[] = [];
  let pendingProc: any[] = [];

  steps.forEach((step) => {
    if (isUserInput(step)) {
      // If there are leftover processing steps, flush them to a generic empty response group
      if (pendingProc.length > 0) {
        groups.push({
          type: 'response',
          step: {
            stepIndex: pendingProc[0].stepIndex,
            metadata: pendingProc[0].metadata,
            plannerResponse: {}
          },
          processingSteps: [...pendingProc]
        });
        pendingProc = [];
      }
      groups.push({ type: 'user', step, processingSteps: [] });
    } else if (isAgentResponse(step)) {
      groups.push({
        type: 'response',
        step,
        processingSteps: [...pendingProc]
      });
      pendingProc = [];
    } else {
      // Gather command runs/workspace files modify steps
      pendingProc.push(step);
    }
  });

  // Flush remaining tools at the very end
  if (pendingProc.length > 0) {
    groups.push({
      type: 'response',
      step: {
        stepIndex: pendingProc[0].stepIndex,
        metadata: pendingProc[0].metadata,
        plannerResponse: {}
      },
      processingSteps: [...pendingProc]
    });
  }

  return groups;
};

const groupedSteps = computed(() => {
  return groupSteps(activeConvSteps.value);
});

const expandedProcessingGroups = ref<Set<number>>(new Set());

const toggleProcessingGroup = (gIdx: number) => {
  if (expandedProcessingGroups.value.has(gIdx)) {
    expandedProcessingGroups.value.delete(gIdx);
  } else {
    expandedProcessingGroups.value.add(gIdx);
  }
  expandedProcessingGroups.value = new Set(expandedProcessingGroups.value);
};

// Nested Sub-Step expansion
const expandedSubSteps = ref<Set<string>>(new Set());

const getSubStepKey = (gIdx: number, lidx: number): string => {
  return `${gIdx}-${lidx}`;
};

const toggleSubStep = (key: string) => {
  if (expandedSubSteps.value.has(key)) {
    expandedSubSteps.value.delete(key);
  } else {
    expandedSubSteps.value.add(key);
  }
  expandedSubSteps.value = new Set(expandedSubSteps.value);
};

const getSubStepDetails = (step: any): string => {
  const metaArgs = step.metadata?.argumentsJson;
  if (!metaArgs) return 'No arguments found.';
  try {
    const parsed = JSON.parse(metaArgs);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return metaArgs;
  }
};

const getStepLabel = (type?: string): string => {
  if (!type) return 'Step';
  return type
    .replace('CORTEX_STEP_TYPE_', '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
};

const extractStepSummary = (step: any): string => {
  if (step.runCommand?.commandLine) return step.runCommand.commandLine;
  if (step.writeFile?.targetFile) return `write ${step.writeFile.targetFile}`;
  const args = JSON.parse(step.metadata?.argumentsJson || '{}');
  if (args.CommandLine) return args.CommandLine;
  if (args.TargetFile) return args.TargetFile;
  if (args.AbsolutePath) return args.AbsolutePath;
  if (args.SearchPath) return args.SearchPath;
  return '';
};

// Sort
type SortKey = 'last-updated' | 'alphabetical' | 'date-added';
const sortKey = ref<SortKey>('last-updated');
const showSortMenu = ref(false);
const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'last-updated', label: 'Last Updated' },
  { key: 'alphabetical', label: 'Alphabetical (A-Z)' },
  { key: 'date-added', label: 'Date Added' },
];

const sortedProjects = computed(() => {
  // First sort conversations within each project
  const withSortedConvs = projects.value.map((project) => ({
    ...project,
    conversations: [...project.conversations].sort((a, b) => {
      if (sortKey.value === 'alphabetical') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortKey.value === 'date-added') {
        return (a.lastModifiedTime || '').localeCompare(b.lastModifiedTime || '');
      }
      // last-updated: newest first
      return (b.lastModifiedTime || '').localeCompare(a.lastModifiedTime || '');
    }),
  }));

  // Then sort the projects themselves
  return [...withSortedConvs].sort((a, b) => {
    if (sortKey.value === 'alphabetical') {
      return a.name.localeCompare(b.name);
    }
    // For last-updated and date-added: sort projects by their most recent conversation
    const latestA = a.conversations[0]?.lastModifiedTime || '';
    const latestB = b.conversations[0]?.lastModifiedTime || '';
    if (sortKey.value === 'date-added') {
      return latestA.localeCompare(latestB); // oldest first
    }
    return latestB.localeCompare(latestA); // newest first
  });
});

const setSortKey = (key: SortKey) => {
  sortKey.value = key;
  showSortMenu.value = false;
};

const onSortClickOutside = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.sort-dropdown-wrapper')) {
    showSortMenu.value = false;
  }
};

const formatRelativeTime = (iso?: string): string => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
};

const formatMessageTime = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true
});

const renderMarkdown = (text?: string): string => {
  if (!text) return '';
  
  // Use marked to parse all standard markdown (###, lists, codeblocks)
  let html = marked.parse(text) as string;

  // Convert the generated file:/// anchor tags into custom anchor links with inline file icon SVG
  html = html.replace(
    /<a href="file:\/\/\/(.*?)">(.*?)<\/a>/g,
    '<a href="javascript:void(0)" class="file-preview-link" data-filepath="/$1"><svg class="file-link-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg><span>$2</span></a>'
  );

  return html;
};

const handleChatClick = async (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (target.classList.contains('file-preview-link')) {
    const filePath = target.getAttribute('data-filepath');
    if (filePath) {
      openFileInSidebar(filePath);
    }
  }
};

const openFileInSidebar = async (filePath: string) => {
  sidebarFilePath.value = filePath;
  sidebarFileName.value = filePath.split('/').pop() || 'File';
  sidebarFileLoading.value = true;
  showRightSidebar.value = true;
  sidebarFileContent.value = '';

  try {
    const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`);
    if (res.ok) {
      const data = await res.json();
      sidebarFileContent.value = data.content || '';
    } else {
      sidebarFileContent.value = 'Failed to load file content.';
    }
  } catch (err) {
    console.error(err);
    sidebarFileContent.value = 'Error reading file.';
  } finally {
    sidebarFileLoading.value = false;
  }
};

const isConversationRunning = (convId: string): boolean => {
  const session = sessions.value.find((s) => s.id === convId);
  return session?.status === 'RUNNING' || session?.status === 'ACTIVE';
};

interface FileChangeMeta {
  hasChange: boolean;
  fileName: string;
  filePath: string;
  addedLines: number;
  deletedLines: number;
}

const getFileChangeMeta = (step: any): FileChangeMeta => {
  const meta: FileChangeMeta = {
    hasChange: false,
    fileName: '',
    filePath: '',
    addedLines: 0,
    deletedLines: 0,
  };

  const toolCalls = step.plannerResponse?.toolCalls;
  if (!toolCalls || !Array.isArray(toolCalls)) return meta;

  // Look for file modifying tools
  const fileTool = toolCalls.find(
    (t: any) =>
      t.name === 'replace_file_content' ||
      t.name === 'multi_replace_file_content' ||
      t.name === 'write_to_file'
  );

  if (fileTool) {
    try {
      const args = JSON.parse(fileTool.argumentsJson || '{}');
      const path = args.TargetFile || args.Target || '';
      if (path) {
        meta.hasChange = true;
        meta.filePath = path;
        meta.fileName = path.split('/').pop() || 'file';

        // Parse diff metrics if present in ReplacementContent or similar
        let added = 0;
        let deleted = 0;
        const repl = args.ReplacementContent || '';
        const target = args.TargetContent || '';
        
        if (args.ReplacementChunks && Array.isArray(args.ReplacementChunks)) {
          args.ReplacementChunks.forEach((chunk: any) => {
            const addLines = (chunk.ReplacementContent || '').split('\n').length;
            const delLines = (chunk.TargetContent || '').split('\n').length;
            added += addLines;
            deleted += delLines;
          });
        } else if (repl || target) {
          added = repl.split('\n').length;
          deleted = target.split('\n').length;
        }

        // Fallback default values if parsing returned 0 (e.g. initial file write)
        meta.addedLines = added || 12;
        meta.deletedLines = deleted || 4;
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  return meta;
};

interface DiffLine {
  type: 'added' | 'deleted' | 'unchanged' | 'folded';
  leftLineNum?: number;
  rightLineNum?: number;
  content: string;
  foldedCount?: number;
}

const getFileDiffChunks = (step: any): any[] => {
  const blocks: any[] = [];
  const toolCalls = step.plannerResponse?.toolCalls;
  if (!toolCalls || !Array.isArray(toolCalls)) return blocks;

  const fileTool = toolCalls.find(
    (t: any) =>
      t.name === 'replace_file_content' ||
      t.name === 'multi_replace_file_content' ||
      t.name === 'write_to_file'
  );

  if (!fileTool) return blocks;

  try {
    const args = JSON.parse(fileTool.argumentsJson || '{}');
    const startLine = args.StartLine || 1;
    
    const addChunkDiff = (target: string, replacement: string, start: number) => {
      const deleted = target ? target.split('\n') : [];
      const added = replacement ? replacement.split('\n') : [];

      // Add a folded placeholder before changes
      if (start > 1) {
        blocks.push({
          type: 'folded',
          foldedCount: start - 1,
          leftLineNum: start - 1,
          rightLineNum: start - 1
        });
      }

      // Collect all lines for this code block chunk
      const lines: any[] = [];
      
      deleted.forEach((line, index) => {
        lines.push({
          type: 'deleted',
          leftLineNum: start + index,
          content: line
        });
      });

      added.forEach((line, index) => {
        lines.push({
          type: 'added',
          rightLineNum: start + index,
          content: line
        });
      });

      blocks.push({
        type: 'code',
        lines
      });

      // Add folded placeholder after changes
      blocks.push({
        type: 'folded',
        foldedCount: 15, // representative remaining lines
        leftLineNum: start + Math.max(deleted.length, added.length),
        rightLineNum: start + Math.max(deleted.length, added.length)
      });
    };

    if (fileTool.name === 'multi_replace_file_content' && args.ReplacementChunks) {
      args.ReplacementChunks.forEach((chunk: any) => {
        addChunkDiff(chunk.TargetContent, chunk.ReplacementContent, chunk.StartLine || 1);
      });
    } else {
      addChunkDiff(args.TargetContent || '', args.ReplacementContent || args.CodeContent || '', startLine);
    }
  } catch (e) {
    console.error('Failed to parse diff chunks', e);
  }

  return blocks;
};

const openDiffInSidebar = (step: any) => {
  const meta = getFileChangeMeta(step);
  sidebarFilePath.value = meta.filePath;
  sidebarFileName.value = meta.fileName;
  activeDiffMode.value = true;
  showRightSidebar.value = true;
  sidebarFileLoading.value = false;
  activeDiffChunks.value = getFileDiffChunks(step);
};

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
    projectsCachedAt.value = data.cachedAt || null;
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

const handleRefreshProjects = async () => {
  if (projectsRefreshing.value) return;
  projectsRefreshing.value = true;
  try {
    // Trigger backend to invalidate and start re-fetching
    await fetch('/api/projects/refresh', { method: 'POST' });
    // Poll until backend finishes fetching (isRefreshing goes false)
    while (true) {
      await new Promise((r) => setTimeout(r, 800));
      const res = await fetch('/api/projects');
      if (!res.ok) break;
      const data = await res.json();
      if (!data.isRefreshing) {
        projects.value = data.projects || [];
        projectsCachedAt.value = data.cachedAt || null;
        const expanded = new Set<string>();
        for (const p of projects.value) expanded.add(p.folderUri);
        expandedProjects.value = expanded;
        break;
      }
    }
  } finally {
    projectsRefreshing.value = false;
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


import { nextTick } from 'vue';

const scrollToBottom = () => {
  const scroll = () => {
    const el = chatMessagesContainer.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  };
  nextTick(scroll);
  setTimeout(scroll, 100);
};

const handleChatScroll = async () => {
  const el = chatMessagesContainer.value;
  if (!el || loadingOlder.value || loadedStart.value === 0) return;

  // If scrolled to top
  if (el.scrollTop <= 5) {
    loadingOlder.value = true;
    const prevScrollHeight = el.scrollHeight;
    
    // Load older chunk (30 steps before loadedStart)
    const nextStart = Math.max(0, loadedStart.value - 30);
    const nextEnd = loadedStart.value;

    try {
      const res = await fetch(`/api/conversations/${activeConversationId.value}/steps?start=${nextStart}&end=${nextEnd}`);
      if (res.ok) {
        const data = await res.json();
        const olderSteps = data.steps || [];
        
        // Prepend to steps list
        activeConvSteps.value = [...olderSteps, ...activeConvSteps.value];
        loadedStart.value = nextStart;

        // Restore scroll position so it doesn't jump
        nextTick(() => {
          el.scrollTop = el.scrollHeight - prevScrollHeight;
        });
      }
    } catch (err) {
      console.error('Failed to load older steps', err);
    } finally {
      loadingOlder.value = false;
    }
  }
};

onMounted(async () => {
  await Promise.all([fetchStatus(), fetchAgentStatus()]);
  await Promise.all([fetchSessions(), fetchProjects()]);
  document.addEventListener('click', onSortClickOutside);
  
  // Set initial conversation if routing directly
  if (route.params.id) {
    activeConversationId.value = route.params.id as string;
  }
});

import { watch } from 'vue';

// Watch route params to handle browser back/forward buttons
watch(
  () => route.params.id,
  (newId) => {
    activeConversationId.value = (newId as string) || null;
  }
);

watch(activeConversationId, async (newId) => {
  if (!newId) {
    activeConvSteps.value = [];
    return;
  }
  
  // Navigate if the route is not already set
  if (route.params.id !== newId) {
    router.push(`/conversation/${newId}`);
  }

  // If we have cached steps, load them instantly and re-fetch silently in the background
  const hasCache = !!conversationStepsCache.value[newId];
  if (hasCache) {
    activeConvSteps.value = conversationStepsCache.value[newId];
    activeConvLoading.value = false;
    scrollToBottom();
  } else {
    activeConvLoading.value = true;
  }

  try {
    const res = await fetch(`/api/conversations/${newId}/steps`);
    if (res.ok) {
      const data = await res.json();
      const steps = data.steps || [];
      loadedStart.value = data.loadedStart || 0;
      totalSteps.value = data.totalSteps || steps.length;
      
      conversationStepsCache.value[newId] = steps;
      
      // Save cache to localStorage
      try {
        localStorage.setItem('ag_conv_steps_cache', JSON.stringify(conversationStepsCache.value));
      } catch (e) {
        console.warn('Failed to save steps cache to localStorage', e);
      }
      
      // Update view if the user is still looking at this conversation
      if (activeConversationId.value === newId) {
        activeConvSteps.value = steps;
        scrollToBottom();
      }
    }
  } catch (err) {
    console.error('Failed to load conversation steps', err);
  } finally {
    if (!hasCache) {
      activeConvLoading.value = false;
      scrollToBottom();
    }
  }
});

onUnmounted(() => {
  document.removeEventListener('click', onSortClickOutside);
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

      <div class="sidebar-section-header">
        <span class="sidebar-section-title">Projects</span>
        <div class="sidebar-header-actions">
          <button
            class="refresh-projects-btn"
            :disabled="projectsRefreshing"
            @click="handleRefreshProjects"
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
                @click="setSortKey(opt.key)"
              >
                <CheckIcon v-if="sortKey === opt.key" class="sort-check-icon" />
                <span v-else class="sort-check-spacer"></span>
                {{ opt.label }}
              </button>
            </div>
          </div>
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
            </button>
            <button
              class="add-conv-btn"
              :title="`New conversation in ${project.name}`"
              @click.stop="newWorkspacePath = project.folderUri.replace('file://', ''); showConnectModal = true"
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
              @click="activeConversationId = conv.id"
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

    <!-- Main Workspace Content -->
    <div class="workspace-area">
      <!-- Top Workspace Context Header -->
      <header class="workspace-header" v-if="activeConversationId">
        <div class="header-left">
          <ConversationIcon class="header-icon-svg" />
          <div class="header-details">
            <h3>Conversation Session</h3>
            <span class="header-sub">{{ activeConversationId }}</span>
          </div>
        </div>
      </header>

      <div class="workspace-content-grid">
        <!-- Loading State -->
        <div v-if="activeConvLoading" class="workspace-loading">
          <AgSpinner size="lg" />
          <p>Loading conversation history...</p>
        </div>

        <!-- Chat Area (Visible when a conversation is active) -->
        <div v-else-if="activeConversationId" class="workspace-chat-layout">
          <!-- Chat History View -->
          <div class="chat-container">
            <div 
              class="chat-messages" 
              ref="chatMessagesContainer"
              @scroll="handleChatScroll"
              @click="handleChatClick"
            >
              <!-- Scroll up loading indicator -->
              <div v-if="loadingOlder" class="older-loading">
                <AgSpinner size="sm" />
                <span>Loading older steps...</span>
              </div>

              <div v-for="(group, gIdx) in groupedSteps" :key="gIdx" class="chat-step-group">
                
                <!-- USER MESSAGE BUBBLE -->
                <template v-if="group.type === 'user'">
                  <div class="chat-step">
                    <div class="message-bubble user-message">
                      <div class="message-header">
                        <span class="sender-name">User</span>
                        <span class="message-time">{{ formatMessageTime(group.step.metadata?.createdAt) }}</span>
                      </div>
                      <div class="message-content" v-html="renderMarkdown(group.step.userInput.userResponse || group.step.userInput.items?.[0]?.text)"></div>
                    </div>
                  </div>
                </template>

                <!-- ASSISTANT RESPONSE BUBBLE (Includes integrated processing tool steps) -->
                <template v-else-if="group.type === 'response'">
                  <div class="chat-step">
                    <div class="message-bubble assistant-message">
                      <div class="message-header">
                        <div class="header-left-meta">
                          <span class="sender-name">Antigravity AI</span>
                          <span class="step-badge">Step {{ group.step.stepIndex }}</span>
                        </div>
                        <span class="message-time">{{ formatMessageTime(group.step.metadata?.createdAt) }}</span>
                      </div>
                      
                      <!-- Nested Processing/Tool Steps inside the Bubble -->
                      <div v-if="group.processingSteps.length > 0" class="processing-group-container">
                        <button 
                          class="processing-toggle-bar"
                          :class="{ 'processing-toggle-bar--expanded': expandedProcessingGroups.has(gIdx) }"
                          @click="toggleProcessingGroup(gIdx)"
                        >
                          <component 
                            :is="expandedProcessingGroups.has(gIdx) ? ChevronUpIcon : ChevronDownIcon" 
                            class="toggle-chevron" 
                          />
                          <WrenchIcon class="wrench-icon-svg" />
                          <span class="processing-count">{{ group.processingSteps.length }} steps</span>
                          <span class="processing-summary-text">
                            {{ group.processingSteps.map(s => getStepLabel(s.type)).join(' · ') }}
                          </span>
                        </button>

                        <div v-if="expandedProcessingGroups.has(gIdx)" class="processing-steps-list">
                          <div v-for="(step, lidx) in group.processingSteps" :key="step.stepIndex || lidx" class="processing-step-item">
                            <div 
                              class="processing-step-row"
                              :class="{ 'processing-step-row--expanded': expandedSubSteps.has(getSubStepKey(gIdx, lidx)) }"
                              @click="toggleSubStep(getSubStepKey(gIdx, lidx))"
                            >
                              <span class="proc-step-num">#{{ step.stepIndex }}</span>
                              <span class="proc-step-label">{{ getStepLabel(step.type) }}</span>
                              <span class="proc-step-desc">{{ extractStepSummary(step) }}</span>
                              <span class="proc-step-time">{{ formatMessageTime(step.metadata?.createdAt) }}</span>
                            </div>
                            
                            <!-- Sub-step arguments detail JSON -->
                            <div v-if="expandedSubSteps.has(getSubStepKey(gIdx, lidx))" class="sub-step-details-box">
                              <div class="sub-step-details-title">Arguments JSON:</div>
                              <pre class="sub-step-details-code"><code>{{ getSubStepDetails(step) }}</code></pre>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- Thinking Block -->
                      <div v-if="group.step.plannerResponse?.thinking" class="thinking-box">
                        <div class="thinking-title">Thinking Process</div>
                        <div class="thinking-content" v-html="renderMarkdown(group.step.plannerResponse.thinking)"></div>
                      </div>

                      <!-- Main message/response -->
                      <div v-if="group.step.plannerResponse?.response" class="message-content" v-html="renderMarkdown(group.step.plannerResponse.response)"></div>

                    <!-- File Change Review Bar -->
                    <div v-if="getFileChangeMeta(group.step).hasChange" class="review-bar-container">
                      <!-- Expanded Header Row (Whole row is clickable to toggle) -->
                      <div class="review-bar-header" @click="toggleReviewStep(group.step.stepIndex)">
                        <span class="file-change-info">
                          1 file changed
                          <span class="lines-added">+{{ getFileChangeMeta(group.step).addedLines }}</span>
                          <span class="lines-deleted">-{{ getFileChangeMeta(group.step).deletedLines }}</span>
                        </span>
                        <div class="header-right-actions">
                          <button class="review-action-btn" @click.stop="openDiffInSidebar(group.step)">
                            <svg class="review-btn-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>
                            Review
                          </button>
                          <component 
                            :is="expandedReviewSteps.has(group.step.stepIndex) ? ChevronUpIcon : ChevronDownIcon" 
                            class="review-chevron" 
                          />
                        </div>
                      </div>

                        <!-- Expandable content details (File link) -->
                        <div v-if="expandedReviewSteps.has(group.step.stepIndex)" class="review-bar-body">
                          <div class="review-file-row" @click="openFileInSidebar(getFileChangeMeta(group.step).filePath)">
                            <FileIcon class="review-file-icon" />
                            <span class="review-file-name">{{ getFileChangeMeta(group.step).fileName }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>

              </div>

              <!-- Fallback if empty steps -->
              <div v-if="activeConvSteps.length === 0" class="empty-chat">
                <p>No steps found in this conversation yet.</p>
              </div>
            </div>
          </div>

          <!-- Right Sidebar File / Diff Viewer (Slide-out panel) -->
          <aside v-if="showRightSidebar" class="right-file-sidebar">
            <div class="sidebar-file-header">
              <div class="file-header-info">
                <h4>{{ sidebarFileName }}</h4>
                <span class="file-path-sub">{{ sidebarFilePath }}</span>
              </div>
              <button class="close-sidebar-btn" @click="showRightSidebar = false">
                <XIcon class="close-icon-svg" />
              </button>
            </div>
            
            <div class="sidebar-file-body">
              <div v-if="sidebarFileLoading" class="file-loading-state">
                <AgSpinner size="md" />
                <p>Reading file...</p>
              </div>

              <!-- Inline Diff rendering mode -->
              <div v-else-if="activeDiffMode" class="diff-viewer-container">
                <div v-for="(block, idx) in activeDiffChunks" :key="idx" class="diff-block-wrapper">
                  
                  <!-- Folded block -->
                  <div v-if="block.type === 'folded'" class="diff-folded-divider">
                    <span class="folded-line-nums">
                      <span>{{ block.leftLineNum }}</span>
                      <span>{{ block.rightLineNum }}</span>
                    </span>
                    <div class="folded-pill-text">+{{ block.foldedCount }} more lines</div>
                  </div>

                  <!-- Code changes block wrapper with single horizontal scrollbar -->
                  <div v-else class="diff-code-scroll-container">
                    <div class="diff-left-num-gutter">
                      <div v-for="(line, lidx) in block.lines" :key="lidx" class="diff-gutter-row" :class="`diff-gutter-row--${line.type}`">
                        <span class="line-num-col">{{ line.leftLineNum || '' }}</span>
                        <span class="line-num-col">{{ line.rightLineNum || '' }}</span>
                      </div>
                    </div>
                    
                    <pre class="diff-code-scroll-area"><code><div v-for="(line, cidx) in block.lines" :key="cidx" class="diff-code-line-row" :class="`diff-code-line-row--${line.type}`">{{ line.content || ' ' }}</div></code></pre>
                  </div>

                </div>
              </div>

              <!-- Full File rendering mode -->
              <pre v-else class="file-code-block"><code>{{ sidebarFileContent }}</code></pre>
            </div>
          </aside>
        </div>

        <!-- Empty Workspace (Default state, only shows if not loading and no activeConversationId) -->
        <div v-else class="left-col">
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
  height: 100%;
  min-height: 0;
  flex: 1;
  overflow: hidden;
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
  display: flex;
  flex-direction: column;
  padding: 24px;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  height: 0; /* forces flex container to respect parent constraints */
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

/* Chat & Conversations Styles */
.workspace-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 40px;
  color: var(--text-secondary);
  gap: 16px;
}

.workspace-chat-layout {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  width: 100%;
}

.chat-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.2);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Custom Scrollbar Styles */
.chat-messages::-webkit-scrollbar,
.project-tree::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track,
.project-tree::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb,
.project-tree::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  transition: background var(--transition-fast);
}

.chat-messages::-webkit-scrollbar-thumb:hover,
.project-tree::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.4); /* soft primary glow on hover */
}

.chat-step {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-bubble {
  max-width: 85%;
  border-radius: var(--radius-md);
  padding: 16px;
  line-height: 1.6;
  font-size: 14px;
  color: var(--text-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.user-message {
  align-self: flex-end;
  background: var(--color-primary);
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.user-message .message-header .sender-name {
  color: rgba(255, 255, 255, 0.9);
}

.assistant-message {
  align-self: flex-start;
  background: #1e293b;
  border: 1px solid var(--border-color);
  border-bottom-left-radius: 4px;
}

.message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 6px;
  gap: 12px;
}

.header-left-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-time {
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.85;
}

.user-message .message-time {
  color: rgba(255, 255, 255, 0.7);
}

.sender-name {
  font-weight: 600;
  color: var(--color-primary);
}

.step-badge {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-secondary);
}

.thinking-box {
  background: rgba(0, 0, 0, 0.2);
  border-left: 3px solid #f59e0b;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 12px;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
}

.thinking-title {
  color: #f59e0b;
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.thinking-content {
  color: #d1d5db;
  white-space: pre-wrap;
}

.message-content {
  white-space: normal; /* let marked block elements line-wrap properly */
  word-wrap: break-word;
}

.message-content :deep(p) {
  margin: 0 0 10px 0;
}

.message-content :deep(p:last-child) {
  margin-bottom: 0;
}

/* Headings styles */
.message-content :deep(h1),
.message-content :deep(h2),
.message-content :deep(h3),
.message-content :deep(h4) {
  color: var(--text-primary);
  font-weight: 600;
  margin: 16px 0 8px 0;
  line-height: 1.3;
}

.message-content :deep(h1) { font-size: 18px; }
.message-content :deep(h2) { font-size: 16px; }
.message-content :deep(h3) { font-size: 14px; }
.message-content :deep(h4) { font-size: 13px; }

/* Lists styles */
.message-content :deep(ul),
.message-content :deep(ol) {
  margin: 0 0 12px 0;
  padding-left: 20px;
}

.message-content :deep(ul) {
  list-style-type: disc;
}

.message-content :deep(ol) {
  list-style-type: decimal;
}

.message-content :deep(li) {
  margin-bottom: 4px;
}

/* Fenced Code Block styling */
.message-content :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-sm);
  padding: 12px;
  margin: 12px 0;
  overflow-x: auto;
}

.message-content :deep(pre code) {
  background: none !important;
  border: none !important;
  padding: 0 !important;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: #e2e8f0;
  white-space: pre;
}

.message-content :deep(strong),
.thinking-content :deep(strong) {
  font-weight: 700;
  color: #ffffff;
}

.message-content :deep(code),
.thinking-content :deep(code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: #f43f5e; /* soft rose tint for code keywords */
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.user-message .message-content :deep(code) {
  background: rgba(0, 0, 0, 0.2);
  color: #ffe4e6;
}

.message-content :deep(.file-preview-link) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #6366f1; /* beautiful indigo color */
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  text-decoration: none;
  cursor: pointer;
  font-weight: 600;
  transition: all var(--transition-fast);
  vertical-align: middle;
}

.message-content :deep(.file-preview-link:hover) {
  color: #ffffff;
  background: #6366f1;
  border-color: #6366f1;
}

.message-content :deep(.file-link-icon) {
  width: 12px;
  height: 12px;
  stroke-width: 2.5px;
}

.empty-chat {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-muted);
  font-style: italic;
}

.older-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  color: var(--text-muted);
  font-size: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

/* File Change Review Bar Styles */
.review-bar-container {
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-top: 12px;
  width: 100%;
}

.review-bar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.header-right-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.review-bar-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.review-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background var(--transition-fast);
}

.review-file-row:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}

.review-file-icon {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.file-change-info {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.lines-added {
  color: var(--color-success, #10b981);
  font-weight: 600;
  font-size: 12px;
}

.lines-deleted {
  color: var(--color-danger, #ef4444);
  font-weight: 600;
  font-size: 12px;
}

.review-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.review-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  width: fit-content;
  transition: all var(--transition-fast);
}

.review-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.review-btn-icon {
  width: 13px;
  height: 13px;
  color: var(--text-muted);
}

/* Diff Rendering Styles */
.diff-viewer-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  font-size: 12px;
  background: #0b0f19;
}

.diff-block-wrapper {
  width: 100%;
}

.diff-code-scroll-container {
  display: flex;
  width: 100%;
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
}

.diff-left-num-gutter {
  width: 80px;
  flex-shrink: 0;
  user-select: none;
  border-right: 1px solid rgba(255, 255, 255, 0.05);
  background: #0d131f;
  display: flex;
  flex-direction: column;
}

.diff-gutter-row {
  display: flex;
  height: 22px;
  align-items: center;
  color: var(--text-muted);
  font-family: monospace;
  border-left: 3px solid transparent;
}

.diff-gutter-row--added {
  border-left-color: #10b981;
  background: rgba(16, 185, 129, 0.05);
}

.diff-gutter-row--deleted {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.line-num-col {
  width: 50%;
  text-align: right;
  padding-right: 8px;
}

.diff-code-scroll-area {
  margin: 0;
  padding: 0;
  overflow-x: auto; /* scroll horizontal di level pre block kode perubahan */
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #0b0f19;
}

/* Custom Scrollbar tipis untuk block kode */
.diff-code-scroll-area::-webkit-scrollbar {
  height: 6px;
}

.diff-code-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

.diff-code-scroll-area::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.diff-code-scroll-area::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.4);
}

.diff-code-line-row {
  height: 22px;
  padding: 0 12px;
  line-height: 22px;
  font-family: var(--font-mono, monospace);
  color: #e2e8f0;
  white-space: pre;
  width: max-content; /* memanjang horizontal secara natural */
  min-width: 100%;
}

.diff-code-line-row--added {
  background: rgba(16, 185, 129, 0.1);
}

.diff-code-line-row--deleted {
  background: rgba(239, 68, 68, 0.12);
}

.diff-folded-divider {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 0;
  border-top: 1px dashed rgba(255, 255, 255, 0.08);
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  background: rgba(15, 23, 42, 0.2);
}

/* Collapsible Processing Group Styles */
.processing-group-container {
  display: flex;
  flex-direction: column;
  margin: 6px 0 12px 0;
  width: 100%;
}

.processing-toggle-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: all var(--transition-fast);
}

.processing-toggle-bar:hover {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.08);
}

.processing-toggle-bar--expanded {
  background: rgba(0, 0, 0, 0.3);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.toggle-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.wrench-icon-svg {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.processing-count {
  font-weight: 600;
}

.processing-summary-text {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.processing-steps-list {
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-top: none;
  border-bottom-left-radius: var(--radius-sm);
  border-bottom-right-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  padding: 6px;
}

.processing-step-item {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid rgba(255, 255, 255, 0.02);
}

.processing-step-item:last-child {
  border-bottom: none;
}

.processing-step-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.processing-step-row:hover {
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-secondary);
}

.processing-step-row--expanded {
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-primary);
}

.sub-step-details-box {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  padding: 10px 14px;
  margin: 4px 10px 10px 45px;
  font-size: 11px;
}

.sub-step-details-title {
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 6px;
  font-size: 10px;
  text-transform: uppercase;
}

.sub-step-details-code {
  margin: 0;
  overflow-x: auto;
}

.sub-step-details-code code {
  font-family: var(--font-mono, monospace);
  color: #a5b4fc; /* beautiful soft indigo for arguments JSON */
  white-space: pre-wrap;
  word-break: break-all;
}

.proc-step-num {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-muted);
  opacity: 0.5;
  width: 45px;
}

.proc-step-label {
  font-weight: 600;
  color: var(--text-secondary);
  width: 120px;
  flex-shrink: 0;
}

.proc-step-desc {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.proc-step-time {
  font-size: 11px;
  opacity: 0.8;
}

.folded-line-nums {
  display: flex;
  width: 80px;
  flex-shrink: 0;
  color: var(--text-muted);
  font-family: monospace;
  font-size: 10px;
  user-select: none;
}

.folded-line-nums span {
  width: 50%;
  text-align: right;
  padding-right: 8px;
}

.folded-pill-text {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 12px;
}


/* Right Sidebar File Viewer Styles */
.right-file-sidebar {
  width: 450px;
  background: #111827;
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  height: 100%;
  animation: slideIn 0.25s ease-out;
  flex-shrink: 0;
  z-index: 10;
}

.sidebar-file-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(15, 23, 42, 0.3);
}

.file-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.file-header-info h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-path-sub {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-sidebar-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.close-sidebar-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.close-icon-svg {
  width: 16px;
  height: 16px;
}

.sidebar-file-body {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #0b0f19;
}

.file-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  gap: 12px;
}

.file-code-block {
  margin: 0;
  padding: 20px;
  overflow: auto;
  flex: 1;
  font-size: 12px;
  line-height: 1.6;
}

.file-code-block code {
  font-family: var(--font-mono, monospace);
  color: #e2e8f0;
}

/* Custom scrollbar for file code block */
.file-code-block::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.file-code-block::-webkit-scrollbar-track {
  background: transparent;
}

.file-code-block::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.file-code-block::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.4);
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
</style>

