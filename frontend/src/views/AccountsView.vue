<template>
  <div class="page-container">
    <header class="page-header">
      <h2>Account Manager</h2>
      <p class="subtitle">Kelola credential, token, dan konfigurasi API key global.</p>
    </header>

    <div class="content-body">
      <AgCard>
        <template #header>Credentials & API Keys</template>
        <div class="placeholder-content">
          <span class="icon">👥</span>
          <p>Fitur Account Manager dalam pengembangan.</p>
        </div>
      </AgCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import AgCard from '../components/AgCard.vue';
</script>

<style scoped>
.page-container {
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
.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  gap: 16px;
  color: var(--text-muted);
}
.icon {
  font-size: 48px;
}
</style>
