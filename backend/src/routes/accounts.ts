import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// data directory at the project root
const dataDir = path.resolve(__dirname, '../../../data');
const accountsFile = path.join(dataDir, 'accounts.json');

export interface Account {
  id: string;
  email: string;
  refreshToken: string;
  isActive: boolean;
}

// Ensure data directory and accounts.json exist
async function ensureAccountsFile() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(accountsFile);
    } catch {
      await fs.writeFile(accountsFile, JSON.stringify([]));
    }
  } catch (error) {
    console.error('Failed to initialize accounts.json', error);
  }
}

async function readAccounts(): Promise<Account[]> {
  await ensureAccountsFile();
  try {
    const data = await fs.readFile(accountsFile, 'utf-8');
    return JSON.parse(data) as Account[];
  } catch {
    return [];
  }
}

async function writeAccounts(accounts: Account[]) {
  await ensureAccountsFile();
  await fs.writeFile(accountsFile, JSON.stringify(accounts, null, 2));
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
      const accounts = await readAccounts();
      // Omit refresh tokens for frontend
      return { accounts: accounts.map(a => ({ id: a.id, email: a.email, isActive: a.isActive })) };
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
          },
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { email, refreshToken } = request.body as { email: string; refreshToken: string };
      const accounts = await readAccounts();
      
      const existingAccount = accounts.find(a => a.email === email);
      if (existingAccount) {
        existingAccount.refreshToken = refreshToken;
        await writeAccounts(accounts);
        return { account: { id: existingAccount.id, email: existingAccount.email, isActive: existingAccount.isActive } };
      }
      
      const newAccount: Account = {
        id: crypto.randomUUID(),
        email,
        refreshToken,
        isActive: accounts.length === 0, // Make active if it's the first account
      };
      
      accounts.push(newAccount);
      await writeAccounts(accounts);
      
      return { account: { id: newAccount.id, email: newAccount.email, isActive: newAccount.isActive } };
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
      const accounts = await readAccounts();
      
      const accountExists = accounts.some(a => a.id === accountId);
      if (!accountExists) {
        return reply.code(404).send({ error: 'Account not found' });
      }
      
      const updatedAccounts = accounts.map(a => ({
        ...a,
        isActive: a.id === accountId
      }));
      
      await writeAccounts(updatedAccounts);
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
      const accounts = await readAccounts();
      
      const filteredAccounts = accounts.filter(a => a.id !== id);
      
      // If we deleted the active account, make the first one active if available
      const hadActive = filteredAccounts.some(a => a.isActive);
      if (!hadActive && filteredAccounts.length > 0) {
        filteredAccounts[0].isActive = true;
      }
      
      await writeAccounts(filteredAccounts);
      return { ok: true };
    }
  );
}
