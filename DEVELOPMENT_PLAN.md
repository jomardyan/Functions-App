# Serverless Platform Development Plan

Based on the [Serverless Function Platform Design Document](./serverless-platform-complete-design.md), this plan outlines the phased implementation strategy for building the platform.

## Phase 1: Core Infrastructure & Runtime (Weeks 1-4)
**Goal:** Establish the execution engine capable of running a single function.

### 1.1 Kubernetes Foundation
- [ ] Set up K8s cluster (local Minikube/Kind for dev, EKS/GKE for prod).
- [ ] Configure namespaces for tenant isolation (`platform-system`, `tenant-default`).
- [ ] Install core controllers:
    - [ ] Knative Serving (for autoscaling & networking).
    - [ ] Istio or Kourier (Ingress networking).
    - [ ] Prometheus & Grafana (Metrics foundation).

### 1.2 Function Runtime Layer
- [ ] Create base container images for supported runtimes:
    - [ ] Node.js 18/20
    - [ ] Python 3.9/3.11
    - [ ] Go 1.20
- [x] Implement the **Function Pod Lifecycle Manager**:
    - [ ] Sidecar proxy for log collection.
    - [ ] Init containers for code injection.
- [x] Develop the **Runtime Interface**:
    - [x] Standardize event object structure (JSON).
    - [x] Standardize context object (request ID, timeout, secrets).
    - [x] Standardize execution context structure (instanceId, tenant, bindings)

### 1.3 Basic Deployment API
- [ ] Create the `Deployment Service` (Control Plane):
    - [x] API to accept function code (zip/git).
    - [x] Build pipeline (Kaniko or Tekton) to convert code -> container image.
    - [x] Registry integration to push images.

---

## Phase 2: API Gateway & Event Routing (Weeks 5-8)
**Goal:** Allow external traffic to trigger functions securely.

### 2.1 API Gateway Implementation
- [ ] Deploy Kong or Envoy as the edge gateway.
- [x] Implement **Routing Logic**:
    - [x] Map HTTP paths (`/api/v1/users`) to internal K8s services.
    - [x] Handle method filtering (GET/POST).
- [x] Implement **Rate Limiting**:
    - [x] Redis-backed sliding window limiter.
    - [x] Per-tenant and per-function limits.

### 2.2 Authentication & Authorization
- [x] Implement **Gateway Auth**:
    - [x] API Key validation middleware.
    - [x] JWT validation middleware (OIDC).
- [ ] Create **Metadata Service**:
    - [ ] Store tenant info, API keys, and user roles.
    - [ ] RBAC enforcement logic.

### 2.3 Event Sources (Async)
- [ ] Integrate a Message Queue (NATS JetStream or Kafka).
- [ ] Build **Event Dispatcher**:
    - [ ] Consume messages from queue.
    - [ ] Invoke functions via internal HTTP.
    - [ ] Handle retries and Dead Letter Queues (DLQ).

---

## Phase 3: Frontend Management Console (Weeks 9-12)
**Goal:** Provide a UI for developers to manage and monitor functions.

### 3.1 Dashboard Shell & Navigation
- [ ] Initialize React/Next.js project.
- [ ] Implement Authentication (Login/SSO).
- [ ] Create Layout (Sidebar, Header, Project Switcher).

### 3.2 Function Management UI
- [x] **Function List View**: Status, runtime, last invoked.
- [x] **Function Editor (Monaco Editor)**:
    - [x] Syntax highlighting.
    - [x] Save & Deploy buttons.
    - [x] Test tab (send mock JSON payloads with auth support).
- [x] **Configuration Screens**:
    - [x] HTTP Trigger configuration (path, method).
    - [x] CRON Trigger configuration (schedule format).
    - [x] Environment variables editor (add/edit/delete).
    - [x] Memory and timeout sliders.

### 3.3 Observability UI
- [x] **Metrics Dashboard**:
    - [x] Real-time metrics (invocations, active functions, error rate, latency).
    - [x] Estimated cost calculation based on usage.
    - [x] Charts for Invocation Volume (24h) and Latency p95.
- [x] **Logs Viewer**:
    - [x] Real-time log streaming with filtering (by level).
    - [x] Log search functionality.
    - [x] Timestamp display for each log entry.
- [x] **Function-Level Metrics**:
    - [x] Per-function invocation volume chart.
    - [x] Per-function error rate visualization.
    - [x] Per-function latency distribution.

---

## Phase 4: Advanced Features & Polish (Weeks 13-16)
**Goal:** Production readiness, billing, and developer experience.

### 4.1 Bindings & Integrations
- [ ] Implement **Binding Injector**:
    - [ ] Logic to inject DB credentials/clients into runtime.
    - [x] Logic to inject DB credentials/clients into runtime.
    - [x] Create Connectors for:
    - [ ] S3/MinIO (Object Storage).
    - [ ] PostgreSQL/MongoDB.
    - [ ] Redis.
    - [x] S3/MinIO (basic simulation in platform runtime).
    - [x] PostgreSQL (mock query support).

### 4.2 Billing & Cost Management
- [ ] Implement **Usage Metering**:
    - [ ] Aggregator for execution time (ms) and memory (GB).
- [ ] Create **Billing Dashboard**:
    - [ ] Current month cost estimation.
    - [ ] Budget alerts.

### 4.3 Developer Tools (CLI)
- [ ] Develop CLI tool (`fn-cli`):
    - [ ] `fn deploy`: Deploy from local folder.
    - [ ] `fn logs`: Tail logs in terminal.
    - [ ] `fn init`: Create new project from template.

### 4.4 Security Hardening
- [ ] Network Policies (deny-all by default).
- [ ] mTLS between internal services.
- [ ] Secret encryption at rest (Vault integration).

### Runtime Improvements
- [x] Basic concurrency enforcement (per-function `maxConcurrent`)
- [x] Basic execution metrics collection: `invocations24h`, `REPORT` logs

---

## Phase 5: Launch & Operations (Weeks 17+)
**Goal:** Go live and maintain stability.

- [ ] Load Testing (k6/Artillery) to validate autoscaling.
- [ ] Disaster Recovery Drills (simulate AZ failure).
- [ ] Documentation (User Guides, API Reference).
- [ ] Beta Launch (Invite-only).
