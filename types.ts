
export enum Runtime {
  NODEJS_18 = 'Node.js 18 (Local)',
  PYTHON_3_9 = 'Python 3.9 (Simulated)',
  GO_1_20 = 'Go 1.20 (Simulated)',
}

export enum FunctionStatus {
  ACTIVE = 'Active',
  DEPLOYING = 'Deploying',
  ERROR = 'Error',
  STOPPED = 'Stopped',
}

export interface Trigger {
  id: string;
  type: 'HTTP' | 'CRON' | 'QUEUE';
  config: Record<string, string>;
}

export interface EnvVar {
  key: string;
  value: string;
  isSecret?: boolean;
}

export interface Binding {
  id: string;
  name: string;
  type: 'postgres' | 'redis' | 's3' | 'sqs' | 'dynamodb';
  direction: 'input' | 'output' | 'bidirectional';
  config: Record<string, string>;
}

export interface ServerlessFunction {
  id: string;
  name: string;
  description: string;
  runtime: Runtime;
  status: FunctionStatus;
  memory: number; // MB
  timeout: number; // Seconds
  invocations24h: number;
  errorRate: number; // Percentage
  lastDeployed: string;
  version: string;
  code: string;
  triggers: Trigger[];
  envVars: EnvVar[];
  bindings: Binding[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'REPORT';
  message: string;
  requestId: string;
  duration?: number;
  billedDuration?: number;
  memoryUsed?: number;
  coldStart?: boolean;
}

export interface MetricPoint {
  time: string;
  invocations: number;
  latency: number;
  errors: number;
}

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  service: string;
  startTime: number;
  duration: number;
  status: 'OK' | 'ERROR';
  attributes?: Record<string, any>;
}

export interface Trace {
  id: string;
  requestId: string;
  spans: TraceSpan[];
}

export interface InvocationResult {
  result: {
    statusCode: number;
    body: any;
    headers?: Record<string, string>;
  };
  log: LogEntry;
  trace: Trace;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  isTyping?: boolean;
}

// -- Worker Types --
export interface WorkerMessage {
  type: 'EXECUTE';
  code: string;
  event: any;
  context: any;
  env: Record<string, string>;
}

export interface WorkerResponse {
  type: 'RESULT' | 'LOG' | 'ERROR';
  payload: any;
}
