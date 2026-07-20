<template>
  <div class="page-container">
    <header class="page-header">
      <h2><span class="icon-link">🔗</span> Multi-Protocol Support</h2>
      <p class="subtitle">Seamlessly integrate with your favorite AI tools and CLIs</p>
      <p class="description">The local proxy supports OpenAI, Anthropic, and Gemini protocols, ensuring compatibility with a wide range of applications.</p>
    </header>

    <div class="protocols-grid">
      <!-- OpenAI Protocol -->
      <div class="protocol-card active-card">
        <div class="card-header">
          <h3 class="protocol-title openai">OpenAI Protocol</h3>
          <button class="copy-btn" @click="copyBaseUrl">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            COPY BASE
          </button>
        </div>
        <div class="endpoints-list">
          <div class="endpoint-item">/v1/chat/completions</div>
          <div class="endpoint-item">/v1/completions</div>
          <div class="endpoint-item blue-text">/v1/responses (Codex)</div>
        </div>
      </div>

      <!-- Anthropic Protocol -->
      <div class="protocol-card">
        <div class="card-header">
          <h3 class="protocol-title anthropic">Anthropic Protocol</h3>
          <button class="copy-icon-btn" @click="copyBaseUrl">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
        <div class="endpoints-list">
          <div class="endpoint-item placeholder-item">/v1/messages</div>
        </div>
      </div>

      <!-- Gemini Protocol -->
      <div class="protocol-card">
        <div class="card-header">
          <h3 class="protocol-title gemini">Gemini Protocol</h3>
          <button class="copy-icon-btn" @click="copyBaseUrl">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          </button>
        </div>
        <div class="endpoints-list">
          <div class="endpoint-item placeholder-item">/v1beta/models/...</div>
        </div>
      </div>
    </div>

    <!-- Models & Integration Row -->
    <div class="models-integration-row">
      <!-- Supported Models List -->
      <div class="models-section">
        <div class="models-header">
          <h3>>_ Supported Models & Integration</h3>
        </div>
        <div class="models-table-container">
          <table class="models-table">
            <thead>
              <tr>
                <th>Model Name</th>
                <th>Model ID</th>
                <th>Description</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="model in availableModels" :key="model.id">
                <td class="model-name">
                  <span class="bot-icon">🤖</span>
                  {{ model.name || model.id }}
                </td>
                <td class="model-id">{{ model.id }}</td>
                <td class="model-desc">{{ model.name || model.id }}</td>
                <td>
                  <button class="copy-code-action" @click="copyModelId(model.id)">
                    Copy
                  </button>
                </td>
              </tr>
              <tr v-if="availableModels.length === 0">
                <td colspan="4" class="no-data">No models available. Add accounts to see models.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Quick Integration Section -->
      <div class="integration-section">
        <div class="integration-header">
          <h3 class="integration-title">QUICK INTEGRATION</h3>
          <select class="integration-select" v-model="integrationType">
            <option value="python">Python (OpenAI SDK)</option>
            <option value="cli">CLI (cURL)</option>
          </select>
        </div>
        <div class="code-block-container">
          <button class="copy-code-btn" @click="copyIntegrationCode">Copy Code</button>
          <pre class="code-block"><code>{{ integrationCode }}</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAccountStore } from '../composables/useAccountStore';

const accountStore = useAccountStore();
const { accounts, fetchAccounts } = accountStore;

onMounted(() => {
  fetchAccounts();
});

const availableModels = computed(() => {
  const modelsMap = new Map();
  accounts.value.forEach((acc: any) => {
    if (acc.quota && Array.isArray(acc.quota.models)) {
      acc.quota.models.forEach((model: any) => {
        if (!modelsMap.has(model.id)) {
          modelsMap.set(model.id, model);
        }
      });
    }
  });
  return Array.from(modelsMap.values());
});

const integrationType = ref('python');
const baseUrl = window.location.origin;

const copyBaseUrl = () => {
  navigator.clipboard.writeText(baseUrl);
};

const copyModelId = (modelId: string) => {
  navigator.clipboard.writeText(modelId || 'gemini-model');
};

const integrationCode = computed(() => {
  if (integrationType.value === 'python') {
    return `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="your-proxy-api-key"
)

response = client.chat.completions.create(
    model="gemini-1.5-pro",
    messages=[{"role": "user", "content": "Hello"}]
)

print(response.choices[0].message.content)`;
  } else if (integrationType.value === 'cli') {
    return `curl ${baseUrl}/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-proxy-api-key" \
  -d '{
    "model": "gemini-1.5-pro",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;
  }
  return '';
});

const copyIntegrationCode = () => {
  navigator.clipboard.writeText(integrationCode.value);
};
</script>

<style scoped>
.page-container {
  padding: 32px;
  background-color: var(--bg-default);
  color: var(--text-primary);
  min-height: 100%;
}
.page-header {
  margin-bottom: 24px;
}
.page-header h2 {
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-link {
  font-size: 18px;
}
.subtitle {
  color: var(--text-muted);
  font-size: 14px;
  margin-top: 4px;
}
.description {
  color: var(--text-secondary);
  font-size: 14px;
  margin-top: 16px;
  margin-bottom: 24px;
}

.protocols-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.protocol-card {
  background: var(--card-bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
}
.active-card {
  border-color: #3b82f6;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.protocol-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}
.openai { color: #3b82f6; }
.anthropic { color: #a855f7; }
.gemini { color: #10b981; }

.copy-btn, .copy-code-action {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: #3b82f6;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.copy-btn:hover, .copy-code-action:hover { background: rgba(59, 130, 246, 0.1); }

.copy-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}
.copy-icon-btn:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }

.endpoints-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.endpoint-item {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: var(--text-secondary);
}
.blue-text {
  color: #3b82f6;
}
.placeholder-item {
  background: rgba(255, 255, 255, 0.05);
  padding: 6px 10px;
  border-radius: 4px;
  color: var(--text-muted);
}

/* Models & Integration Row */
.models-integration-row {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}
@media (max-width: 1024px) {
  .models-integration-row {
    flex-direction: column;
  }
}

/* Models Section */
.models-section {
  flex: 1;
  background: var(--card-bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.models-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}
.models-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.models-table-container {
  overflow-x: auto;
}
.models-table {
  width: 100%;
  border-collapse: collapse;
}
.models-table th {
  text-align: left;
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.models-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.model-name {
  color: var(--text-primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}
.bot-icon {
  font-size: 14px;
  opacity: 0.8;
}
.model-id, .model-desc {
  color: var(--text-secondary);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}
.no-data {
  text-align: center;
  color: var(--text-muted);
  padding: 24px !important;
}

/* Quick Integration Section */
.integration-section {
  flex: 0 0 400px;
  background: var(--card-bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}
.integration-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.integration-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin: 0;
  text-transform: uppercase;
}
.integration-select {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
}
.integration-select:focus {
  border-color: #3b82f6;
}
.integration-select option {
  background: #1a1d24;
  color: #e2e8f0;
}
.code-block-container {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  padding: 16px;
  border: 1px solid var(--border-color);
}
.code-block {
  margin: 0;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: #a5b4fc;
  white-space: pre-wrap;
  word-break: break-all;
}
.copy-code-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}
.copy-code-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
</style>
