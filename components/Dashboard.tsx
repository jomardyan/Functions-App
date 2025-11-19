
import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  Server, 
  Zap, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight,
  AlertCircle
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart, 
  Bar
} from 'recharts';
import { PlatformService } from '../services/platform';
import { MetricPoint, ServerlessFunction, LogEntry } from '../types';

const MetricCard = ({ title, value, change, positive, icon: Icon }: any) => (
  <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-white tracking-tight">{value}</h3>
      </div>
      <div className={`p-2 rounded-lg ${positive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
        <Icon size={20} />
      </div>
    </div>
    <div className="mt-4 flex items-center text-sm">
      <span className={`flex items-center font-medium ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
        {positive ? <ArrowUpRight size={16} className="mr-1" /> : <ArrowDownRight size={16} className="mr-1" />}
        {change}
      </span>
      <span className="text-slate-500 ml-2">from last month</span>
    </div>
  </div>
);

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [functions, setFunctions] = useState<ServerlessFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [metricsData, funcsData] = await Promise.all([
          PlatformService.getMetrics(),
          PlatformService.getFunctions()
        ]);
        
        setMetrics(metricsData);
        setFunctions(funcsData);
        
        // Collect all logs from all functions
        const allFunctionLogs: LogEntry[] = [];
        for (const func of funcsData) {
          const logs = await PlatformService.getLogs(func.id);
          allFunctionLogs.push(...logs);
        }
        setAllLogs(allFunctionLogs);
        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) return <div className="p-8 text-slate-500">Loading insights...</div>;

  // Calculate real metrics from functions and logs
  const totalInvocations = allLogs.filter(l => l.level === 'REPORT').length;
  const totalErrors = allLogs.filter(l => l.level === 'ERROR').length;
  const errorRate = totalInvocations > 0 ? ((totalErrors / totalInvocations) * 100).toFixed(1) : '0';
  const activeFunctions = functions.filter(f => f.status === 'Active').length;
  const avgLatency = allLogs
    .filter(l => l.duration)
    .reduce((sum, l) => sum + (l.duration || 0), 0) / Math.max(allLogs.filter(l => l.duration).length, 1);
  
  // Estimate cost: $0.0000002 per invocation + $0.0000167 per GB-second
  const costPerInvocation = 0.0000002;
  const costPerGBSecond = 0.0000167;
  const totalCost = (totalInvocations * costPerInvocation) + 
    (allLogs.filter(l => l.memoryUsed && l.billedDuration)
      .reduce((sum, l) => sum + ((l.memoryUsed || 0) / 1024) * ((l.billedDuration || 0) / 1000) * costPerGBSecond, 0));


  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-white">Platform Overview</h1>
        <p className="text-slate-400 mt-2">Real-time insights across your serverless infrastructure.</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Total Invocations" 
          value={totalInvocations.toLocaleString()} 
          change={`${totalInvocations > 0 ? '↑' : '→'}`}
          positive={totalInvocations > 0} 
          icon={Zap} 
        />
        <MetricCard 
          title="Active Functions" 
          value={activeFunctions} 
          change={`${activeFunctions}/${functions.length}`}
          positive={activeFunctions === functions.length} 
          icon={Server} 
        />
        <MetricCard 
          title="Error Rate" 
          value={`${errorRate}%`}
          change={`${totalErrors} errors`}
          positive={parseFloat(errorRate) < 1} 
          icon={AlertCircle} 
        />
        <MetricCard 
          title="Avg Latency" 
          value={`${Math.round(avgLatency)}ms`}
          change={allLogs.length > 0 ? 'from invocations' : '—'} 
          positive={avgLatency < 100} 
          icon={Activity} 
        />
      </div>

      {/* Cost Card */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-400 text-sm font-medium mb-1">Estimated Monthly Cost</p>
            <h3 className="text-3xl font-bold text-white tracking-tight">${totalCost.toFixed(4)}</h3>
            <p className="text-xs text-slate-500 mt-2">Based on {totalInvocations} invocations and {allLogs.filter(l => l.memoryUsed).length} metered executions</p>
          </div>
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
            <DollarSign size={20} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-6">Invocation Volume (24h)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics}>
                <defs>
                  <linearGradient id="colorInvo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} interval={3} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                  itemStyle={{ color: '#60a5fa' }}
                />
                <Area type="monotone" dataKey="invocations" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorInvo)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-6">Latency p95 (ms)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} interval={3} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{fill: '#1e293b'}}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                />
                <Bar dataKey="latency" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
