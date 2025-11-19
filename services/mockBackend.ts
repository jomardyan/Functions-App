
import { ServerlessFunction, FunctionStatus, Runtime, LogEntry, MetricPoint, InvocationResult, Trace, TraceSpan, Binding } from '../types';

// --- Backend State ---

interface ContainerState {
  functionId: string;
  status: 'WARM' | 'COLD';
  lastUsed: number;
  instanceId: string;
}

// In-memory database simulation
let functions: ServerlessFunction[] = [
  {
    id: 'fn-image-resize',
    name: 'image-resizer-service',
    description: 'Resizes images uploaded to S3 bucket',
    runtime: Runtime.NODEJS_18,
    status: FunctionStatus.ACTIVE,
    memory: 512,
    timeout: 30,
    version: 'v1.0.4',
    invocations24h: 14520,
    errorRate: 0.02,
    lastDeployed: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    code: `const sharp = require('sharp');
const aws = require('aws-sdk');

const s3 = new aws.S3();

exports.handler = async (event, context) => {
  console.log("Processing event", JSON.stringify(event));
  
  // Input Binding: S3 Object is automatically downloaded
  const inputImage = context.bindings.inputImage;
  
  try {
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Image resized", 
        dimensions: "1024x768",
        storage: "s3://bucket/resized/image.jpg"
      })
    };
  } catch (error) {
    console.error("Error resizing image:", error);
    return { statusCode: 500, body: "Error processing" };
  }
};`,
    triggers: [
      { id: 't1', type: 'HTTP', config: { path: '/api/v1/resize', method: 'POST', auth: 'api-key' } }
    ],
    envVars: [
      { key: 'BUCKET_NAME', value: 'nexus-uploads' },
      { key: 'MAX_WIDTH', value: '1024' }
    ],
    bindings: [
      { id: 'b1', name: 'inputImage', type: 's3', direction: 'input', config: { bucket: 'uploads', key: '{trigger.filename}' } },
      { id: 'b2', name: 'outputImage', type: 's3', direction: 'output', config: { bucket: 'resized' } }
    ]
  },
  {
    id: 'fn-payment-proc',
    name: 'payment-processor',
    description: 'Handles stripe webhook events',
    runtime: Runtime.PYTHON_3_9,
    status: FunctionStatus.ACTIVE,
    memory: 1024,
    timeout: 60,
    version: 'v2.1.0',
    invocations24h: 8940,
    errorRate: 0.05,
    lastDeployed: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    code: `import json
import stripe
import os

def handler(event, context):
    print("Received webhook event")
    
    # DB Binding available as connection object
    db = context.bindings.paymentDb
    
    try:
        payload = json.loads(event['body'])
        
        # Check for idempotency in DB (Simulated binding call)
        if db.query("SELECT 1 FROM processed WHERE id=?", payload['id']):
            return {'statusCode': 200, 'body': 'Already processed'}
            
        # Process payment logic
        return {
            'statusCode': 200,
            'body': json.dumps({'status': 'processed'})
        }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {'statusCode': 500, 'body': 'Internal Server Error'}`,
    triggers: [
      { id: 't2', type: 'HTTP', config: { path: '/webhooks/stripe', method: 'POST' } }
    ],
    envVars: [
      { key: 'STRIPE_SECRET', value: 'sk_test_...', isSecret: true }
    ],
    bindings: [
      { id: 'b3', name: 'paymentDb', type: 'postgres', direction: 'bidirectional', config: { connectionString: '${DB_CONN}' } }
    ]
  }
];

const logs: Record<string, LogEntry[]> = {};
const containers: Record<string, ContainerState> = {};
const traces: Record<string, Trace[]> = {};

// --- Simulation Utilities ---

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
const uuid = () => Math.random().toString(36).substring(2, 15);

// --- 4.1 Runtime & Execution Model ---

const RuntimeService = {
  getContainer: (functionId: string): { instance: ContainerState, isCold: boolean } => {
    const now = Date.now();
    let instance = containers[functionId];
    
    // Container eviction policy (mock: > 5 mins idle = cold)
    if (instance && (now - instance.lastUsed > 5 * 60 * 1000)) {
      delete containers[functionId];
      instance = undefined as any;
    }

    if (instance) {
      instance.lastUsed = now;
      return { instance, isCold: false };
    }

    // Cold Start
    const newInstance: ContainerState = {
      functionId,
      status: 'WARM',
      lastUsed: now,
      instanceId: `i-${uuid()}`
    };
    containers[functionId] = newInstance;
    return { instance: newInstance, isCold: true };
  }
};

// --- 4.2 API Gateway Layer ---

const APIGateway = {
  processRequest: async (functionId: string, trigger: any): Promise<{ allowed: boolean, traceSpans: TraceSpan[] }> => {
    const spans: TraceSpan[] = [];
    const start = Date.now();

    // 1. Request Routing
    spans.push({
      id: uuid(),
      name: 'gateway.route',
      service: 'api-gateway',
      startTime: start,
      duration: 5,
      status: 'OK'
    });

    // 2. Authentication
    const authStart = Date.now();
    await delay(10); // Simulate auth check latency
    spans.push({
      id: uuid(),
      name: 'gateway.auth',
      service: 'api-gateway',
      startTime: authStart,
      duration: Date.now() - authStart,
      status: 'OK',
      attributes: { mechanism: trigger.config?.auth || 'none' }
    });

    // 3. Rate Limiting
    const rlStart = Date.now();
    await delay(5);
    spans.push({
      id: uuid(),
      name: 'gateway.ratelimit',
      service: 'api-gateway',
      startTime: rlStart,
      duration: Date.now() - rlStart,
      status: 'OK',
      attributes: { bucket: '100/sec' }
    });

    return { allowed: true, traceSpans: spans };
  }
};

// --- 4.3 Bindings & Integration System ---

const BindingSystem = {
  initializeBindings: async (bindings: Binding[]): Promise<{ context: any, spans: TraceSpan[] }> => {
    const spans: TraceSpan[] = [];
    const context: any = {};

    if (!bindings || bindings.length === 0) return { context, spans };

    for (const binding of bindings) {
      const start = Date.now();
      // Simulate network latency for binding initialization (connection pooling)
      const latency = binding.type === 'redis' ? 2 : binding.type === 'postgres' ? 20 : 50;
      await delay(latency);
      
      spans.push({
        id: uuid(),
        name: `binding.init.${binding.type}`,
        service: 'integration-layer',
        startTime: start,
        duration: Date.now() - start,
        status: 'OK',
        attributes: { resource: binding.name, type: binding.type }
      });

      // Mock object injection
      context[binding.name] = {
        type: binding.type,
        connected: true,
        query: () => true // Mock method
      };
    }

    return { context, spans };
  }
};

export const BackendService = {
  
  // --- Function CRUD ---

  getFunctions: async (): Promise<ServerlessFunction[]> => {
    await delay(200);
    return [...functions];
  },

  getFunction: async (id: string): Promise<ServerlessFunction | undefined> => {
    await delay(100);
    return functions.find(f => f.id === id);
  },

  deployFunction: async (id: string, code: string): Promise<ServerlessFunction> => {
    const idx = functions.findIndex(f => f.id === id);
    if (idx === -1) throw new Error("Function not found");

    // 1. Build Phase simulation
    functions[idx].status = FunctionStatus.DEPLOYING;
    functions[idx].code = code;
    await delay(800); // Build time

    // 2. Container Registry Push simulation
    await delay(400);

    // 3. Update Deployment
    functions[idx].status = FunctionStatus.ACTIVE;
    functions[idx].lastDeployed = new Date().toISOString();
    // Bump version
    const vParts = functions[idx].version.split('.');
    vParts[2] = (parseInt(vParts[2]) + 1).toString();
    functions[idx].version = vParts.join('.');

    // 4. Invalidate old containers
    delete containers[id];

    // System Log
    const deployLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Deployment successful. New version: ${functions[idx].version}`,
        requestId: 'system-deploy'
    };
    if (!logs[id]) logs[id] = [];
    logs[id].unshift(deployLog);

    return functions[idx];
  },

  updateConfiguration: async (id: string, updates: Partial<ServerlessFunction>): Promise<ServerlessFunction> => {
    const idx = functions.findIndex(f => f.id === id);
    if (idx === -1) throw new Error("Function not found");
    
    functions[idx] = { ...functions[idx], ...updates };
    await delay(300); // API latency
    return functions[idx];
  },

  // --- Execution Engine ---

  invokeFunction: async (id: string, payload: string): Promise<InvocationResult> => {
    const func = functions.find(f => f.id === id);
    if (!func) throw new Error("Function not found");

    const requestId = uuid();
    const traceId = uuid();
    const fullTrace: Trace = { id: traceId, requestId, spans: [] };
    const requestStart = Date.now();

    // 1. API Gateway Layer
    const gatewayResult = await APIGateway.processRequest(id, func.triggers[0] || {});
    fullTrace.spans.push(...gatewayResult.traceSpans);

    // 2. Runtime Layer: Container Acquisition
    const contStart = Date.now();
    const { instance, isCold } = RuntimeService.getContainer(id);
    
    if (isCold) {
      // Simulate cold start latency (runtime dependent)
      const coldLatency = func.runtime.includes('Java') ? 1200 : func.runtime.includes('Node') ? 400 : 600;
      await delay(coldLatency);
    }
    
    fullTrace.spans.push({
      id: uuid(),
      name: 'runtime.acquire_container',
      service: 'scheduler',
      startTime: contStart,
      duration: Date.now() - contStart,
      status: 'OK',
      attributes: { cold_start: isCold, instance_id: instance.instanceId }
    });

    // 3. Integration Layer: Bindings Injection
    const bindResult = await BindingSystem.initializeBindings(func.bindings);
    fullTrace.spans.push(...bindResult.spans);

    // 4. Function Execution
    const execStart = Date.now();
    
    // Simulate execution time based on logic
    let execDuration = Math.floor(Math.random() * 50 + 20);
    await delay(execDuration);

    fullTrace.spans.push({
        id: uuid(),
        name: 'function.execute',
        service: 'runtime-worker',
        startTime: execStart,
        duration: execDuration,
        status: 'OK',
        attributes: { memory: func.memory }
    });

    const result = {
        statusCode: 200,
        body: { message: 'Executed successfully', timestamp: new Date().toISOString() }
    };

    const log: LogEntry = {
        id: uuid(),
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: `Function executed in ${execDuration}ms`,
        requestId: requestId,
        duration: execDuration,
        billedDuration: Math.ceil(execDuration / 100) * 100,
        memoryUsed: Math.floor(func.memory * 0.6),
        coldStart: isCold
    };
    
    if (!logs[id]) logs[id] = [];
    logs[id].unshift(log);

    return {
        result,
        log,
        trace: fullTrace
    };
  }
};
