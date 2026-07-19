<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AgButton from '../components/AgButton.vue';
import AgSpinner from '../components/AgSpinner.vue';
import { authService } from '../services/auth';

const router = useRouter();
const password = ref('');
const loading = ref(false);
const error = ref('');

const handleLogin = async () => {
  if (!password.value.trim()) {
    error.value = 'Password tidak boleh kosong.';
    return;
  }
  loading.value = true;
  error.value = '';

  const result = await authService.login(password.value);
  loading.value = false;

  if (result.success) {
    router.replace('/');
  } else {
    error.value = result.error || 'Password salah.';
  }
};
</script>

<template>
  <div class="login-page">
    <!-- Animated background orbs -->
    <div class="orb orb--1"></div>
    <div class="orb orb--2"></div>
    <div class="orb orb--3"></div>

    <div class="login-card">
      <div class="login-header">
        <div class="logo">🔮</div>
        <h1>Antigravity Remote</h1>
        <p class="subtitle">Enter your password to continue</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <div class="input-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="••••••••••••"
            autocomplete="current-password"
            :disabled="loading"
            @keyup.enter="handleLogin"
          />
        </div>

        <Transition name="slide-error">
          <div v-if="error" class="error-banner">
            <span>⚠</span> {{ error }}
          </div>
        </Transition>

        <AgButton
          type="submit"
          variant="primary"
          :disabled="loading"
          class="login-btn"
        >
          <AgSpinner v-if="loading" size="sm" />
          <span v-else>Sign In</span>
        </AgButton>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  position: relative;
  overflow: hidden;
}

/* Ambient glowing orbs */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.25;
  animation: pulse 8s ease-in-out infinite;
}
.orb--1 {
  width: 500px; height: 500px;
  background: radial-gradient(circle, #6366f1, transparent);
  top: -100px; left: -100px;
  animation-delay: 0s;
}
.orb--2 {
  width: 400px; height: 400px;
  background: radial-gradient(circle, #8b5cf6, transparent);
  bottom: -100px; right: -50px;
  animation-delay: 3s;
}
.orb--3 {
  width: 300px; height: 300px;
  background: radial-gradient(circle, #06b6d4, transparent);
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: 5s;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.25; }
  50% { transform: scale(1.15); opacity: 0.35; }
}

/* Login Card */
.login-card {
  position: relative;
  z-index: 1;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: 48px 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
  animation: float-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes float-in {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.login-header {
  text-align: center;
  margin-bottom: 36px;
}

.logo {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
  filter: drop-shadow(0 0 16px rgba(99, 102, 241, 0.6));
  animation: logo-pulse 3s ease-in-out infinite;
}

@keyframes logo-pulse {
  0%, 100% { filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.5)); }
  50% { filter: drop-shadow(0 0 24px rgba(99, 102, 241, 0.9)); }
}

.login-header h1 {
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(135deg, #ffffff 0%, #9ca3af 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 8px;
}

.subtitle {
  font-size: 14px;
  color: var(--text-muted);
}

/* Form */
.login-form {
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
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.input-group input {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  color: var(--text-primary);
  font-size: 16px;
  letter-spacing: 2px;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.input-group input::placeholder {
  letter-spacing: 0;
  color: var(--text-muted);
}

.input-group input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.input-group input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-btn {
  width: 100%;
  padding: 14px;
  font-size: 15px;
  font-weight: 600;
  margin-top: 4px;
}

/* Error */
.error-banner {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 13px;
  color: var(--color-danger);
  display: flex;
  align-items: center;
  gap: 8px;
}

.slide-error-enter-active,
.slide-error-leave-active {
  transition: all var(--transition-fast);
}
.slide-error-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.slide-error-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
