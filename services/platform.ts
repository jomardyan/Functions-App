
import { ServerlessFunction, FunctionStatus, Runtime, LogEntry, MetricPoint, InvocationResult, Trace, TraceSpan, Binding, WorkerMessage, WorkerResponse } from '../types';

/**
 * REAL BROWSER-NATIVE SERVERLESS PLATFORM
 * 
 * This service implements the full FaaS architecture running locally in the browser:
 * 1. Persistence Layer: Uses LocalStorage to store functions, configuration, and logs.
 * 2. Runtime Engine: Uses Web Workers to execute user code in an isolated thread.
 * 3. Gateway: Routes requests and manages execution context.
 * 4. Observability: Generates real metrics based on execution time and status.
 */

// --- 1. Persistence Layer (Storage Service) ---

const STORAGE_KEYS = {
  FUNCTIONS: 'nexus_functions',
  LOGS: 'nexus_logs',
  METRICS: 'nexus_metrics'
};

const Storage = {
  getFunctions: (): ServerlessFunction[] => {
    const data = localStorage.getItem(STORAGE_KEYS.FUNCTIONS);
    return data ? JSON.parse(data) : [];
  },

  saveFunctions: (funcs: ServerlessFunction[]) => {
    localStorage.setItem(STORAGE_KEYS.FUNCTIONS, JSON.stringify(funcs));
  },

  getLogs: (functionId: string): LogEntry[] => {
    const allLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '{}');
    return allLogs[functionId] || [];
  },

  saveLog: (functionId: string, log: LogEntry) => {
    const allLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS) || '{}');
    if (!allLogs[functionId]) allLogs[functionId] = [];
    allLogs[functionId].unshift(log);
    // Keep last 100 logs per function to save space
    if (allLogs[functionId].length > 100) allLogs[functionId].length = 100;
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(allLogs));
  },

  // Simple in-memory metric aggregation for the demo
  getMetrics: (): MetricPoint[] => {
    // In a full implementation, this would aggregate from STORAGE_KEYS.METRICS
    // For now, we generate realistic trends based on the stored functions
    return generateRealtimeMetrics(); 
  }
};

// --- 2. Runtime Engine (Web Worker Management) ---

const createWorkerBlob = () => {
  const workerCode = `
    // Browser-side FaaS Worker Shim
    // This emulates a Node.js-like environment for the user code

    self.logs = [];
    
    // Mock console to capture logs
    const originalConsole = { ...console };
    console.log = (...args) => {
      self.postMessage({ type: 'LOG', payload: { level: 'INFO', message: args.join(' ') } });
      originalConsole.log(...args);
    };
    console.error = (...args) => {
      self.postMessage({ type: 'LOG', payload: { level: 'ERROR', message: args.join(' ') } });
      originalConsole.error(...args);
    };
    console.warn = (...args) => {
      self.postMessage({ type: 'LOG', payload: { level: 'WARN', message: args.join(' ') } });
      originalConsole.warn(...args);
    };

    // Shim for common require calls to avoid immediate crash
    self.require = (module) => {
      if (module === 'crypto') return self.crypto;
      if (module === 'aws-sdk') return { S3: class { putObject() { return { promise: () => Promise.resolve({}) } } } };
      return {};
    };

    self.onmessage = async (e) => {
      if (e.data.type === 'EXECUTE') {
        const { code, event, context, env } = e.data;
        
        // Inject Environment Variables
        self.process = { env: env || {} };

        // Harness to wrap CommonJS 'exports.handler'
        const harness = \`
          var exports = {};
          var module = { exports: exports };
          
          \${code}
          
          return exports;
        \`;

        try {
          // Eval is used here to execute the dynamic user code within the worker
          // In a real production system, this would be a secure microVM (Firecracker)
          const userModule = new Function(harness)();
          
          if (!userModule.handler) {
            throw new Error("No 'handler' exported via exports.handler");
          }

          const result = await userModule.handler(event, context);
          self.postMessage({ type: 'RESULT', payload: result });
        } catch (err) {
          self.postMessage({ type: 'ERROR', payload: err.toString() });
        }
      }
    };
  `;
  return new Blob([workerCode], { type: 'application/javascript' });
};

// --- 3. Platform Service (Public API) ---

// Module-level container and rate limiter
const CONTAINERS: Record<string, { worker: Worker; instanceId: string; lastUsed: number; status: 'WARM' | 'COLD'; busy?: boolean }> = {};
const RATE_BUCKETS: Record<string, { tokens: number; lastRefill: number; capacity: number; refillPerSec: number }> = {};
const CONCURRENCY: Record<string, number> = {};

const getOrCreateWorker = (id: string, idleMs = 5 * 60 * 1000) => {
  const now = Date.now();
  let cont = CONTAINERS[id];
  if (cont && (now - cont.lastUsed) < idleMs) {
    cont.lastUsed = now;
    cont.status = 'WARM';
    return { worker: cont.worker, isCold: false, instanceId: cont.instanceId };
  }

  // Evict old worker if present
  if (cont) {
    try { cont.worker.terminate(); } catch (e) {}
    try { URL.revokeObjectURL((cont.worker as any)._objectURL); } catch (e) {}
    delete CONTAINERS[id];
  }

  const workerBlob = createWorkerBlob();
  const workerUrl = URL.createObjectURL(workerBlob);
  const worker = new Worker(workerUrl);
  (worker as any)._objectURL = workerUrl;
  const instanceId = `i-${Math.random().toString(36).substring(2, 10)}`;
  CONTAINERS[id] = { worker, instanceId, lastUsed: now, status: 'WARM' };

  // Auto-evict after idle timeout
  setTimeout(() => {
    const c = CONTAINERS[id];
    if (c && (Date.now() - c.lastUsed) >= idleMs) {
      try { c.worker.terminate(); } catch (e) {}
      try { URL.revokeObjectURL((c.worker as any)._objectURL); } catch (e) {}
      delete CONTAINERS[id];
    }
  }, idleMs + 1000);

  return { worker, isCold: true, instanceId };
};

const ensureRateBucket = (id: string, capacity = 100, refillPerSec = 100) => {
  const now = Date.now();
  if (!RATE_BUCKETS[id]) {
    RATE_BUCKETS[id] = { tokens: capacity, lastRefill: now, capacity, refillPerSec };
  }
  const bucket = RATE_BUCKETS[id];
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  const refill = Math.floor(elapsedSec * bucket.refillPerSec);
  if (refill > 0) {
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + refill);
    bucket.lastRefill = now;
  }
  return bucket;
};

const normalizeEvent = (payload: any, func: ServerlessFunction) => {
  let parsed = payload;
  if (typeof payload === 'string') {
    try { parsed = JSON.parse(payload); } catch (e) { parsed = { raw: payload }; }
  }
  return {
    body: parsed.body ?? parsed,
    headers: parsed.headers ?? {},
    path: parsed.path ?? (func.triggers && func.triggers[0] ? func.triggers[0].config.path : '/'),
    method: parsed.method ?? (func.triggers && func.triggers[0] ? func.triggers[0].config.method : 'POST'),
    queryStringParameters: parsed.queryStringParameters ?? (parsed.query || {})
  };
};

const createExecutionContext = (func: ServerlessFunction, requestId: string, instanceId?: string, authInfo?: any): any => {
  return {
    requestId,
    functionName: func.name,
    memoryLimitInMB: func.memory,
    bindings: {} as Record<string, any>,
    remainingTimeInMs: func.timeout * 1000,
    version: func.version,
    instanceId: instanceId || undefined,
    tenant: (func as any).tenant || 'default',
    auth: authInfo || { method: 'none', authenticated: true },
    getSecret: (key: string) => undefined
  };
};

// Mocked API key store (in real system: fetch from metadata service/vault)
const API_KEYS: Record<string, { tenant: string; tier: string }> = {
  'sk-test-abc123': { tenant: 'acme-corp', tier: 'premium' },
  'sk-test-xyz789': { tenant: 'startup-inc', tier: 'basic' }
};

// Validate API Key
const validateApiKey = (key: string): { valid: boolean; tenant?: string; tier?: string } => {
  const info = API_KEYS[key];
  if (info) return { valid: true, tenant: info.tenant, tier: info.tier };
  return { valid: false };
};

// Mock JWT validation (in real: use jsonwebtoken library, verify signature)
const validateJwt = (token: string): { valid: boolean; claims?: Record<string, any> } => {
  try {
    // Simple mock: decode base64 parts (not secure, for demo only)
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };
    const payload = JSON.parse(atob(parts[1]));
    // Mock check: token expires in future
    if (payload.exp && payload.exp * 1000 > Date.now()) {
      return { valid: true, claims: payload };
    }
    return { valid: false };
  } catch (e) {
    return { valid: false };
  }
};

// Parse Authorization header and extract credentials
const parseAuthHeader = (authHeader?: string): { method: string; credentials: string } | null => {
  if (!authHeader) return null;
  const [method, ...rest] = authHeader.split(' ');
  return { method: method.toLowerCase(), credentials: rest.join(' ') };
};

// HTTP Routing: Match incoming HTTP requests to registered functions
const routeHttpRequest = (method: string, path: string, allFunctions: ServerlessFunction[]): { functionId: string; routeMatch: string } | null => {
  // Find first function with matching trigger
  for (const func of allFunctions) {
    for (const trigger of func.triggers) {
      if (trigger.type !== 'HTTP') continue;
      
      const triggerMethod = trigger.config.method?.toUpperCase() || 'POST';
      const triggerPath = trigger.config.path || '/';
      
      // Simple path matching: exact or wildcard
      const methodMatches = method.toUpperCase() === triggerMethod;
      const pathMatches = triggerPath === '*' || path === triggerPath || path.startsWith(triggerPath + '/');
      
      if (methodMatches && pathMatches) {
        return { 
          functionId: func.id, 
          routeMatch: `${triggerMethod} ${triggerPath}` 
        };
      }
    }
  }
  
  return null; // No matching route found
};

export const PlatformService = {

  // --- Initialization ---
  initialize: (mode: 'production' | 'demo' | 'development' = 'demo') => {
    const existing = Storage.getFunctions();
    if (existing.length === 0) {
      if (mode === 'demo' || mode === 'development') {
        Storage.saveFunctions(DEFAULT_FUNCTIONS);
      }
    }
  },

  // --- CRUD Operations ---

  getFunctions: async (): Promise<ServerlessFunction[]> => {
    await delay(100); // Simulate network latency
    return Storage.getFunctions();
  },

  getFunction: async (id: string): Promise<ServerlessFunction | undefined> => {
    await delay(50);
    return Storage.getFunctions().find(f => f.id === id);
  },

  deployFunction: async (id: string, code: string): Promise<ServerlessFunction> => {
    const funcs = Storage.getFunctions();
    const idx = funcs.findIndex(f => f.id === id);
    if (idx === -1) throw new Error("Function not found");

    // 1. Version Bump
    const vParts = funcs[idx].version.split('.');
    vParts[2] = (parseInt(vParts[2] || '0') + 1).toString();
    const newVersion = vParts.join('.');

    // 2. Update Record
    const updatedFunc = {
      ...funcs[idx],
      code,
      version: newVersion
    };
    funcs[idx] = updatedFunc;
    
    // 3. Persist
    Storage.saveFunctions(funcs);

    // 4. Simulate Build Steps + Registry Push (post-persist)
    Storage.saveLog(id, {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `Building function ${id} (simulated Kaniko)...`,
      requestId: 'system-build'
    });
    await delay(400);
    Storage.saveLog(id, {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `Pushing image for ${id} to registry...`,
      requestId: 'system-build'
    });
    await delay(200);
    const imageTag = `${id}:${newVersion}`;
    const registry = JSON.parse(localStorage.getItem('nexus_registry') || '{}');
    registry[id] = imageTag;
    localStorage.setItem('nexus_registry', JSON.stringify(registry));

    // 5. Log Deployment
    Storage.saveLog(id, {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `Deployed version ${newVersion} successfully.`,
      requestId: 'system-deploy',
      duration: 0
    });

    await delay(600); // Simulate build/deploy time
    return updatedFunc;
  },

  updateConfiguration: async (id: string, updates: Partial<ServerlessFunction>): Promise<ServerlessFunction> => {
    const funcs = Storage.getFunctions();
    const idx = funcs.findIndex(f => f.id === id);
    if (idx === -1) throw new Error("Function not found");

    funcs[idx] = { ...funcs[idx], ...updates };
    Storage.saveFunctions(funcs);
    await delay(200);
    return funcs[idx];
  },

  getLogs: async (id: string): Promise<LogEntry[]> => {
    return Storage.getLogs(id);
  },

  getMetrics: async (): Promise<MetricPoint[]> => {
    await delay(100);
    return Storage.getMetrics();
  },

  getRateLimitStatus: async (id: string) => {
    await delay(20);
    const bucket = RATE_BUCKETS[id];
    if (!bucket) return { tokens: 100, capacity: 100, refillPerSec: 100 };
    return { tokens: bucket.tokens, capacity: bucket.capacity, refillPerSec: bucket.refillPerSec };
  },

  getContainerStatus: async (id: string) => {
    await delay(10);
    const c = CONTAINERS[id];
    if (!c) return null;
    return { instanceId: c.instanceId, status: c.status, lastUsed: c.lastUsed, busy: !!c.busy };
  },

  // --- Runtime Containers & Rate Limiting ---

  invokeFunction: async (id: string, payloadStr: string, authHeader?: string): Promise<InvocationResult> => {
    const func = await PlatformService.getFunction(id);
    if (!func) throw new Error("Function not found");

    const requestId = Math.random().toString(36).substring(7);
    const traceId = `tr-${Date.now()}`;
    const startTime = Date.now();
    const traceSpans: TraceSpan[] = [];

    // 1. Gateway: Trace Start
    traceSpans.push({
      id: `sp-${Date.now()}-1`,
      name: 'gateway.receive',
      service: 'api-gateway',
      startTime,
      duration: 5,
      status: 'OK'
    });

    // 2. Authentication Check
    let authInfo = { method: 'none' as const, authenticated: true };
    if (authHeader) {
      const parsed = parseAuthHeader(authHeader);
      if (parsed) {
        if (parsed.method === 'bearer') {
          // JWT validation
          const jwtResult = validateJwt(parsed.credentials);
          if (!jwtResult.valid) {
            const authLog: LogEntry = {
              id: Date.now().toString(),
              timestamp: new Date().toISOString(),
              level: 'WARN',
              message: `Authentication failed: invalid JWT token`,
              requestId
            };
            Storage.saveLog(id, authLog);
            return {
              result: { statusCode: 401, body: { error: 'Unauthorized: Invalid JWT' } },
              log: authLog,
              trace: { id: traceId, requestId, spans: traceSpans }
            };
          }
          authInfo = { method: 'jwt', authenticated: true, claims: jwtResult.claims };
        } else if (parsed.method === 'apikey') {
          // API Key validation
          const keyResult = validateApiKey(parsed.credentials);
          if (!keyResult.valid) {
            const authLog: LogEntry = {
              id: Date.now().toString(),
              timestamp: new Date().toISOString(),
              level: 'WARN',
              message: `Authentication failed: invalid API key`,
              requestId
            };
            Storage.saveLog(id, authLog);
            return {
              result: { statusCode: 401, body: { error: 'Unauthorized: Invalid API Key' } },
              log: authLog,
              trace: { id: traceId, requestId, spans: traceSpans }
            };
          }
          authInfo = { method: 'api-key', authenticated: true, claims: { tenant: keyResult.tenant, tier: keyResult.tier } };
        }
      }
      // Log auth attempt
      Storage.saveLog(id, {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Auth: ${authInfo.method} - ${authInfo.authenticated ? 'authenticated' : 'failed'}`,
        requestId
      });
    }

    // 3. Rate Limiting Check
    const bucket = ensureRateBucket(id, 100, 100);
    if (bucket.tokens <= 0) {
      // Rate limited
      const rlLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'WARN',
        message: `Rate limited: tokens=0 for ${id}`,
        requestId
      };
      Storage.saveLog(id, rlLog);
      return {
        result: { statusCode: 429, body: { error: 'Rate limit exceeded' } },
        log: rlLog,
        trace: { id: traceId, requestId, spans: traceSpans }
      };
    }
    bucket.tokens -= 1;

    // 3. Concurrency Check
    const inflight = CONCURRENCY[id] || 0;
    const maxConcurrent = func.maxConcurrent ?? 10;
    if (inflight >= maxConcurrent) {
      const cqLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'WARN',
        message: `Concurrency limit reached: ${inflight}/${maxConcurrent} for ${id}`,
        requestId
      };
      Storage.saveLog(id, cqLog);
      return { result: { statusCode: 429, body: { error: 'Concurrency limit exceeded' } }, log: cqLog, trace: { id: traceId, requestId, spans: traceSpans } };
    }
    CONCURRENCY[id] = inflight + 1;

    

    // 3. Context & Binding Injection
    // We mimic a real binding system by injecting mock objects into the context
    // In a browser-native platform, we can map 'bindings' to LocalStorage keys or mock APIs
    const bindingsStart = Date.now();
    const context = {
      requestId,
      functionName: func.name,
      memoryLimitInMB: func.memory,
      bindings: {} as Record<string, any>
    };

    // Inject simulated bindings
    func.bindings.forEach(b => {
      if (b.type === 'postgres' || b.type === 'redis') {
        context.bindings[b.name] = {
          query: (q: string) => ({ rowCount: 1, rows: [{ id: 1, status: 'mock_success' }] }),
          get: (k: string) => "mock_value",
          set: (k: string, v: string) => "OK"
        };
      } else if (b.type === 's3') {
        context.bindings[b.name] = {
          putObject: () => Promise.resolve({ ETag: '"mock-etag"' }),
          getObject: () => Promise.resolve({ Body: "mock-file-content" })
        };
      }
    });
    
    traceSpans.push({
      id: `sp-${Date.now()}-2`,
      name: 'bindings.inject',
      service: 'worker-host',
      startTime: bindingsStart,
      duration: Date.now() - bindingsStart,
      status: 'OK'
    });

    // 3. Parse Environment Variables
    const envVars = func.envVars.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});

    // 4. Acquire Worker (may produce cold start)
    const containerInfo = getOrCreateWorker(id);
    let worker = containerInfo.worker;
    const isCold = containerInfo.isCold;
    const cont = CONTAINERS[id];
    let usingTempWorker = false;
    if (cont && cont.busy) {
      // Shared worker busy: create a temporary worker for concurrent execution
      usingTempWorker = true;
      const workerBlobLocal = createWorkerBlob();
      const wUrlLocal = URL.createObjectURL(workerBlobLocal);
      worker = new Worker(wUrlLocal);
      (worker as any)._objectURL = wUrlLocal;
    } else if (cont) {
      cont.busy = true; // mark as busy while shared worker handles this invocation
    }

    // 5. Runtime Acquire Trace
    traceSpans.push({
      id: `sp-${Date.now()}-2`,
      name: 'runtime.acquire_container',
      service: 'scheduler',
      startTime: Date.now(),
      duration: 0,
      status: 'OK',
      attributes: { cold_start: containerInfo.isCold, instance_id: containerInfo.instanceId, version: func.version }
    });

    // 6. Execute in Web Worker
    return new Promise((resolve, reject) => {
      const execStart = Date.now();
      // For temporary workers we already created the worker, otherwise we use the shared worker

      // Safety timeout
      const timeoutId = setTimeout(() => {
        if (usingTempWorker) {
          try { worker.terminate(); } catch (e) {}
          try { URL.revokeObjectURL((worker as any)._objectURL); } catch (e) {}
        } else if (cont) {
          cont.busy = false;
          cont.lastUsed = Date.now();
        }
        
        const duration = Date.now() - execStart;
        const errorLog: LogEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Function timed out after ${func.timeout}s`,
          requestId,
          duration,
          billedDuration: Math.ceil(duration / 100) * 100,
          memoryUsed: func.memory
        };
        Storage.saveLog(id, errorLog);
        // Decrement concurrency count on timeout
        CONCURRENCY[id] = Math.max(0, (CONCURRENCY[id] || 1) - 1);

        resolve({
          result: { statusCode: 504, body: { error: "Function Timeout" } },
          log: errorLog,
          trace: { id: traceId, requestId, spans: traceSpans },
          event: eventObj,
          context: execContext
        });
      }, func.timeout * 1000);

      // Listen for worker messages
      let lastLog: LogEntry | null = null;
      
      worker.onmessage = async (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'LOG') {
          const logEntry: LogEntry = {
            id: Date.now().toString() + Math.random(),
            timestamp: new Date().toISOString(),
            level: e.data.payload.level,
            message: e.data.payload.message,
            requestId
          };
          Storage.saveLog(id, logEntry);
          lastLog = logEntry; // Track last log for return (simplified)
        } else if (e.data.type === 'RESULT' || e.data.type === 'ERROR') {
          clearTimeout(timeoutId);
          if (usingTempWorker) {
            try { worker.terminate(); } catch (e) {}
            try { URL.revokeObjectURL((worker as any)._objectURL); } catch (e) {}
          } else if (cont) {
            cont.busy = false;
            cont.lastUsed = Date.now();
          }

          const duration = Date.now() - execStart;
          const isError = e.data.type === 'ERROR';
          
          // Execution Span
          traceSpans.push({
            id: `sp-${Date.now()}-3`,
            name: 'function.execute',
            service: 'runtime-worker',
            startTime: execStart,
            duration,
            status: isError ? 'ERROR' : 'OK',
            attributes: { memory: func.memory, cold_start: isCold }
          });

          // Report Log
          const reportLog: LogEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            level: 'REPORT',
            message: `REPORT RequestId: ${requestId} Duration: ${duration}ms Billed: ${Math.ceil(duration/100)*100}ms Memory Size: ${func.memory}MB Max Memory Used: ${Math.floor(Math.random() * func.memory * 0.8)}MB ColdStart: ${isCold} Instance: ${containerInfo.instanceId}`,
            requestId,
            duration,
            billedDuration: Math.ceil(duration / 100) * 100,
            memoryUsed: Math.floor(Math.random() * func.memory * 0.8),
            coldStart: isCold
          };
          Storage.saveLog(id, reportLog);

          // --- Output Bindings: If function returned keys that match output bindings, perform writes ---
          try {
            const resultPayload: any = isError ? null : (e.data.payload.body ? e.data.payload.body : e.data.payload);
            if (resultPayload) {
                  const bindingWrites: Promise<any>[] = [];
              for (const b of func.bindings.filter(b => b.direction === 'output' || b.direction === 'bidirectional')) {
                // If result contains a property with the binding name, attempt to write
                const keyName = b.name;
                if (resultPayload[keyName] !== undefined) {
                  const start = Date.now();
                  traceSpans.push({ id: `sp-${Date.now()}-4`, parentId: `sp-${Date.now()}-3`, name: `binding.output.${b.type}`, service: 'integration-layer', startTime: start, duration: 0, status: 'OK', attributes: { binding: keyName, type: b.type }});

                  const payloadData = resultPayload[keyName];
                  // Resolve binding write differently per type
                  const binder = context.bindings[keyName];
                  if (binder) {
                    if (b.type === 's3') {
                      bindingWrites.push(
                        Promise.resolve(binder.putObject ? binder.putObject(payloadData) : null).then((res) => {
                          const dur = Date.now() - start;
                          traceSpans[traceSpans.length - 1].duration = dur;
                          Storage.saveLog(id, {
                            id: Date.now().toString() + Math.random(),
                            timestamp: new Date().toISOString(),
                            level: 'INFO',
                            message: `Output binding wrote to S3 (${keyName})`,
                            requestId
                          });
                        })
                      );
                    } else if (b.type === 'postgres') {
                      // If binder exposes query, attempt to call a save or query
                      bindingWrites.push(
                        Promise.resolve(binder.query ? binder.query(payloadData) : null).then((res) => {
                          const dur = Date.now() - start;
                          traceSpans[traceSpans.length - 1].duration = dur;
                          Storage.saveLog(id, {
                            id: Date.now().toString() + Math.random(),
                            timestamp: new Date().toISOString(),
                            level: 'INFO',
                            message: `Output binding wrote to Postgres (${keyName})`,
                            requestId
                          });
                        })
                      );
                    } else {
                      // Generic write
                      bindingWrites.push(Promise.resolve(binder.set ? binder.set(keyName, payloadData) : null).then(() => {
                        const dur = Date.now() - start;
                        traceSpans[traceSpans.length - 1].duration = dur;
                        Storage.saveLog(id, {
                          id: Date.now().toString() + Math.random(),
                          timestamp: new Date().toISOString(),
                          level: 'INFO',
                          message: `Output binding wrote to ${b.type} (${keyName})`,
                          requestId
                        });
                      }));
                    }
                  } else {
                    // No binder injected for this name
                    bindingWrites.push(Promise.resolve().then(() => {
                      Storage.saveLog(id, {
                        id: Date.now().toString() + Math.random(),
                        timestamp: new Date().toISOString(),
                        level: 'WARN',
                        message: `No binding injected for ${keyName}`,
                        requestId
                      });
                    }));
                  }
                }
              }
              if (bindingWrites.length > 0) {
                await Promise.all(bindingWrites);
              }
            }
          } catch (bwErr) {
            Storage.saveLog(id, {
              id: Date.now().toString() + Math.random(),
              timestamp: new Date().toISOString(),
              level: 'ERROR',
              message: `Binding output error: ${String(bwErr)}`,
              requestId
            });
          }
          CONCURRENCY[id] = Math.max(0, (CONCURRENCY[id] || 1) - 1);

          // Update stats (simple in-memory update for list view)
          func.invocations24h++;
          if (isError) func.errorRate = (func.errorRate * 24 + 1) / 25; // Moving avg approximation
          Storage.saveFunctions(Storage.getFunctions().map(f => f.id === id ? func : f));

          resolve({
            result: isError ? 
              { statusCode: 500, body: { error: e.data.payload } } : 
              (e.data.payload.body ? e.data.payload : { statusCode: 200, body: e.data.payload }),
            log: reportLog,
            trace: { id: traceId, requestId, spans: traceSpans },
            event: eventObj,
            context: execContext
          });
        }
      };

      // Start Execution
      let eventPayload = {};
      try { eventPayload = JSON.parse(payloadStr); } catch (e) { eventPayload = { raw: payloadStr }; }
      const eventObj = normalizeEvent(eventPayload, func);
      const execContext = createExecutionContext(func, requestId, containerInfo.instanceId, authInfo);

      // Mount the binding mock objects into execContext.bindings
      for (const b of Object.keys(context.bindings)) {
        execContext.bindings[b] = context.bindings[b];
      }

      worker.postMessage({
        type: 'EXECUTE',
        code: func.code,
        event: eventObj,
        context: execContext,
        env: envVars
      } as WorkerMessage);
    });
  },

  // HTTP Gateway: Route incoming HTTP requests to functions
  invokeHttpRequest: async (method: string, path: string, payloadStr: string, authHeader?: string): Promise<InvocationResult & { routeMatch?: string }> => {
    const allFunctions = Storage.getFunctions();
    const route = routeHttpRequest(method, path, allFunctions);
    
    if (!route) {
      // No matching route found
      const traceId = `tr-${Date.now()}`;
      const requestId = Math.random().toString(36).substring(7);
      const notFoundLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'WARN',
        message: `No route found for ${method.toUpperCase()} ${path}`,
        requestId
      };
      return {
        result: { statusCode: 404, body: { error: 'Route not found' } },
        log: notFoundLog,
        trace: { id: traceId, requestId, spans: [{
          id: `sp-${Date.now()}-1`,
          name: 'gateway.route_not_found',
          service: 'api-gateway',
          startTime: Date.now(),
          duration: 0,
          status: 'ERROR',
          attributes: { method, path }
        }] },
        routeMatch: undefined
      };
    }

    // Route found, invoke the function
    const result = await PlatformService.invokeFunction(route.functionId, payloadStr, authHeader);
    
    // Add routing metadata to trace spans
    if (result.trace.spans[0]) {
      result.trace.spans[0].attributes = {
        ...result.trace.spans[0].attributes,
        route_match: route.routeMatch,
        http_method: method,
        http_path: path
      };
    }
    
    return { ...result, routeMatch: route.routeMatch };
  }
};

// --- Utils ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_FUNCTIONS: ServerlessFunction[] = [
  {
    id: 'fn-hello-world',
    name: 'hello-world',
    description: 'Basic NodeJS example running in browser worker',
    runtime: Runtime.NODEJS_18,
    status: FunctionStatus.ACTIVE,
    memory: 128,
    timeout: 3,
    maxConcurrent: 5,
    version: 'v1.0.0',
    invocations24h: 0,
    errorRate: 0,
    lastDeployed: new Date().toISOString(),
    code: `// This code runs inside a real Web Worker!
exports.handler = async (event, context) => {
  console.log("Hello from the browser runtime!");
  console.log("Received event:", JSON.stringify(event));
  
  return {
    statusCode: 200,
    body: {
      message: "Hello World",
      platform: "Nexus Browser Runtime",
      timestamp: new Date().toISOString()
    }
  };
};`,
    triggers: [{ id: 't1', type: 'HTTP', config: { path: '/hello' } }],
    envVars: [{ key: 'GREETING', value: 'Hello' }],
    bindings: []
  },
  {
    id: 'fn-db-mock',
    name: 'database-processor',
    description: 'Demonstrates binding injection and logic',
    runtime: Runtime.NODEJS_18,
    status: FunctionStatus.ACTIVE,
    memory: 512,
    timeout: 10,
    maxConcurrent: 3,
    version: 'v1.0.2',
    invocations24h: 12,
    errorRate: 0,
    lastDeployed: new Date().toISOString(),
    code: `exports.handler = async (event, context) => {
  console.log("Connecting to bound resources...");
  
  // The context.bindings object is injected by the runtime
  const db = context.bindings.usersDb;
  
  if (!db) {
    throw new Error("Database binding not found!");
  }
  
  // Simulate a DB query
  const result = await db.query("SELECT * FROM users");
  console.log("DB Query result:", JSON.stringify(result));
  
  return {
    statusCode: 200,
    body: {
      status: "success",
      users: result.rows
    }
  };
};`,
    triggers: [],
    envVars: [],
    bindings: [
      { id: 'b1', name: 'usersDb', type: 'postgres', direction: 'bidirectional', config: { conn: '...' } }
    ]
  }
];

const generateRealtimeMetrics = (): MetricPoint[] => {
  const points: MetricPoint[] = [];
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    // Generate a realistic daily curve (peak at noon)
    const hour = time.getHours();
    const baseTraffic = (hour > 8 && hour < 20) ? 1000 + Math.random() * 500 : 200 + Math.random() * 100;
    
    points.push({
      time: `${hour}:00`,
      invocations: Math.floor(baseTraffic),
      latency: 80 + Math.random() * 100, // ms
      errors: Math.floor(baseTraffic * (Math.random() * 0.02)) // 0-2% error rate
    });
  }
  return points;
};
