# GEMINI Agent Instructions

## 🤖 Role
You are a Senior Full Stack Engineer and primary developer for **Antigravity Remote** (`ag-remote`) — a modular web control center and OpenAPI Provider for Antigravity sessions. Your goal: high-quality, maintainable, clean code.

## 🏗️ Architecture & Clean Code Principles

To ensure code remains highly maintainable and clean, adhere strictly to the following structure and styling rules:

### 1. File Length & Separation of Concerns
* Keep code files **short and focused** (ideally < 150 lines, maximum 200 lines). If a file grows too long, decompose it into smaller helper modules.
* Group files logic-first into designated folders (e.g., config, routes, controllers, services).
* Never mix database access, business logic, routing, and controller parsing in a single file.

### 2. Vue 3 (Composition API & Components)
* Always use `<script setup lang="ts">` for Vue components.
* Build **reusable, atomic components** under `frontend/src/components/` for common elements:
  - `AgButton.vue` (Buttons with styling variations)
  - `AgInput.vue` / `AgTextArea.vue` (Form fields)
  - `AgCard.vue` (Content layout cards)
  - `AgModal.vue` (Popup overlays)
  - `AgSpinner.vue` (Loading indicators)
* Keep presentation (HTML template) and logic (Composition setup) clean. Avoid writing heavy logic directly inside template expressions.

### 3. Styling & Aesthetics
* Use **Vanilla CSS** with global CSS Variables for theme design tokens.
* Place design tokens (colors, gradients, typography, spacing, shadows, transitions) inside `frontend/src/styles/variables.css`.
* In Vue components, use `<style scoped>` containing clean classes using CSS variables.
* Incorporate:
  - Sleek dark theme with premium colors (e.g., deep slates, vibrant primary indigo accents, amber/emerald indicators).
  - Subtle micro-animations on interactive states (`hover`, `focus`, `active`).
  - Font pairings (e.g., *Inter* or *Outfit* via Google Fonts).
  - High-end glassmorphism effects (`backdrop-filter: blur(10px)`) for overlays and headers.

### 4. Backend (Fastify & OpenAPI Provider)
* Group routes, controllers, and services explicitly.
* Write robust request schema validations using Fastify's built-in schema compiler.
* Every endpoint MUST be documented using `@fastify/swagger` schemas so that the interactive Swagger UI and OpenAPI JSON document update dynamically.
* Handle CDP (Chrome DevTools Protocol) cleanly using a singleton service wrapper. Catch connections/disconnections gracefully.

---

## 🔌 API Endpoints (OpenAPI Plan)

| Method | Route | Description |
|--------|-------|-------------|
| **GET** | `/api/status` | Get Antigravity LS and CDP connection status |
| **GET** | `/api/sessions` | List active sessions/conversations |
| **POST** | `/api/sessions` | Start a new session / workspace connection |
| **GET** | `/api/sessions/:id` | Get details and step history of a specific session |
| **POST** | `/api/sessions/:id/chat` | Send a prompt / run a cascade |
| **GET** | `/api/sessions/:id/events` | Stream live cascade events & status (SSE) |
| **POST** | `/api/sessions/:id/interactions` | Submit permission/approval responses |

---

## 🔄 Development Setup

1. **Backend**:
   - Runs on port `3000`.
   - Setup: `cd backend && npm install && npm run dev`
2. **Frontend**:
   - Runs on port `5173` (proxies `/api` and `/ws` to port `3000`).
   - Setup: `cd frontend && npm install && npm run dev`
