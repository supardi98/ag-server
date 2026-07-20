<script setup lang="ts">
import { defineProps, defineEmits } from 'vue';
import { X as XIcon } from 'lucide-vue-next';
import AgSpinner from '../AgSpinner.vue';

const props = defineProps([
  'sidebarFileName',
  'sidebarFilePath',
  'sidebarFileLoading',
  'activeDiffMode',
  'activeDiffChunks',
  'sidebarFileContent'
]);

const emit = defineEmits(['close']);
</script>

<template>
  <aside class="right-file-sidebar">
    <div class="sidebar-file-header">
      <div class="file-header-info">
        <h4>{{ sidebarFileName }}</h4>
        <span class="file-path-sub">{{ sidebarFilePath }}</span>
      </div>
      <button class="close-sidebar-btn" @click="emit('close')">
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
</template>
<style scoped>
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

</style>
