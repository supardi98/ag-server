<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AgButton from '../components/AgButton.vue';
import AgCard from '../components/AgCard.vue';
import AgSpinner from '../components/AgSpinner.vue';
import { settingsService } from '../services/settings';

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const message = ref('');
const error = ref('');

const form = ref({
  antigravity_path: '',
  antigravity_port: '',
  auth_password: '',
});

const fetchSettings = async () => {
  loading.value = true;
  try {
    const data = await settingsService.getAll();
    form.value.antigravity_path = data.antigravity_path || 'antigravity';
    form.value.antigravity_port = data.antigravity_port || '9000';
    form.value.auth_password = ''; // Leave blank for security
  } catch (err: any) {
    error.value = 'Failed to load settings';
  } finally {
    loading.value = false;
  }
};

const handleSave = async () => {
  saving.value = true;
  message.value = '';
  error.value = '';

  try {
    const payload: Record<string, string> = {
      antigravity_path: form.value.antigravity_path,
      antigravity_port: form.value.antigravity_port,
    };

    // Only update password if user typed something
    if (form.value.auth_password.trim()) {
      payload.auth_password = form.value.auth_password;
    }

    const res = await settingsService.update(payload);
    if (res.rejected.length > 0) {
      error.value = `Failed to update: ${res.rejected.join(', ')}`;
    } else {
      message.value = 'Settings updated successfully!';
      form.value.auth_password = '';
    }
  } catch (err: any) {
    error.value = 'Failed to save settings';
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  fetchSettings();
});
</script>

<template>
  <div class="settings-page">
    <header class="page-header">
      <h2>Settings</h2>
      <p class="subtitle">Konfigurasi file path executable, port debugging, dan password web.</p>
    </header>

    <main class="app-main">
      <div class="settings-container">
        <AgCard>
          <template #header>Configuration</template>

          <div v-if="loading" class="loading-state">
            <AgSpinner size="md" />
            <p>Loading settings...</p>
          </div>

          <form v-else @submit.prevent="handleSave" class="settings-form">
            <div class="input-group">
              <label for="path">Antigravity Executable Path</label>
              <input
                id="path"
                v-model="form.antigravity_path"
                type="text"
                placeholder="e.g. /usr/bin/antigravity or antigravity"
                required
              />
              <span class="help-text">Lokasi path dari file executable Antigravity.</span>
            </div>

            <div class="input-group">
              <label for="port">CDP Debugging Port</label>
              <input
                id="port"
                v-model="form.antigravity_port"
                type="number"
                placeholder="9000"
                required
              />
              <span class="help-text">Port debugging yang digunakan (`--remote-debugging-port`).</span>
            </div>

            <div class="input-group">
              <label for="password">Change Web Access Password</label>
              <input
                id="password"
                v-model="form.auth_password"
                type="password"
                placeholder="••••••••"
              />
              <span class="help-text">Biarkan kosong jika tidak ingin mengubah password web.</span>
            </div>

            <div v-if="message" class="alert alert--success">{{ message }}</div>
            <div v-if="error" class="alert alert--danger">{{ error }}</div>

            <div class="form-actions">
              <AgButton type="submit" variant="primary" :disabled="saving">
                <AgSpinner v-if="saving" size="sm" />
                <span v-else>Save Settings</span>
              </AgButton>
            </div>
          </form>
        </AgCard>
      </div>
    </main>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 32px;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h2 {
  font-size: 24px;
  font-weight: 700;
}

.subtitle {
  color: var(--text-muted);
  font-size: 14px;
  margin-top: 4px;
}

.app-main {
  flex: 1;
  width: 100%;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0;
  gap: 16px;
  color: var(--text-muted);
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
}

.input-group input {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.input-group input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.help-text {
  font-size: 12px;
  color: var(--text-muted);
}

.alert {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.alert--success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: var(--color-success);
}

.alert--danger {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: var(--color-danger);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
</style>
