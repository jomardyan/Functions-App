import React, { useState } from 'react';
import { Box, CheckCircle2, ChevronRight, Database, Server, UserCog } from 'lucide-react';

export type InstallMode = 'production' | 'demo' | 'development';
type DatabaseEngine = 'sqlite' | 'mysql' | 'postgres';

export interface InstallationConfig {
  mode: InstallMode;
  admin: {
    fullName: string;
    email: string;
  };
  database: {
    engine: DatabaseEngine;
    host?: string;
    port?: string;
    name?: string;
    username?: string;
    filePath?: string;
  };
  createdAt: string;
}

interface OnboardingWizardProps {
  onComplete: (config: InstallationConfig) => void;
}

const hasValue = (value?: string) => Boolean(value && value.trim());

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<InstallMode>('demo');
  const [admin, setAdmin] = useState({ fullName: '', email: '' });
  const [database, setDatabase] = useState({
    engine: 'sqlite' as DatabaseEngine,
    host: '',
    port: '',
    name: '',
    username: '',
    filePath: './data/nexus.db'
  });
  const [error, setError] = useState('');

  const validateStep = () => {
    if (step === 2) {
      if (mode === 'demo') return true;
      if (!admin.fullName.trim() || !admin.email.trim()) {
        setError('Admin name and email are required.');
        return false;
      }
    }
    if (step === 3) {
      if (mode === 'demo') return true;
      if (database.engine === 'sqlite' && !database.filePath.trim()) {
        setError('SQLite file path is required.');
        return false;
      }
      if (database.engine !== 'sqlite') {
        const requiredFields = [database.host, database.port, database.name, database.username];
        if (!requiredFields.every((field) => hasValue(field))) {
          setError('Host, port, database name, and username are required for server databases.');
          return false;
        }
      }
    }
    setError('');
    return true;
  };

  const handleNext = () => {
    if (validateStep()) setStep((s) => Math.min(4, s + 1));
  };

  const finish = () => {
    if (!validateStep()) return;
    onComplete({
      mode,
      admin: {
        fullName: admin.fullName.trim() || 'Demo Admin',
        email: admin.email.trim() || 'demo@nexus.local'
      },
      database: {
        engine: database.engine,
        host: database.engine === 'sqlite' ? undefined : database.host.trim(),
        port: database.engine === 'sqlite' ? undefined : database.port.trim(),
        name: database.engine === 'sqlite' ? undefined : database.name.trim(),
        username: database.engine === 'sqlite' ? undefined : database.username.trim(),
        filePath: database.engine === 'sqlite' ? database.filePath.trim() : undefined
      },
      createdAt: new Date().toISOString()
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center">
              <Box size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">First-Time Installation</h1>
              <p className="text-sm text-slate-400">Complete onboarding to configure your Nexus environment.</p>
            </div>
          </div>
          <p className="text-sm text-slate-500">Step {step} of 4</p>
        </div>

        <div className="grid md:grid-cols-[220px_1fr]">
          <aside className="border-r border-slate-800 p-5 space-y-3 bg-slate-950/60">
            <p className={`text-sm flex items-center gap-2 ${step >= 1 ? 'text-primary-400' : 'text-slate-500'}`}><Server size={16} /> Mode</p>
            <p className={`text-sm flex items-center gap-2 ${step >= 2 ? 'text-primary-400' : 'text-slate-500'}`}><UserCog size={16} /> Admin</p>
            <p className={`text-sm flex items-center gap-2 ${step >= 3 ? 'text-primary-400' : 'text-slate-500'}`}><Database size={16} /> Database</p>
            <p className={`text-sm flex items-center gap-2 ${step >= 4 ? 'text-primary-400' : 'text-slate-500'}`}><CheckCircle2 size={16} /> Review</p>
          </aside>

          <section className="p-6 space-y-5">
            {step === 1 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Choose installation mode</h2>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { key: 'production', title: 'Production', desc: 'For live workloads and strict setup.' },
                    { key: 'demo', title: 'Demo', desc: 'Try the platform quickly with safe defaults.' },
                    { key: 'development', title: 'Development', desc: 'Local development with flexible options.' }
                  ].map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setMode(option.key as InstallMode)}
                      className={`text-left p-4 rounded-xl border transition ${mode === option.key ? 'border-primary-500 bg-primary-600/10' : 'border-slate-700 hover:border-slate-500'}`}
                    >
                      <p className="font-semibold text-white">{option.title}</p>
                      <p className="text-xs text-slate-400 mt-1">{option.desc}</p>
                    </button>
                  ))}
                </div>
                {mode === 'demo' && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 p-3 rounded-lg text-sm">
                    Demo mode keeps setup minimal, but still lets you configure a database connection.
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Create first admin account</h2>
                <input className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="Full name" value={admin.fullName} onChange={(e) => setAdmin({ ...admin, fullName: e.target.value })} />
                <input className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="Email" type="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Database configuration</h2>
                <select className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" value={database.engine} onChange={(e) => setDatabase({ ...database, engine: e.target.value as DatabaseEngine })}>
                  <option value="sqlite">SQLite (local)</option>
                  <option value="mysql">MySQL</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
                {database.engine === 'sqlite' ? (
                  <input className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="SQLite file path" value={database.filePath} onChange={(e) => setDatabase({ ...database, filePath: e.target.value })} />
                ) : (
                  <div className="grid md:grid-cols-2 gap-3">
                    <input className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="Host" value={database.host} onChange={(e) => setDatabase({ ...database, host: e.target.value })} />
                    <input className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="Port" value={database.port} onChange={(e) => setDatabase({ ...database, port: e.target.value })} />
                    <input className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="Database name" value={database.name} onChange={(e) => setDatabase({ ...database, name: e.target.value })} />
                    <input className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2" placeholder="Username" value={database.username} onChange={(e) => setDatabase({ ...database, username: e.target.value })} />
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3 text-sm">
                <h2 className="text-lg font-semibold text-white">Review setup</h2>
                <p><span className="text-slate-400">Mode:</span> <span className="text-white capitalize">{mode}</span></p>
                <p><span className="text-slate-400">Admin:</span> <span className="text-white">{admin.fullName || 'Demo Admin'} ({admin.email || 'demo@nexus.local'})</span></p>
                <p><span className="text-slate-400">Database:</span> <span className="text-white">{database.engine === 'sqlite' ? `SQLite (${database.filePath})` : `${database.engine.toUpperCase()} @ ${database.host}:${database.port}/${database.name}`}</span></p>
              </div>
            )}

            {error && <div className="text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm">{error}</div>}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep((s) => Math.max(1, s - 1))} className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50" disabled={step === 1}>Back</button>
              {step < 4 ? (
                <button onClick={handleNext} className="px-4 py-2 text-sm rounded-lg bg-primary-600 hover:bg-primary-500 text-white flex items-center gap-2">Next <ChevronRight size={16} /></button>
              ) : (
                <button onClick={finish} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">Complete installation</button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
