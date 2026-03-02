
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Box, 
  Settings, 
  Activity, 
  Bell, 
  Search,
  Sparkles,
  User,
  Plus,
  Loader2
} from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { FunctionEditor } from './components/FunctionEditor';
import { AIChat } from './components/AIChat';
import { InstallationConfig, OnboardingWizard } from './components/OnboardingWizard';
import { ServerlessFunction, Runtime, FunctionStatus } from './types';
import { PlatformService } from './services/platform';

const INSTALLATION_STORAGE_KEY = 'nexus_installation_config';
const FUNCTIONS_STORAGE_KEY = 'nexus_functions';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [isChatOpen, setIsChatOpen] = useState(false);

  const navItems = [
    { path: '/', icon: LayoutDashboard, label: 'Overview' },
    { path: '/functions', icon: Box, label: 'Functions' },
    { path: '/activity', icon: Activity, label: 'Activity' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans selection:bg-primary-500/30">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col fixed h-full z-20">
        <div className="h-16 flex items-center px-6 border-b border-slate-800">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center mr-3 shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <Box className="text-white" size={20} />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">Nexus FaaS</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-600/10 text-primary-400 border border-primary-500/20'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <item.icon size={18} className={`mr-3 ${isActive ? 'text-primary-500' : ''}`} />
                <span className="text-sm font-medium">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center p-2 rounded-lg hover:bg-slate-900 cursor-pointer transition-colors">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center mr-3 border border-slate-700">
              <User size={16} className="text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Jane Doe</p>
              <p className="text-xs text-slate-500 truncate">jane@nexus.io</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 flex flex-col relative min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-slate-950/80 backdrop-blur-sm border-b border-slate-800 flex items-center justify-between px-8 sticky top-0 z-10">
          {/* Breadcrumb / Title */}
          <div className="text-sm text-slate-400">
            <span className="hover:text-slate-200 cursor-pointer">Organization</span>
            <span className="mx-2">/</span>
            <span className="text-white font-medium">Default Project</span>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-4">
             <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input 
                  type="text" 
                  placeholder="Search resources..." 
                  className="bg-slate-900 border border-slate-800 text-slate-200 text-sm rounded-full pl-10 pr-4 py-1.5 focus:outline-none focus:border-slate-600 w-64 transition-all focus:w-80" 
                />
             </div>
             <button className="relative p-2 text-slate-400 hover:text-white transition-colors">
               <Bell size={20} />
               <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full"></span>
             </button>
             <button 
               onClick={() => setIsChatOpen(!isChatOpen)}
               className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${isChatOpen ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.4)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
             >
               <Sparkles size={16} />
               <span>AI Architect</span>
             </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto bg-slate-950 relative">
          {children}
        </div>
        
        <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      </main>
    </div>
  );
};

const FunctionsList = () => {
  const navigate = useNavigate();
  const [functions, setFunctions] = useState<ServerlessFunction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Use real platform service
    PlatformService.getFunctions()
      .then(setFunctions)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
            <Loader2 className="animate-spin text-primary-500" size={32} />
        </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Functions</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your serverless functions and deployment configurations.</p>
        </div>
        <button className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-md text-sm font-medium shadow-lg shadow-primary-900/20 transition-all flex items-center gap-2">
            <Plus size={16} /> New Function
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-800">
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase">Name</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase">Runtime</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase text-right">Invocations (24h)</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase text-right">Memory</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {functions.length === 0 && (
               <tr>
                 <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                   No functions found. Create one to get started.
                 </td>
               </tr>
            )}
            {functions.map((fn) => (
              <tr 
                key={fn.id} 
                className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                onClick={() => navigate(`/functions/${fn.id}`)}
              >
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-200 group-hover:text-primary-400 transition-colors">{fn.name}</span>
                    <span className="text-xs text-slate-500">{fn.description}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        fn.status === FunctionStatus.ACTIVE ? 'bg-emerald-500/10 text-emerald-500' :
                        fn.status === FunctionStatus.DEPLOYING ? 'bg-blue-500/10 text-blue-500' :
                        fn.status === FunctionStatus.ERROR ? 'bg-rose-500/10 text-rose-500' :
                        'bg-slate-700 text-slate-400'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                             fn.status === FunctionStatus.ACTIVE ? 'bg-emerald-500' :
                             fn.status === FunctionStatus.DEPLOYING ? 'bg-blue-500 animate-pulse' :
                             fn.status === FunctionStatus.ERROR ? 'bg-rose-500' :
                             'bg-slate-500'
                        }`}></span>
                        {fn.status}
                    </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">{fn.runtime}</td>
                <td className="px-6 py-4 text-sm text-slate-400 text-right font-mono">{fn.invocations24h.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-slate-400 text-right">{fn.memory} MB</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FunctionEditorWrapper = () => {
    const { id } = useParams();
    const [func, setFunc] = useState<ServerlessFunction | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        if (id) {
            PlatformService.getFunction(id).then((f) => {
                if (f) setFunc(f);
                else navigate('/functions'); // 404 redirect
                setLoading(false);
            });
        }
    }, [id, navigate]);

    const handleSave = async (updatedFunc: ServerlessFunction) => {
        // Local state update
        setFunc(updatedFunc);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="animate-spin text-primary-500" size={32} />
            </div>
        );
    }

    return func ? <FunctionEditor func={func} onSave={handleSave} /> : null;
};

const App: React.FC = () => {
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    if (localStorage.getItem(INSTALLATION_STORAGE_KEY)) return true;
    const existingFunctions = localStorage.getItem(FUNCTIONS_STORAGE_KEY);
    if (!existingFunctions) return false;
    try {
      const parsed = JSON.parse(existingFunctions);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    if (isInstalled) {
      const savedConfig = localStorage.getItem(INSTALLATION_STORAGE_KEY);
      let mode: 'production' | 'demo' | 'development' = 'demo';
      if (savedConfig) {
        try {
          const parsed = JSON.parse(savedConfig);
          if (parsed.mode === 'production' || parsed.mode === 'development' || parsed.mode === 'demo') {
            mode = parsed.mode;
          }
        } catch (e) {}
      }
      PlatformService.initialize(mode);
    }
  }, [isInstalled]);

  const handleOnboardingComplete = (config: InstallationConfig) => {
    localStorage.setItem(INSTALLATION_STORAGE_KEY, JSON.stringify(config));
    PlatformService.initialize(config.mode);
    setIsInstalled(true);
  };

  if (!isInstalled) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />;
  }

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/functions" element={<FunctionsList />} />
          <Route path="/functions/:id" element={<FunctionEditorWrapper />} />
          <Route path="*" element={<div className="p-8 text-slate-500">Page under construction</div>} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
