import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import crypto from 'crypto';
import { getAccessTokenFromRefresh } from '../services/oauth.js';
import { fetchLiveQuota } from '../services/quota.js';
import { dbService } from '../services/db.js';

export interface Account {
  id: string;
  email: string;
  refreshToken: string;
  isActive: boolean;
  isDisabled?: boolean;
  last_used?: number;
  custom_label?: string;
  quota?: any;
}

export async function accountsRoutes(fastify: FastifyInstance) {
  // GET /api/accounts
  fastify.get(
    '/api/accounts',
    {
      schema: {
        description: 'List all accounts',
        tags: ['accounts'],
      },
      preHandler: requireAuth,
    },
    async () => {
      const accounts = dbService.getAllAccounts();
      return { 
        accounts: accounts.map(a => ({ 
          id: a.id, 
          email: a.email, 
          isActive: a.isActive,
          isDisabled: a.isDisabled,
          last_used: a.last_used,
          custom_label: a.custom_label,
          quota: a.quota
        })) 
      };
    }
  );

  // POST /api/accounts
  fastify.post(
    '/api/accounts',
    {
      schema: {
        description: 'Add a new account using a refresh token',
        tags: ['accounts'],
        body: {
          type: 'object',
          required: ['email', 'refreshToken'],
          properties: {
            email: { type: 'string' },
            refreshToken: { type: 'string' },
            last_used: { type: 'number', nullable: true },
            custom_label: { type: 'string', nullable: true },
            quota: { type: 'object', additionalProperties: true, nullable: true },
          },
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { email, refreshToken, last_used, custom_label, quota } = request.body as any;
      const accounts = dbService.getAllAccounts();
      
      const existingAccount = accounts.find(a => a.email === email);
      if (existingAccount) {
        dbService.upsertAccount({
          ...existingAccount,
          refreshToken,
          last_used: last_used !== undefined ? last_used : existingAccount.last_used,
          custom_label: custom_label !== undefined ? custom_label : existingAccount.custom_label,
          quota: quota !== undefined ? quota : existingAccount.quota
        });
        
        const updated = dbService.getAccount(existingAccount.id)!;
        return { 
          account: { 
            id: updated.id, 
            email: updated.email, 
            isActive: updated.isActive,
            isDisabled: updated.isDisabled,
            last_used: updated.last_used,
            custom_label: updated.custom_label,
            quota: updated.quota
          } 
        };
      }
      
      const newAccount: Account = {
        id: crypto.randomUUID(),
        email,
        refreshToken,
        isActive: accounts.length === 0,
        last_used,
        custom_label,
        quota
      };
      
      dbService.upsertAccount(newAccount);
      
      return { 
        account: { 
          id: newAccount.id, 
          email: newAccount.email, 
          isActive: newAccount.isActive,
          isDisabled: newAccount.isDisabled,
          last_used: newAccount.last_used,
          custom_label: newAccount.custom_label,
          quota: newAccount.quota
        } 
      };
    }
  );

  // POST /api/accounts/export
  fastify.post(
    '/api/accounts/export',
    {
      schema: {
        description: 'Export accounts as JSON',
        tags: ['accounts'],
        body: {
          type: 'object',
          properties: {
            ids: { type: 'array', items: { type: 'string' }, nullable: true }
          }
        }
      },
      preHandler: requireAuth,
    },
    async (request) => {
      const { ids } = request.body as { ids?: string[] } || {};
      const allAccounts = dbService.getAllAccounts();
      const exportData = ids && ids.length > 0 
        ? allAccounts.filter(a => ids.includes(a.id))
        : allAccounts;

      return { 
        accounts: exportData.map(a => ({
          email: a.email,
          refresh_token: a.refreshToken
        }))
      };
    }
  );

  // POST /api/accounts/switch
  fastify.post(
    '/api/accounts/switch',
    {
      schema: {
        description: 'Switch active account',
        tags: ['accounts'],
        body: {
          type: 'object',
          required: ['accountId'],
          properties: {
            accountId: { type: 'string' },
          },
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { accountId } = request.body as { accountId: string };
      const account = dbService.getAccount(accountId);
      
      if (!account) {
        return reply.code(404).send({ error: 'Account not found' });
      }
      
      dbService.clearActiveStatus();
      dbService.updateAccountStatus(accountId, { isActive: true });
      
      return { ok: true };
    }
  );

  // DELETE /api/accounts/:id
  fastify.delete(
    '/api/accounts/:id',
    {
      schema: {
        description: 'Delete an account',
        tags: ['accounts'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' }
          }
        }
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      
      const account = dbService.getAccount(id);
      if (!account) {
        return reply.code(404).send({ error: 'Account not found' });
      }
      
      dbService.deleteAccount(id);
      
      if (account.isActive) {
        const remaining = dbService.getAllAccounts();
        if (remaining.length > 0) {
          dbService.updateAccountStatus(remaining[0].id, { isActive: true });
        }
      }
      
      return { ok: true };
    }
  );

  // POST /api/accounts/:id/refresh-quota
  fastify.post(
    '/api/accounts/:id/refresh-quota',
    {
      schema: {
        description: 'Refresh the live quota for a specific account using its refresh token',
        tags: ['accounts'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      
      const account = dbService.getAccount(id);
      if (!account) {
        return reply.code(404).send({ error: 'Account not found' });
      }

      try {
        const tokenRes = await getAccessTokenFromRefresh(account.refreshToken);
        const quotaData = await fetchLiveQuota(tokenRes.access_token);
        
        dbService.updateAccountStatus(id, { 
          quota: quotaData, 
          last_used: Math.floor(Date.now() / 1000) 
        });
        
        return { ok: true, quota: quotaData };
      } catch (err: any) {
        return reply.code(500).send({ error: err.message || 'Failed to refresh quota' });
      }
    }
  );

  // POST /api/accounts/:id/toggle
  fastify.post(
    '/api/accounts/:id/toggle',
    {
      schema: {
        description: 'Enable or disable an account',
        tags: ['accounts'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['disabled'],
          properties: {
            disabled: { type: 'boolean' },
          },
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { disabled } = request.body as { disabled: boolean };
      
      const account = dbService.getAccount(id);
      if (!account) {
        return reply.code(404).send({ error: 'Account not found' });
      }
      
      dbService.updateAccountStatus(id, { isDisabled: disabled });
      return { ok: true, isDisabled: disabled };
    }
  );
}
