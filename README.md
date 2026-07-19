# Antigravity Remote (ag-remote)

A modular web control center and OpenAPI Provider for [Antigravity](https://antigravity.dev) sessions. Control your agent runs from a beautiful, responsive web UI (built with Vue 3) and integrate Antigravity into other tools through a fully documented OpenAPI REST & WebSocket interface.

## 🚀 Key Features

1. **Remote Web Interface**:
   - Live stream conversations, agent thoughts, plans, and outputs.
   - Interactive prompt composition with multi-image support.
   - Remote action gates (accept, deny, or customize command executions, file modifications, etc.).
2. **OpenAPI Provider Layer**:
   - Turn your local Antigravity instance into an API-driven agent.
   - Standard REST endpoints to list, start, and manage agent cascades.
   - Real-time event streaming via SSE (Server-Sent Events) or WebSockets.
3. **Fully Modular Architecture**:
   - Clean separation of concerns with short, focused files.
   - Reusable Vue components with isolated scoped styles.
   - Structured backend codebase grouping routes, controllers, and services.

---

## 🛠️ Tech Stack & Directory Structure

We use a modern, lightweight, and performant tech stack designed for speed and modularity:

* **Backend**: Node.js, Fastify (TypeScript), Chrome DevTools Protocol (`chrome-remote-interface`).
* **Frontend**: Vue 3 (Composition API + `<script setup>`), Vite, Vanilla CSS.
* **API Documentation**: OpenAPI 3.0 via `@fastify/swagger` and `@fastify/swagger-ui`.

```text
ag-server/
├── backend/                  # Fastify Server (TypeScript)
│   ├── src/
│   │   ├── config/           # Environment & Constants setup
│   │   ├── services/         # CDP Connection, Agent Manager, API Provider
│   │   ├── routes/           # REST & WebSocket Route definitions
│   │   ├── controllers/      # Route request/response handlers
│   │   ├── types/            # TypeScript type definitions
│   │   └── index.ts          # Server Entrypoint
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                 # Vue 3 Frontend (Vite)
│   ├── src/
│   │   ├── assets/           # Static assets, fonts, icons
│   │   ├── styles/           # Global styles & Design system variables
│   │   ├── components/       # Shared UI components (Button, Modal, Card, etc.)
│   │   ├── views/            # Dashboard main views (Chat, History, API Keys)
│   │   ├── services/         # API & WebSocket client wrappers
│   │   ├── App.vue
│   │   └── main.ts
│   ├── package.json
│   └── vite.config.ts
│
├── references/               # Similar reference implementations
├── README.md                 # Project Overview (This file)
└── GEMINI.md                 # Agent instructions and standards
```

---

## 🏎️ Getting Started

*(Instructions will be expanded as implementation progresses)*

### Prerequisites
- Node.js 18+
- Antigravity running with remote debugging port enabled:
  ```bash
  open -a Antigravity --args --remote-debugging-port=9000
  ```

### Backend Setup
1. Navigate to `/backend`:
   ```bash
   cd backend
   npm install
   npm run dev
   ```
2. Open `http://localhost:3000/docs` to view the interactive OpenAPI documentation.

### Frontend Setup
1. Navigate to `/frontend`:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173` to access the remote dashboard.
