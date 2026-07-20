import { createRouter, createWebHistory } from 'vue-router';
import { authService } from '../services/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('../views/DashboardView.vue'),
    },
    {
      path: '/conversation/:id',
      name: 'conversation',
      component: () => import('../views/DashboardView.vue'),
    },
    {
      path: '/log',
      name: 'log',
      component: () => import('../views/LogView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: () => import('../views/AccountsView.vue'),
    },
    {
      path: '/proxy',
      name: 'proxy',
      component: () => import('../views/ProxyView.vue'),
    },
  ],
});

// Navigation guard — check auth before each route
router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  const { authenticated } = await authService.me();
  if (!authenticated) {
    return { name: 'login' };
  }
  return true;
});

export default router;
