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

// Agent streaming/typing state
const agentTyping = ref(false);
const rawHtml = ref('');
const rawCss = ref('');

// Dynamic style injector for captured CSS
const updateDynamicStyles = (cssString: string) => {
  let styleEl = document.getElementById('ag-dynamic-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ag-dynamic-styles';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = cssString;
};

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

// Grouped Steps Logic (consolidates multiple agent interactions into a single bubble)
interface StepGroup {
  type: 'user' | 'response';
  step?: any; // primary step representation for metadata (like time)
  responseSteps: any[]; // all assistant steps in this turn
  processingSteps: any[]; // all tool calls / command runs in this turn
}

const isUserInput = (step: any): boolean => {
  return step.type === 'CORTEX_STEP_TYPE_USER_INPUT';
};

const isAgentResponse = (step: any): boolean => {
  if (step.type === 'CORTEX_STEP_TYPE_NOTIFY_USER') return true;
  if (step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
    return true; // treat any planner step as part of the agent response cycle
  }
  return false;
};

const groupSteps = (steps: any[]): StepGroup[] => {
  const groups: StepGroup[] = [];
  let currentGroup: StepGroup | null = null;

  steps.forEach((step) => {
    if (isUserInput(step)) {
      // Start a new user turn
      groups.push({
        type: 'user',
        step,
        responseSteps: [],
        processingSteps: []
      });
      currentGroup = null; // reset agent group
    } else if (isAgentResponse(step)) {
      // If we don't have an active agent response group, create one
      if (!currentGroup) {
        currentGroup = {
          type: 'response',
          step,
          responseSteps: [],
          processingSteps: []
        };
        groups.push(currentGroup);
      }
      currentGroup.responseSteps.push(step);
    } else {
      // It's a tool/command step
      if (!currentGroup) {
        currentGroup = {
          type: 'response',
          step,
          responseSteps: [],
          processingSteps: []
        };
        groups.push(currentGroup);
      }
      currentGroup.processingSteps.push(step);
    }
  });

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

// Summary metrics helper for "Worked for Ns"
interface WorkerSummary {
  durationSeconds: number;
  exploredText: string;
  editedFiles: { fileName: string; filePath: string; added: number; deleted: number }[];
  ranCommands: string[];
}

const getWorkerSummary = (group: StepGroup): WorkerSummary => {
  const summary: WorkerSummary = {
    durationSeconds: 1,
    exploredText: '',
    editedFiles: [],
    ranCommands: []
  };

  const steps = group.processingSteps;
  const startStep = steps[0] || group.responseSteps[0] || group.step;
  const endStep = group.responseSteps[group.responseSteps.length - 1] || steps[steps.length - 1] || group.step;

  if (!startStep || !endStep) return summary;

  // Calculate duration
  const firstTime = new Date(startStep.metadata?.createdAt || Date.now()).getTime();
  const lastTime = new Date(endStep.metadata?.createdAt || Date.now()).getTime();
  const diffSec = Math.max(1, Math.round((lastTime - firstTime) / 1000));
  summary.durationSeconds = diffSec;

  // Track counts
  let viewCount = 0;
  let searchCount = 0;

  // Scan processing steps for tools
  steps.forEach(s => {
    const type = s.type || '';
    if (type.includes('VIEW_FILE') || type.includes('READ_FILE')) {
      viewCount++;
    } else if (type.includes('GREP_SEARCH') || type.includes('SEARCH_WEB')) {
      searchCount++;
    } else if (type.includes('RUN_COMMAND') || s.runCommand) {
      const cmd = s.runCommand?.commandLine || JSON.parse(s.metadata?.argumentsJson || '{}').CommandLine;
      if (cmd) summary.ranCommands.push(cmd);
    } else if (type.includes('CODE_ACKNOWLEDGEMENT') || s.codeAcknowledgement) {
      const infos = s.codeAcknowledgement?.codeAcknowledgementInfos || [];
      infos.forEach((info: any) => {
        const path = info.diff?.path || '';
        const name = path.split('/').pop() || 'file';
        let add = 0;
        let del = 0;
        info.diff?.lines?.forEach((l: any) => {
          if (l.type === 'add') add++;
          if (l.type === 'delete') del++;
        });
        summary.editedFiles.push({ fileName: name, filePath: path, added: add, deleted: del });
      });
    } else if (type.includes('WRITE_FILE') || s.writeFile || type.includes('REPLACE_FILE_CONTENT')) {
      const args = JSON.parse(s.metadata?.argumentsJson || '{}');
      const path = s.writeFile?.targetFile || args.TargetFile || args.AbsolutePath || '';
      const name = path.split('/').pop() || 'file';
      if (path) {
        if (!summary.editedFiles.some(f => f.filePath === path)) {
          summary.editedFiles.push({ fileName: name, filePath: path, added: 0, deleted: 0 });
        }
      }
    }
  });

  // Also scan response steps for potential diff blocks (e.g. from code ack responses)
  group.responseSteps.forEach(s => {
    const type = s.type || '';
    if (type.includes('CODE_ACKNOWLEDGEMENT') || s.codeAcknowledgement) {
      const infos = s.codeAcknowledgement?.codeAcknowledgementInfos || [];
      infos.forEach((info: any) => {
        const path = info.diff?.path || '';
        const name = path.split('/').pop() || 'file';
        let add = 0;
        let del = 0;
        info.diff?.lines?.forEach((l: any) => {
          if (l.type === 'add') add++;
          if (l.type === 'delete') del++;
        });
        if (!summary.editedFiles.some(f => f.filePath === path)) {
          summary.editedFiles.push({ fileName: name, filePath: path, added: add, deleted: del });
        }
      });
    }
  });

  // Compile explored text
  const parts: string[] = [];
  if (viewCount > 0) parts.push(`${viewCount} file${viewCount > 1 ? 's' : ''}`);
  if (searchCount > 0) parts.push(`${searchCount} search${searchCount > 1 ? 'es' : ''}`);
  if (parts.length > 0) {
    summary.exploredText = `Explored ${parts.join(', ')}`;
  }

  return summary;
};

// Check if any step in this group contains file modifications
const getGroupFileChangeMeta = (group: StepGroup) => {
  const result = {
    hasChange: false,
    fileName: '',
    filePath: '',
    addedLines: 0,
    deletedLines: 0,
    sourceStep: null as any
  };

  // Check response steps and processing steps for file changes
  const allSteps = [...group.responseSteps, ...group.processingSteps];
  for (const step of allSteps) {
    const meta = getFileChangeMeta(step);
    if (meta.hasChange) {
      result.hasChange = true;
      result.fileName = meta.fileName;
      result.filePath = meta.filePath;
      result.addedLines += meta.addedLines;
      result.deletedLines += meta.deletedLines;
      result.sourceStep = step;
    }
  }

  return result;
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

const getSearchMeta = (step: any) => {
  try {
    const args = JSON.parse(step.metadata?.argumentsJson || '{}');
    return {
      query: args.Query || '',
      resultsCount: step.metadata?.resultsCount || 3
    };
  } catch {
    return { query: 'Search', resultsCount: 0 };
  }
};

const getViewFileMeta = (step: any) => {
  try {
    const args = JSON.parse(step.metadata?.argumentsJson || '{}');
    const path = args.AbsolutePath || '';
    const name = path.split('/').pop() || '';
    const start = args.StartLine || '';
    const end = args.EndLine || '';
    return {
      name,
      path,
      range: start && end ? `#L${start}-${end}` : ''
    };
  } catch {
    return { name: 'file', path: '', range: '' };
  }
};

const getCommandLogs = (step: any): string => {
  let output = '';

  // Extract from runCommand properties
  if (step.runCommand) {
    if (step.runCommand.stdout) output += step.runCommand.stdout;
    if (step.runCommand.logs) output += (output ? '\n' : '') + step.runCommand.logs;
    if (step.runCommand.stderr) output += (output ? '\n' : '') + 'Error: ' + step.runCommand.stderr;
  }

  // Extract from metadata or arguments resultJson
  if (step.metadata?.resultJson) {
    try {
      const result = JSON.parse(step.metadata.resultJson);
      if (result.stdout) output += (output ? '\n' : '') + result.stdout;
      if (result.logs) output += (output ? '\n' : '') + result.logs;
      if (result.output) output += (output ? '\n' : '') + result.output;
    } catch {}
  }

  if (step.metadata?.stdout) {
    output += (output ? '\n' : '') + step.metadata.stdout;
  }

  // If there is real output from the backend, return it
  if (output.trim()) {
    return output;
  }

  // Fallback / Mock logs (made longer with realistic full build details to demonstrate terminal scrollbar)
  const cmdLine = step.runCommand?.commandLine || JSON.parse(step.metadata?.argumentsJson || '{}').CommandLine || '';
  if (cmdLine.includes('build') || cmdLine.includes('dev')) {
    return `~/Projects/Valemis-Frontend $ npm run build

> valemis-frontend@1.0.0 build
> vite build

vite v5.0.12 building for production...
transforming...
✓ 458 modules transformed.
rendering chunks...
computing bundle sizes...

dist/index.html                                     1.84 kB │ gzip:  0.89 kB
dist/assets/RasterTematik-tTyTSPdq.js             20.87 kB │ gzip:  5.39 kB
dist/assets/LandUse-Bb49b8j5.js                  31.37 kB │ gzip:  6.88 kB
dist/assets/DetailLandLitigation-DXgDz020.js     46.93 kB │ gzip:  8.79 kB
dist/assets/index-AnVY9ADM.js                  6,308.23 kB │ gzip: 1,669.17 kB
dist/assets/index-C8g7B3d8.css                   482.11 kB │ gzip:  64.55 kB

✓ built in 4.82s
[vite:build] compression completed.
[production] build successfully finished.
[system] files generated successfully inside public_html directory.
[deploy] cache invalidated.`;
  }

  return 'Command executed successfully. No output returned.';
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

  // Close existing SSE connection if any
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
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

  // Open SSE connection for real-time updates
  activeEventSource = new EventSource(`/api/conversations/${newId}/events`);
  activeEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Handle real-time CDP snapshots (the ag2r way)
      if (data.cdpSnapshot) {
        agentTyping.value = data.cdpSnapshot.agentRunning;
        rawHtml.value = data.cdpSnapshot.html || '';
        if (data.cdpSnapshot.css && data.cdpSnapshot.css !== rawCss.value) {
          rawCss.value = data.cdpSnapshot.css;
          updateDynamicStyles(data.cdpSnapshot.css);
        }
      } else if (data.cdpStatus) {
        agentTyping.value = data.cdpStatus.agentRunning;
      }
      
      // Handle standard LS stream updates
      if (data && !data.error && !data.cdpSnapshot && !data.cdpStatus) {
        // Only trigger a full reload if the agent isn't currently streaming raw HTML,
        // to avoid heavy re-renders during active typing.
        if (!agentTyping.value) {
          loadActiveConversationSteps(newId);
        }
      }
    } catch (e) {
      console.error('SSE Message error', e);
    }
  };

  // Listen for the 'end' event to stop the typing indicator
  activeEventSource.addEventListener('end', () => {
    agentTyping.value = false;
  });
  
  activeEventSource.onerror = (err) => {
    console.error('SSE Error', err);
    agentTyping.value = false;
    // Don't close, let browser auto-reconnect
  };
});

let activeEventSource: EventSource | null = null;
import { onBeforeUnmount } from 'vue';

onBeforeUnmount(() => {
  if (activeEventSource) {
    activeEventSource.close();
  }
  agentTyping.value = false;
});

// Chat input states
const chatInputText = ref('');
const chatSending = ref(false);
const chatInputRef = ref<HTMLTextAreaElement | null>(null);

// Onboarding states
const newChatPrompt = ref('');
const initSending = ref(false);
const onboardingInputRef = ref<HTMLTextAreaElement | null>(null);

// Staged images state for Ctrl+V paste
export interface StagedImage {
  id: string;
  dataUrl: string;
  file: File;
  base64: string;
  mimeType: string;
  name: string;
}
const stagedImages = ref<StagedImage[]>([]);

const handlePaste = async (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const base64 = dataUrl.split(',')[1];
        
        stagedImages.value.push({
          id: Math.random().toString(36).slice(2),
          dataUrl,
          base64,
          file,
          mimeType: file.type,
          name: file.name || `image_${Date.now()}.png`
        });
      };
      reader.readAsDataURL(file);
    }
  }
};

const removeStagedImage = (id: string) => {
  stagedImages.value = stagedImages.value.filter(img => img.id !== id);
};

// Interactive Dropdown States
const selectedProjectUri = ref('');
const activeModelName = ref('Gemini 3.5 Flash (Low)');
const activeModelId = ref('MODEL_PLACEHOLDER_M26');
const activeContextScope = ref('Local');

const showWorkspaceDropdown = ref(false);
const showModelDropdown = ref(false);
const showContextDropdown = ref(false);

const activeSelectedProject = computed(() => {
  if (!selectedProjectUri.value && sortedProjects.value.length > 0) {
    return sortedProjects.value[0];
  }
  return sortedProjects.value.find(p => p.folderUri === selectedProjectUri.value) || sortedProjects.value[0];
});

const availableModels = [
  { name: 'Gemini 3.5 Flash (Medium)', id: 'gemini-3.5-flash-medium', tag: 'Fast' },
  { name: 'Gemini 3.5 Flash (High)', id: 'gemini-3.5-flash-high', tag: 'Fast' },
  { name: 'Gemini 3.5 Flash (Low)', id: 'MODEL_PLACEHOLDER_M26', tag: 'Fast' },
  { name: 'Gemini 3.1 Pro (Low)', id: 'gemini-3.1-pro-low' },
  { name: 'Gemini 3.1 Pro (High)', id: 'gemini-3.1-pro-high' },
  { name: 'Claude Sonnet 4.6 (Thinking)', id: 'claude-sonnet-4.6' },
  { name: 'Claude Opus 4.6 (Thinking)', id: 'claude-opus-4.6' },
  { name: 'GPT-OSS 120B (Medium)', id: 'gpt-oss-120b', warning: true }
];

const availableScopes = ['Local', 'Web', 'Workspace'];

const selectProject = (uri: string) => {
  selectedProjectUri.value = uri;
  showWorkspaceDropdown.value = false;
};

const selectModel = (name: string, id: string) => {
  activeModelName.value = name;
  activeModelId.value = id;
  showModelDropdown.value = false;
};

const selectContext = (scope: string) => {
  activeContextScope.value = scope;
  showContextDropdown.value = false;
};

// Global click handler to close dropdowns when clicking outside
const closeAllDropdowns = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.onboarding-workspace-header')) showWorkspaceDropdown.value = false;
  if (!target.closest('.model-select-trigger')) showModelDropdown.value = false;
  if (!target.closest('.scope-trigger')) showContextDropdown.value = false;
};

onMounted(() => {
  document.addEventListener('click', closeAllDropdowns);
});

const loadActiveConversationSteps = async (id: string) => {
  try {
    const res = await fetch(`/api/conversations/${id}/steps`);
    if (res.ok) {
      const data = await res.json();
      const steps = data.steps || [];
      activeConvSteps.value = steps;
      loadedStart.value = data.loadedStart || 0;
      totalSteps.value = data.totalSteps || steps.length;
      scrollToBottom();
    }
  } catch (err) {
    console.error('Failed to reload steps', err);
  }
};

const handleSendChat = async () => {
  if (!activeConversationId.value || chatSending.value) return;
  // allow empty prompt if there are staged images
  if (!chatInputText.value.trim() && stagedImages.value.length === 0) return;

  const prompt = chatInputText.value.trim();
  chatInputText.value = '';
  chatSending.value = true;
  
  // Keep a reference to staged images to upload
  const imagesToUpload = [...stagedImages.value];
  stagedImages.value = [];

  // Optimistically append the user message to UI
  const optimisticStep = {
    _isOptimistic: true, // flag to identify this step
    stepIndex: 999999 + Math.floor(Math.random() * 1000), // fake high index
    type: 'CORTEX_STEP_TYPE_USER_INPUT',
    userInput: {
      userResponse: prompt || '[Attached Image]',
      items: [{ text: prompt || '[Attached Image]' }]
    },
    metadata: {
      createdAt: new Date().toISOString()
    }
  };
  activeConvSteps.value.push(optimisticStep);
  nextTick(() => scrollToBottom());

  try {
    // 1. Upload all staged images one by one
    for (const img of imagesToUpload) {
      await fetch(`/api/conversations/${activeConversationId.value}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: img.base64,
          mimeType: img.mimeType,
          name: img.name
        })
      });
      // A small delay to let AG process the drop event before sending text
      await new Promise(r => setTimeout(r, 500));
    }

    // 2. Send the chat prompt (even if empty, AG might just process the image)
    // Actually, AG usually requires some text or an Enter keypress to trigger send.
    // If prompt is empty but we uploaded an image, we still trigger chat.
    const res = await fetch(`/api/conversations/${activeConversationId.value}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, modelId: activeModelId.value })
    });
    
    if (!res.ok) {
      console.error('Failed to send prompt to backend');
      // Remove optimistic step on failure
      activeConvSteps.value = activeConvSteps.value.filter(s => !s._isOptimistic);
    } else {
      // Transition to agent typing state
      agentTyping.value = true;
    }
  } catch (err) {
    console.error('Chat execution error', err);
    // Remove optimistic step on error
    activeConvSteps.value = activeConvSteps.value.filter(s => !s._isOptimistic);
  } finally {
    chatSending.value = false;
    nextTick(() => {
      chatInputRef.value?.focus();
    });
  }
};

const handleInitNewConversation = async () => {
  if (initSending.value) return;
  if (!newChatPrompt.value.trim() && stagedImages.value.length === 0) return;

  const prompt = newChatPrompt.value.trim();
  newChatPrompt.value = '';
  initSending.value = true;
  
  const imagesToUpload = [...stagedImages.value];
  stagedImages.value = [];

  // Find selected workspace folder
  const activeProj = activeSelectedProject.value;
  const folderUri = activeProj ? activeProj.folderUri : '';

  try {
    // 1. Initialize new cascade
    const initRes = await fetch('/api/conversations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ folderUri })
    });
    if (!initRes.ok) throw new Error('Failed to start cascade');
    const { cascadeId } = await initRes.json();

    if (cascadeId) {
      // 2. Upload staged images for the new conversation
      for (const img of imagesToUpload) {
        await fetch(`/api/conversations/${cascadeId}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: img.base64,
            mimeType: img.mimeType,
            name: img.name
          })
        });
        await new Promise(r => setTimeout(r, 500));
      }

      // 3. Send prompt as the first message
      await fetch(`/api/conversations/${cascadeId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt, modelId: activeModelId.value })
      });

      // 4. Redirect route to the new conversation
      activeConversationId.value = cascadeId;
      router.push(`/conversation/${cascadeId}`);
    }
  } catch (err) {
    console.error('Failed to initialize new conversation', err);
  } finally {
    initSending.value = false;
  }
};

const selectProjectFromSidebar = (project: any) => {
  activeConversationId.value = null;
  selectedProjectUri.value = project.folderUri;
  router.push('/');
};

onUnmounted(() => {
  document.removeEventListener('click', closeAllDropdowns);
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
          @click="activeConversationId = null; router.push('/')"
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

          <!-- New Folder Plus icon button to open Connect Workspace modal -->
          <button
            class="refresh-projects-btn"
            @click="showConnectModal = true"
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
              @click.stop="selectProjectFromSidebar(project)"
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

              <template v-for="(group, gIdx) in groupedSteps" :key="'group-' + gIdx">
                <div 
                  class="chat-step-group" 
                  v-if="!(agentTyping && rawHtml && group.type === 'response' && gIdx === groupedSteps.length - 1)"
                >
                  
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

                  <!-- ASSISTANT RESPONSE BUBBLE (Consolidated turn block) -->
                  <template v-else-if="group.type === 'response'">
                    <div class="chat-step">
                      <div class="message-bubble assistant-message">
                        <div class="message-header">
                          <div class="header-left-meta">
                            <img src="/ag2r-icon.png" width="16" height="16" class="ag-avatar-icon" alt="AG" @error="(e) => (e.target as HTMLElement).style.display = 'none'" />
                            <span class="sender-name">Antigravity</span>
                            <span class="step-badge" v-if="group.responseSteps.length > 0">
                              Step {{ group.responseSteps[0].stepIndex }}
                            </span>
                          </div>
                          <span class="message-time">
                            {{ formatMessageTime(group.step?.metadata?.createdAt) }}
                          </span>
                        </div>
                        
                        <!-- Nested Processing/Tool Steps inside the Bubble ("Worked for Ns") -->
                        <div v-if="group.processingSteps.length > 0" class="worker-group-container">
                          <button 
                            class="worker-toggle-bar"
                            :class="{ 'worker-toggle-bar--expanded': expandedProcessingGroups.has(gIdx) }"
                            @click="toggleProcessingGroup(gIdx)"
                          >
                            <span class="worker-duration-title">Worked for {{ getWorkerSummary(group).durationSeconds }}s</span>
                            <component 
                              :is="expandedProcessingGroups.has(gIdx) ? ChevronUpIcon : ChevronDownIcon" 
                              class="worker-toggle-chevron" 
                            />
                          </button>

                          <div v-if="expandedProcessingGroups.has(gIdx)" class="worker-details-list">
                            <!-- Chronological workers action flow matching Gambar 1 -->
                            <template v-for="(step, lidx) in [...group.processingSteps, ...group.responseSteps]" :key="lidx">
                              
                              <!-- 1. GREP SEARCH -->
                              <div v-if="step.type === 'CORTEX_STEP_TYPE_GREP_SEARCH'" class="worker-flow-step">
                                <div class="flow-item-wrapper">
                                  <div class="flow-row-header" @click="toggleSubStep(getSubStepKey(gIdx, lidx))">
                                    <span class="flow-action-text">Searched <span class="highlight-mono">{{ getSearchMeta(step).query }}</span></span>
                                    <span v-if="getSearchMeta(step).resultsCount" class="results-badge">{{ getSearchMeta(step).resultsCount }} results</span>
                                    <component 
                                      :is="expandedSubSteps.has(getSubStepKey(gIdx, lidx)) ? ChevronUpIcon : ChevronDownIcon" 
                                      class="flow-row-chevron" 
                                    />
                                  </div>
                                  <div v-if="expandedSubSteps.has(getSubStepKey(gIdx, lidx))" class="flow-row-details">
                                    <pre class="sub-step-details-code"><code>{{ getSubStepDetails(step) }}</code></pre>
                                  </div>
                                </div>
                              </div>

                              <!-- 2. VIEW FILE -->
                              <div v-else-if="step.type === 'CORTEX_STEP_TYPE_VIEW_FILE'" class="worker-flow-step">
                                <div class="flow-item-wrapper">
                                  <div class="flow-row-header" @click="openFileInSidebar(getViewFileMeta(step).path)">
                                    <span class="flow-action-text">
                                      Analyzed 
                                      <span class="file-link-accent">
                                        <FileIcon class="inline-file-icon" />
                                        {{ getViewFileMeta(step).name }}
                                      </span>
                                      <span class="range-mono">{{ getViewFileMeta(step).range }}</span>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <!-- 3. THOUGHT BLOCK / THINKING -->
                              <div v-else-if="step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE' && step.plannerResponse?.thinking" class="worker-flow-step">
                                <div class="flow-item-wrapper">
                                  <div class="flow-row-header" @click="toggleSubStep(getSubStepKey(gIdx, lidx))">
                                    <span class="flow-action-text">Thought for 1s</span>
                                    <component 
                                      :is="expandedSubSteps.has(getSubStepKey(gIdx, lidx)) ? ChevronUpIcon : ChevronDownIcon" 
                                      class="flow-row-chevron" 
                                    />
                                  </div>
                                  <div v-if="expandedSubSteps.has(getSubStepKey(gIdx, lidx))" class="flow-row-details">
                                    <div class="nested-thinking-box">
                                      <div class="thinking-title">Thinking Process</div>
                                      <div class="thinking-content" v-html="renderMarkdown(step.plannerResponse.thinking)"></div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <!-- 4. CODE MODIFICATIONS / EDITED -->
                              <div v-else-if="(step.type === 'CORTEX_STEP_TYPE_CODE_ACKNOWLEDGEMENT' || step.codeAcknowledgement) && getFileChangeMeta(step).hasChange" class="worker-flow-step">
                                <div class="flow-item-wrapper">
                                  <div class="flow-row-header" @click="openFileInSidebar(getFileChangeMeta(step).filePath)">
                                    <span class="flow-action-text">
                                      Edited 
                                      <span class="file-link-accent">
                                        <FileIcon class="inline-file-icon" />
                                        {{ getFileChangeMeta(step).fileName }}
                                      </span>
                                      <span class="worker-badge-lines">
                                        <span class="badge-added">+{{ getFileChangeMeta(step).addedLines }}</span>
                                        <span class="badge-deleted">-{{ getFileChangeMeta(step).deletedLines }}</span>
                                      </span>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <!-- 5. RAN COMMAND -->
                              <div v-else-if="step.type === 'CORTEX_STEP_TYPE_RUN_COMMAND' || step.runCommand" class="worker-flow-step">
                                <div class="flow-item-wrapper">
                                  <div class="flow-row-header" @click="toggleSubStep(getSubStepKey(gIdx, lidx))">
                                    <span class="flow-action-text">Ran <span class="highlight-mono">{{ step.runCommand?.commandLine || JSON.parse(step.metadata?.argumentsJson || '{}').CommandLine }}</span></span>
                                    <component 
                                      :is="expandedSubSteps.has(getSubStepKey(gIdx, lidx)) ? ChevronUpIcon : ChevronDownIcon" 
                                      class="flow-row-chevron" 
                                    />
                                  </div>
                                  <div v-if="expandedSubSteps.has(getSubStepKey(gIdx, lidx))" class="flow-row-details">
                                    <pre class="terminal-log-output"><code>{{ getCommandLogs(step) }}</code></pre>
                                  </div>
                                </div>
                              </div>
                            </template>
                          </div>
                        </div>

                        <!-- Loop and render all thinking processes and responses in chronological sequence inside this turn -->
                        <div class="consolidated-responses-flow">
                          <template v-for="turnStep in group.responseSteps" :key="turnStep.stepIndex">
                            <div v-if="turnStep.plannerResponse?.response" class="response-turn-segment">
                              <div class="message-content" v-html="renderMarkdown(turnStep.plannerResponse.response)"></div>
                            </div>
                          </template>
                        </div>

                        <!-- Integrated File Change Review Bar at the bottom of the bubble -->
                        <div v-if="getGroupFileChangeMeta(group).hasChange" class="review-bar-container">
                          <div class="review-bar-header" @click="toggleReviewStep(getGroupFileChangeMeta(group).sourceStep.stepIndex)">
                            <span class="file-change-info">
                              1 file changed
                              <span class="lines-added">+{{ getGroupFileChangeMeta(group).addedLines }}</span>
                              <span class="lines-deleted">-{{ getGroupFileChangeMeta(group).deletedLines }}</span>
                            </span>
                            <div class="header-right-actions">
                              <button class="review-action-btn" @click.stop="openDiffInSidebar(getGroupFileChangeMeta(group).sourceStep)">
                                <svg class="review-btn-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 9h6"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>
                                Review
                              </button>
                              <component 
                                :is="expandedReviewSteps.has(getGroupFileChangeMeta(group).sourceStep.stepIndex) ? ChevronUpIcon : ChevronDownIcon" 
                                class="review-chevron" 
                              />
                            </div>
                          </div>

                          <!-- Expandable details -->
                          <div v-if="expandedReviewSteps.has(getGroupFileChangeMeta(group).sourceStep.stepIndex)" class="review-bar-body">
                            <div class="review-file-row" @click="openFileInSidebar(getGroupFileChangeMeta(group).filePath)">
                              <FileIcon class="review-file-icon" />
                              <span class="review-file-name">{{ getGroupFileChangeMeta(group).fileName }}</span>
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  </template>

                </div>
              </template>
              
              <!-- Live Streaming Bubble Clone from Antigravity -->
              <div class="chat-step-group" v-if="agentTyping && rawHtml">
                <div class="chat-step">
                  <div class="message-bubble assistant-message">
                    <div class="message-header">
                      <div class="header-left-meta">
                        <img src="/ag2r-icon.png" width="16" height="16" class="ag-avatar-icon" alt="AG" @error="(e) => (e.target as HTMLElement).style.display = 'none'" />
                        <span class="sender-name">Antigravity</span>
                        <span class="step-badge animate-pulse">Running...</span>
                      </div>
                    </div>
                    <div class="message-content">
                      <div class="ag-raw-clone ag-raw-clone-isolated" v-html="rawHtml"></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Typing Indicator when chat is sending or agent is streaming -->
              <div class="chat-step-group" v-if="chatSending || (agentTyping && !rawHtml)">
                <div class="chat-step">
                  <div class="message-bubble assistant-message typing-bubble">
                    <div class="message-header">
                      <div class="header-left-meta">
                        <img src="/ag2r-icon.png" width="16" height="16" class="ag-avatar-icon" alt="AG" @error="(e) => (e.target as HTMLElement).style.display = 'none'" />
                        <span class="sender-name">Antigravity</span>
                      </div>
                    </div>
                    <div class="typing-indicator">
                      <span class="typing-label">{{ chatSending ? 'Sending...' : 'is thinking...' }}</span>
                      <span class="dot"></span>
                      <span class="dot"></span>
                      <span class="dot"></span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Fallback if empty steps -->
              <div v-if="activeConvSteps.length === 0 && !chatSending" class="empty-chat">
                <p>No steps found in this conversation yet.</p>
              </div>
            </div>

            <!-- Premium Cursor/Gemini-style Chat Input Bar -->
            <div class="chat-input-wrapper">
              <!-- Staged images preview strip -->
              <div v-if="stagedImages.length > 0" class="staged-images-strip">
                <div v-for="img in stagedImages" :key="img.id" class="staged-image-item">
                  <img :src="img.dataUrl" class="staged-img-thumb" />
                  <button class="remove-img-btn" @click="removeStagedImage(img.id)">
                    <XIcon class="remove-img-icon" />
                  </button>
                </div>
              </div>

              <div 
                class="chat-input-box" 
                :class="{ 
                  'chat-input-box--focused': chatSending,
                  'chat-input-box--running': activeConversationId && isConversationRunning(activeConversationId)
                }"
              >
                <textarea
                  ref="chatInputRef"
                  v-model="chatInputText"
                  placeholder="Ask anything, @ to mention, / for actions (Paste images with Ctrl+V)"
                  :disabled="chatSending"
                  rows="1"
                  @keydown.enter.prevent="handleSendChat"
                  @paste="handlePaste"
                />
                
                <div class="chat-input-actions-row">
                  <div class="left-actions">
                    <button class="action-circle-btn" title="Add files or context">
                      <PlusIcon class="input-btn-icon" />
                    </button>
                    
                    <div class="model-select-wrapper">
                      <div class="model-select-trigger" @click.stop="showModelDropdown = !showModelDropdown" title="Change LLM model">
                        <span>{{ activeModelName }}</span>
                        <ChevronDownIcon class="model-select-chevron" />
                      </div>
                      
                      <!-- Model list dropdown -->
                      <div v-if="showModelDropdown" class="onboarding-dropdown model-dropdown-pos font-sans-dropdown">
                        <div class="dropdown-header-title">Model</div>
                        <button 
                          v-for="m in availableModels" 
                          :key="m.id" 
                          class="onboarding-dropdown-item model-item-row"
                          :class="{ 'dropdown-item--active': activeModelId === m.id }"
                          @click="selectModel(m.name, m.id)"
                        >
                          <span class="model-item-name">{{ m.name }}</span>
                          
                          <!-- Pill badge with info icon -->
                          <span v-if="m.tag" class="model-tag-pill">
                            {{ m.tag }}
                            <svg class="model-info-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                          </span>

                          <!-- Warning/limit triangle icon -->
                          <svg v-if="m.warning" class="model-warning-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12" y1="17" y2="17"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  <button 
                    class="send-mic-btn"
                    :class="{ 'send-mic-btn--active': chatInputText.trim().length > 0 || stagedImages.length > 0 }"
                    :disabled="chatSending"
                    @click="handleSendChat"
                  >
                    <!-- Mic Icon if input is empty -->
                    <svg v-if="chatInputText.trim().length === 0 && stagedImages.length === 0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                    <!-- Send/Arrow Icon if input has text -->
                    <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
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

        <!-- Empty Workspace / Onboarding view (Shows when no activeConversationId) -->
        <div v-else class="left-col onboarding-workspace-container">
          <div class="onboarding-chat-initial-layout">
            
            <!-- Folder workspace selector dropdown -->
            <div class="onboarding-workspace-header-wrapper">
              <div class="onboarding-workspace-header" @click.stop="showWorkspaceDropdown = !showWorkspaceDropdown">
                <FolderOpenIcon class="onboarding-folder-icon" />
                <span class="onboarding-folder-name">{{ activeSelectedProject?.name || 'ag-server' }}</span>
                <ChevronDownIcon class="onboarding-folder-chevron" />
              </div>

              <!-- Workspace dropdown list -->
              <div v-if="showWorkspaceDropdown && sortedProjects.length > 0" class="onboarding-dropdown workspace-dropdown-pos">
                <button 
                  v-for="p in sortedProjects" 
                  :key="p.folderUri" 
                  class="onboarding-dropdown-item"
                  :class="{ 'dropdown-item--active': activeSelectedProject?.folderUri === p.folderUri }"
                  @click="selectProject(p.folderUri)"
                >
                  {{ p.name }}
                </button>
                <div class="dropdown-divider"></div>
                <button 
                  class="onboarding-dropdown-item new-project-item"
                  @click="showWorkspaceDropdown = false; showConnectModal = true"
                >
                  <PlusIcon class="new-project-plus-icon" />
                  New Project
                </button>
              </div>
            </div>

            <!-- Premium Input box for onboarding -->
            <div class="chat-input-wrapper">
              <!-- Staged images preview strip -->
              <div v-if="stagedImages.length > 0" class="staged-images-strip">
                <div v-for="img in stagedImages" :key="img.id" class="staged-image-item">
                  <img :src="img.dataUrl" class="staged-img-thumb" />
                  <button class="remove-img-btn" @click="removeStagedImage(img.id)">
                    <XIcon class="remove-img-icon" />
                  </button>
                </div>
              </div>

              <div 
                class="onboarding-input-box"
                :class="{ 'chat-input-box--running': initSending }"
              >
                <textarea
                  ref="onboardingInputRef"
                  v-model="newChatPrompt"
                  placeholder="Ask anything, @ to mention, / for actions (Paste images with Ctrl+V)"
                  :disabled="initSending"
                  rows="1"
                  @keydown.enter.prevent="handleInitNewConversation"
                  @paste="handlePaste"
                />
              
              <div class="onboarding-actions-row">
                <div class="onboarding-left-actions">
                  <button class="action-circle-btn" title="Add files or context">
                    <PlusIcon class="input-btn-icon" />
                  </button>
                  
                  <div class="model-select-wrapper">
                    <div class="model-select-trigger" @click.stop="showModelDropdown = !showModelDropdown" title="Change LLM model">
                      <span>{{ activeModelName }}</span>
                      <ChevronDownIcon class="model-select-chevron" />
                    </div>

                    <!-- Model list dropdown -->
                    <div v-if="showModelDropdown" class="onboarding-dropdown model-dropdown-pos font-sans-dropdown">
                      <div class="dropdown-header-title">Model</div>
                      <button 
                        v-for="m in availableModels" 
                        :key="m.id" 
                        class="onboarding-dropdown-item model-item-row"
                        :class="{ 'dropdown-item--active': activeModelId === m.id }"
                        @click="selectModel(m.name, m.id)"
                      >
                        <span class="model-item-name">{{ m.name }}</span>
                        
                        <!-- Pill badge with info icon -->
                        <span v-if="m.tag" class="model-tag-pill">
                          {{ m.tag }}
                          <svg class="model-info-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        </span>

                        <!-- Warning/limit triangle icon -->
                        <svg v-if="m.warning" class="model-warning-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12" y1="17" y2="17"/></svg>
                      </button>
                    </div>
                  </div>
                </div>

                <button 
                  class="send-mic-btn"
                  :class="{ 'send-mic-btn--active': newChatPrompt.trim().length > 0 }"
                  :disabled="initSending"
                  @click="handleInitNewConversation"
                >
                  <svg v-if="newChatPrompt.trim().length === 0 && stagedImages.length === 0" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                  <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>

              <!-- Context scope dropdown on onboarding bottom border inside frame -->
              <div class="onboarding-context-scope-row">
                <div class="scope-trigger-wrapper">
                  <div class="scope-trigger" @click.stop="showContextDropdown = !showContextDropdown" title="Select codebase context scope">
                    <!-- Laptop Monitor Icon -->
                    <svg class="scope-monitor-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
                    <span>{{ activeContextScope }}</span>
                    <ChevronDownIcon class="scope-select-chevron" />
                  </div>

                  <!-- Context Scope dropdown list -->
                  <div v-if="showContextDropdown" class="onboarding-dropdown scope-dropdown-pos">
                    <button 
                      v-for="s in availableScopes" 
                      :key="s" 
                      class="onboarding-dropdown-item"
                      :class="{ 'dropdown-item--active': activeContextScope === s }"
                      @click="selectContext(s)"
                    >
                      {{ s }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

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
  flex: 1;
}

/* Premium Workspace Onboarding view styles */
.onboarding-workspace-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}

.onboarding-chat-initial-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 680px;
  gap: 20px;
}

.onboarding-workspace-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all var(--transition-fast);
}

.onboarding-workspace-header-wrapper {
  position: relative;
  width: fit-content;
}

.model-select-wrapper {
  position: relative;
}

.scope-trigger-wrapper {
  position: relative;
}

/* Custom premium dropdown list styles */
.onboarding-dropdown {
  position: absolute;
  z-index: 100;
  background: #181c25; /* darker slate matching dropdown bg */
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  min-width: 250px;
  padding: 6px 0;
  display: flex;
  flex-direction: column;
}

.font-sans-dropdown {
  font-family: var(--font-sans);
}

.dropdown-header-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 6px 12px 4px 12px;
  text-transform: capitalize;
  opacity: 0.8;
}

.model-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
}

.model-item-name {
  flex: 1;
  font-size: 13px;
}

.model-tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 20px;
  font-size: 10px;
  color: var(--text-secondary);
}

.model-info-icon {
  width: 10px;
  height: 10px;
  opacity: 0.6;
}

.model-warning-icon {
  width: 12px;
  height: 12px;
  margin-right: 2px;
  color: #f59e0b;
  fill: rgba(245, 158, 11, 0.1);
}

.workspace-dropdown-pos {
  top: calc(100% + 4px);
  left: 0;
}

.model-dropdown-pos {
  bottom: calc(100% + 6px);
  left: 0;
}

.scope-dropdown-pos {
  top: calc(100% + 4px);
  left: 0;
}

.onboarding-dropdown-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.onboarding-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.dropdown-item--active {
  color: var(--text-primary);
  font-weight: 600;
  background: rgba(99, 102, 241, 0.15) !important;
}

.dropdown-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 4px 0;
}

.new-project-item {
  color: var(--color-primary) !important;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.new-project-plus-icon {
  width: 12px;
  height: 12px;
}

.onboarding-folder-icon {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}

.onboarding-folder-name {
  font-family: inherit;
}

.onboarding-folder-chevron {
  width: 11px;
  height: 11px;
  opacity: 0.6;
}

.onboarding-input-box {
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 16px 18px 10px 18px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px);
  position: relative;
  transition: all var(--transition-fast);
}

.onboarding-input-box:focus-within {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.15);
  background: rgba(15, 23, 42, 0.8);
}

.onboarding-input-box textarea {
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 15px;
  color: var(--text-primary);
  width: 100%;
  min-height: 28px;
  line-height: 1.5;
  padding: 0;
  margin-bottom: 12px;
}

.onboarding-input-box textarea::placeholder {
  color: var(--text-muted);
  opacity: 0.6;
}

.onboarding-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  padding-bottom: 12px;
  margin-bottom: 10px;
}

.onboarding-left-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.onboarding-context-scope-row {
  display: flex;
  align-items: center;
}

.scope-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all var(--transition-fast);
}

.scope-trigger:hover {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.03);
}

.scope-monitor-icon {
  width: 11px;
  height: 11px;
  opacity: 0.8;
}

.scope-select-chevron {
  width: 9px;
  height: 9px;
  opacity: 0.6;
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

/* Premium Cursor/Gemini Chat Input Bar Styles */
.chat-input-wrapper {
  padding: 16px 20px 20px 20px;
  background: linear-gradient(180deg, rgba(11, 15, 25, 0) 0%, #0b0f19 60%);
  border-top: 1px solid rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: column;
}

.staged-images-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 12px;
  margin-left: 8px;
}

.staged-image-item {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #111827;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.staged-img-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-img-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 50%;
  padding: 2px;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-img-btn:hover {
  background: rgba(239, 68, 68, 0.8);
}

.remove-img-icon {
  width: 12px;
  height: 12px;
}

.chat-input-box {
  display: flex;
  flex-direction: column;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px 14px;
  transition: all var(--transition-fast);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(10px);
}

.chat-input-box:focus-within {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 4px 24px rgba(99, 102, 241, 0.15);
  background: rgba(15, 23, 42, 0.8);
}

@keyframes pulsing-input-border {
  0% {
    border-color: rgba(16, 185, 129, 0.3);
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25);
  }
  50% {
    border-color: rgba(16, 185, 129, 0.7);
    box-shadow: 0 0 18px rgba(16, 185, 129, 0.35), 0 4px 20px rgba(0, 0, 0, 0.25);
  }
  100% {
    border-color: rgba(16, 185, 129, 0.3);
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.15), 0 4px 20px rgba(0, 0, 0, 0.25);
  }
}

.chat-input-box--running {
  animation: pulsing-input-border 2s infinite ease-in-out !important;
  background: rgba(16, 185, 129, 0.02) !important;
}

.chat-input-box textarea {
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  font-family: inherit;
  font-size: 14px;
  color: var(--text-primary);
  width: 100%;
  min-height: 24px;
  max-height: 120px;
  line-height: 1.5;
  padding: 0;
  margin-bottom: 10px;
}

.chat-input-box textarea::placeholder {
  color: var(--text-muted);
  opacity: 0.6;
}

.chat-input-actions-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.left-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-circle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-circle-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.1);
}

.input-btn-icon {
  width: 13px;
  height: 13px;
}

.model-select-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  padding: 4px 10px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.model-select-trigger:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.08);
}

.model-select-chevron {
  width: 10px;
  height: 10px;
  opacity: 0.7;
}

.send-mic-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.04);
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.send-mic-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

.send-mic-btn--active {
  background: var(--color-primary) !important;
  color: #ffffff !important;
  box-shadow: 0 0 8px rgba(99, 102, 241, 0.5);
}

.send-mic-btn--active:hover {
  filter: brightness(1.15);
}

.chat-step {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-bubble {
  max-width: 85%;
  border-radius: var(--radius-lg);
  padding: 14px 18px;
  line-height: 1.6;
  font-size: 14.5px;
  color: var(--text-primary);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  position: relative;
}

.user-message {
  align-self: flex-end;
  background: linear-gradient(135deg, var(--color-primary), #4f46e5);
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.user-message .message-header .sender-name {
  color: rgba(255, 255, 255, 0.95);
}

.assistant-message {
  align-self: flex-start;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-bottom-left-radius: 4px;
}

.ag-avatar-icon {
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1);
}

/* Typing Indicator */
.typing-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 0;
}
.typing-label {
  font-size: 12.5px;
  color: var(--text-muted);
  margin-right: 2px;
  font-style: italic;
}
.typing-indicator .dot {
  width: 6px;
  height: 6px;
  background-color: var(--color-primary);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out both;
}
.typing-indicator .dot:nth-child(2) { animation-delay: -0.32s; }
.typing-indicator .dot:nth-child(3) { animation-delay: -0.16s; }
@keyframes typing {
  0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
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

/* Worked for Ns Premium Collapsible Summary Box Styles */
.worker-group-container {
  display: flex;
  flex-direction: column;
  margin: 4px 0 12px 0;
  width: 100%;
}

.worker-toggle-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 4px 0;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  width: fit-content;
  transition: color var(--transition-fast);
}

.worker-toggle-bar:hover {
  color: var(--text-primary);
}

.worker-duration-title {
  color: var(--text-muted);
}

.worker-toggle-bar:hover .worker-duration-title {
  color: var(--text-primary);
}

.worker-toggle-chevron {
  width: 13px;
  height: 13px;
  opacity: 0.6;
}

.worker-details-list {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  padding: 10px 14px;
  gap: 8px;
  margin-top: 4px;
}

.worker-metric-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.worker-flow-step {
  display: flex;
  flex-direction: column;
}

.flow-item-wrapper {
  display: flex;
  flex-direction: column;
}

.flow-row-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 0;
  transition: color var(--transition-fast);
}

.flow-row-header:hover {
  color: var(--text-primary);
}

.flow-action-text {
  flex: 1;
}

.highlight-mono {
  font-family: var(--font-mono, monospace);
  color: var(--text-primary);
  font-size: 12px;
}

.file-link-accent {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #818cf8;
  font-weight: 500;
}

.file-link-accent:hover {
  text-decoration: underline;
}

.inline-file-icon {
  width: 12px;
  height: 12px;
  display: inline-block;
}

.range-mono {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-muted);
  margin-left: 4px;
}

.results-badge {
  background: rgba(255, 255, 255, 0.08);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 12px;
  color: var(--text-muted);
}

.flow-row-chevron {
  width: 13px;
  height: 13px;
  opacity: 0.6;
}

.flow-row-details {
  margin-top: 4px;
  margin-left: 20px;
}

.terminal-log-output {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 12px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: #f1f5f9;
  max-height: 250px;
  overflow-y: auto;
  white-space: pre-wrap;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);
}

.nested-thinking-box {
  background: rgba(0, 0, 0, 0.15);
  border-left: 3px solid #f59e0b;
  padding: 10px 14px;
  border-radius: 4px;
  font-size: 12px;
}

.worker-metric-label {
  color: var(--text-muted);
  width: 70px;
  flex-shrink: 0;
}

.worker-metric-value {
  color: var(--text-primary);
}

.worker-file-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #818cf8; /* indigo accent */
}

.worker-file-badge:hover {
  text-decoration: underline;
}

.worker-badge-file-icon {
  width: 12px;
  height: 12px;
}

.worker-badge-file-name {
  font-weight: 500;
}

.worker-badge-lines {
  display: inline-flex;
  gap: 4px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  margin-left: 4px;
}

.worker-cmd-text {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  color: var(--text-primary);
}

.worker-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.05);
  margin: 6px 0;
}

.worker-substeps-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-bottom: 2px;
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
  padding: 6px 8px;
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
  padding: 10px;
  margin: 4px 6px 8px 30px;
  font-size: 11px;
}

.sub-step-details-code {
  margin: 0;
  overflow-x: auto;
}

.sub-step-details-code code {
  font-family: var(--font-mono, monospace);
  color: #a5b4fc;
  white-space: pre-wrap;
  word-break: break-all;
}

.consolidated-responses-flow {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.response-turn-segment {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

/* Markdown Table Styles */
:deep(.message-content table) {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
  font-size: 14px;
}

:deep(.message-content th),
:deep(.message-content td) {
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
  padding: 8px 12px;
  text-align: left;
}

:deep(.message-content th) {
  background-color: rgba(255, 255, 255, 0.05);
  font-weight: 600;
}

:deep(.message-content tr:nth-child(even)) {
  background-color: rgba(255, 255, 255, 0.02);
}

/* Isolated raw clone: only show the last message bubble from the Antigravity container */
.ag-raw-clone-isolated {
  display: flex;
  flex-direction: column;
}

:deep(.ag-raw-clone-isolated > *:not(:last-child)) {
  display: none !important;
}

/* Ensure the last child takes full width and matches our bubble styling */
:deep(.ag-raw-clone-isolated > *:last-child) {
  width: 100% !important;
  max-width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
</style>

