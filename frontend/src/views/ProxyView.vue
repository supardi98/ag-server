<template>
  <div class="page-container">
    <header class="page-header">
      <h2><span class="icon-link"><LinkIcon /></span> Multi-Protocol Support</h2>
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

    <!-- Models & Integration Tabs -->
    <div class="models-integration-container">
      <div class="tabs-header-container">
        <h3 :class="{'active-tab': activeTab === 'models'}" @click="activeTab = 'models'">>_ SUPPORTED MODELS</h3>
        <h3 :class="{'active-tab': activeTab === 'integration'}" @click="activeTab = 'integration'">>_ QUICK INTEGRATION</h3>
      </div>

      <!-- Supported Models List -->
      <div v-show="activeTab === 'models'" class="models-section">
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
      <div v-show="activeTab === 'integration'" class="integration-section">
        <div class="integration-header">
          <h3 class="integration-title">Integration Code</h3>
          <select class="integration-select" v-model="integrationType">
            <option value="python">Python (OpenAI SDK)</option>
            <option value="cli">CLI (cURL)</option>
          </select>
        </div>
        <div class="code-block-container">
          <button class="copy-code-btn" @click="copyIntegrationCode">Copy Code</button>
          <pre class="code-block"><code>{{ integrationCode }}</code></pre>
        </div>
        <div class="test-section" style="margin-top: 16px;">
          <button class="run-test-btn" @click="runTest" :disabled="isTesting">
            <span v-if="!isTesting">▶ Run Test</span>
            <span v-else>Running...</span>
          </button>
          <div v-if="testResult" class="test-result-container">
            <pre class="test-result">{{ testResult }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAccountStore } from '../composables/useAccountStore';
import { Link as LinkIcon } from 'lucide-vue-next';

const activeTab = ref('models');
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
    return `curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your-proxy-api-key" \\
  -d '{
    "model": "gemini-2.5-flash",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`;
  }
  return '';
});

const copyIntegrationCode = () => {
  navigator.clipboard.writeText(integrationCode.value);
};

const isTesting = ref(false);
const testResult = ref('');

const runTest = async () => {
  isTesting.value = true;
  testResult.value = '';
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer your-proxy-api-key'
      },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Hello! Please reply with exactly "Hello World".' }]
      })
    });
    
    const data = await res.json();
    testResult.value = JSON.stringify(data, null, 2);
  } catch (err: any) {
    testResult.value = `Error: ${err.message}`;
  } finally {
    isTesting.value = false;
  }
};
</script>

<style scoped>
.page-container {
  padding: 32px;
  background-color: var(--bg-default);
  color: var(--text-primary);
  height: 100%;
  overflow-y: auto;
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
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
}
.icon-link svg {
  width: 24px;
  height: 24px;
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
.models-integration-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tabs-header-container {
  display: flex;
  gap: 32px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.tabs-header-container h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  padding-bottom: 12px;
  margin: 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tabs-header-container h3:hover {
  color: var(--text-primary);
}

.tabs-header-container h3.active-tab {
  color: #3b82f6;
  border-bottom: 2px solid #3b82f6;
}

/* Models Section */
.models-section {
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

.test-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.run-test-btn {
  align-self: flex-start;
  padding: 8px 16px;
  background: var(--primary-color, #4f46e5);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.run-test-btn:hover:not(:disabled) {
  background: var(--primary-hover, #4338ca);
  transform: translateY(-1px);
}
.run-test-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.test-result-container {
  background: #1e1e2e;
  border-radius: 8px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
}
.test-result {
  margin: 0;
  font-family: monospace;
  font-size: 13px;
  color: #a6accd;
  white-space: pre-wrap;
}
</style>
