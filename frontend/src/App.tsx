
import React, { useState, useCallback, useMemo } from 'react';
import { Settings, Save, Database, AlertCircle, CheckCircle2, Search, Info } from 'lucide-react';
import { HikNode, HikCapabilities, EditType, LoxoneConfig } from './types';
import { cleanXmlElement, parseCapabilities } from './utils/xmlUtils';
import TreeView from './components/TreeView';
import LoxoneModal from './components/LoxoneModal';

const BASE_PATH = "/ISAPI/Image/channels/1";

const App: React.FC = () => {
  // Connection State
  const [ip, setIp] = useState('192.168.10.150');
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('');
  
  // App State
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready.');
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info');
  const [nodes, setNodes] = useState<HikNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<HikNode | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [loxoneConfig, setLoxoneConfig] = useState<LoxoneConfig | null>(null);

  const getAuthHeader = useCallback(() => {
    try {
      return 'Basic ' + btoa(`${user}:${pass}`);
    } catch (e) {
      // Handle non-ASCII characters in credentials
      const latin1 = unescape(encodeURIComponent(`${user}:${pass}`));
      return 'Basic ' + btoa(latin1);
    }
  }, [user, pass]);

  const getSafeUrl = useCallback((targetIp: string, path: string) => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    
    // Zjistíme, zda běžíme v produkčním módu (Docker/Build)
    // Vite nastavuje import.meta.env.PROD na true po buildu
    if (import.meta.env.PROD) {
      // V Dockeru použijeme naši Nginx proxy
      // Výsledek např: /camera-proxy/192.168.10.150/ISAPI/Image/channels/1
      return `/camera-proxy/${targetIp.trim()}${cleanPath}`;
    } else {
      // Lokální vývoj (npm run dev) - stále zkoušíme napřímo (bude vyžadovat CORS plugin v prohlížeči)
      let cleanBase = targetIp.trim();
      if (!/^https?:\/\//i.test(cleanBase)) {
        cleanBase = `http://${cleanBase}`;
      }
      return `${cleanBase}${cleanPath}`;
    }
  }, []);

  const buildTree = useCallback((xmlDoc: Document, capsDoc: Document | null): HikNode[] => {
    const createNode = (el: Element, path: string, parentTag?: string): HikNode => {
      const tag = el.localName;
      const currentPath = path === BASE_PATH ? `${path}/${tag}` : path;
      const childrenElements = Array.from(el.children);
      
      let caps: HikCapabilities | undefined;
      if (capsDoc) {
        const capEl = capsDoc.getElementsByTagName(tag)[0];
        if (capEl) caps = parseCapabilities(capEl);
      }

      const node: HikNode = {
        id: Math.random().toString(36).substr(2, 9),
        tag,
        text: el.children.length === 0 ? el.textContent?.trim() || '' : '',
        children: [],
        fullPath: currentPath,
        capabilities: caps,
        parentTag,
        rawElement: el
      };

      node.children = childrenElements.map(child => createNode(child, currentPath, tag));
      return node;
    };

    return [createNode(xmlDoc.documentElement, BASE_PATH)];
  }, []);

  const loadData = async () => {
    setLoading(true);
    setStatus('Loading configuration...');
    setStatusType('info');
    setSelectedNode(null);

    try {
      const url = getSafeUrl(ip, BASE_PATH);
      
      const res = await fetch(url, {
        headers: { 'Authorization': getAuthHeader() }
      });

      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const xmlText = await res.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "application/xml");

      // Check if it's actually valid XML/ISAPI response
      if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
        throw new Error("Invalid XML response from camera.");
      }

      let capsDoc: Document | null = null;
      try {
        const capsRes = await fetch(`${url}/capabilities`, {
          headers: { 'Authorization': getAuthHeader() }
        });
        if (capsRes.ok) {
          const capsText = await capsRes.text();
          capsDoc = parser.parseFromString(capsText, "application/xml");
        }
      } catch (e) {
        console.warn("Could not load capabilities", e);
      }

      const tree = buildTree(xmlDoc, capsDoc);
      setNodes(tree);
      setStatus('Successfully loaded configuration.');
      setStatusType('success');
    } catch (err: any) {
      console.error(err);
      if (err.message === 'Failed to fetch') {
        setStatus('Network Error: "Failed to fetch". This is likely due to CORS or Mixed Content. Ensure you are using a CORS-bypass extension or accessing via HTTP if the camera uses HTTP.');
      } else {
        setStatus(`Error: ${err.message}`);
      }
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  const findModuleElement = (node: HikNode): { name: string; element: Element } => {
    let current = node;
    const root = nodes[0];
    if (current.id === root.id) return { name: root.tag, element: root.rawElement };

    const pathParts = node.fullPath.split('/');
    const moduleName = pathParts[5] || node.tag; 
    
    const moduleNode = root.children.find(c => c.tag === moduleName) || root;
    return { name: moduleNode.tag, element: moduleNode.rawElement };
  };

  const handlePut = async () => {
    if (!selectedNode) return;
    const { name, element } = findModuleElement(selectedNode);
    
    if (selectedNode.id === nodes[0].id) {
      alert("Nemůžete editovat samotný kořenový element (Složku). Vyberte konkrétní parametr pod ním.");
      return;
    }
    const pathSuffix = name === nodes[0].tag ? '' : `/${name}`;
    const targetUrl = getSafeUrl(ip, `${BASE_PATH}${pathSuffix}`);
    // -------------------------

    if (!confirm(`Send PUT request to camera?\nPath: ${targetUrl}\nValue: ${editValue}`)) return;

    setLoading(true);
    setStatus('Sending update...');

    const originalValue = selectedNode.rawElement.textContent;
    selectedNode.rawElement.textContent = editValue;
    const payload = cleanXmlElement(element);

    try {
      const res = await fetch(targetUrl, {
        method: 'PUT',
        headers: { 
          'Authorization': getAuthHeader(),
          'Content-Type': 'application/xml'
        },
        body: payload
      });

      if (res.ok) {
        setStatus('Update successful.');
        setStatusType('success');
        selectedNode.text = editValue;
        setNodes([...nodes]);
      } else {
        const errorText = await res.text();
        throw new Error(`Camera returned ${res.status}: ${errorText}`);
      }
    } catch (err: any) {
      selectedNode.rawElement.textContent = originalValue;
      if (err.message === 'Failed to fetch') {
        setStatus('Update failed: "Failed to fetch". Check browser CORS policy or mixed-content blocks.');
      } else {
        setStatus(`Update failed: ${err.message}`);
      }
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleShowLoxone = () => {
    if (!selectedNode) return;
    
    // Získáme element modulu (např. ImageChannel nebo Color), do kterého vybraný parametr patří
    const { name, element } = findModuleElement(selectedNode);

    // BEZPEČNOSTNÍ KONTROLA:
    // Zakážeme akci pouze pokud uživatel vybral přímo kořenovou složku ve stromu.
    // Pokud vybral parametr UVNITŘ (i když je to v rootu), povolíme to.
    if (selectedNode.id === nodes[0].id) {
      alert("Nemůžete generovat příkaz pro celou kořenovou složku. Vyberte konkrétní parametr uvnitř.");
      return;
    }

    // Uložíme si původní hodnotu, abychom ji pak vrátili zpět
    const originalValue = selectedNode.rawElement.textContent;
    // Dočasně nastavíme novou hodnotu z inputu do XML elementu
    selectedNode.rawElement.textContent = editValue;
    
    // Vyčistíme XML od jmenných prostorů (namespaces), které Loxone nemá rád
    let xmlBody = cleanXmlElement(element);
    let isDimmer = false;

    // Logika pro posuvníky (Range/Slider) -> Loxone Stmívač
    if (selectedNode.capabilities?.min !== undefined) {
      const tag = selectedNode.tag;
      // Najdeme v XML řetězci naši hodnotu a nahradíme ji zástupným znakem \v pro Loxone
      const pattern = `<${tag}>${editValue}</${tag}>`;
      const replacement = `<${tag}>\\v</${tag}>`;
      if (xmlBody.includes(pattern)) {
        xmlBody = xmlBody.replace(pattern, replacement);
        isDimmer = true;
      }
    }

    // Vrátíme původní hodnotu zpět do objektu (aby se nám nerozbilo UI aplikace)
    selectedNode.rawElement.textContent = originalValue; 

    // GENERUJEME URL CESTU:
    // Pokud je parametr součástí hlavního kořene (ImageChannel), posíláme data na BASE_PATH.
    // Pokud je v pod-sekci (např. Color), přidáme /Color.
    const pathSuffix = name === nodes[0].tag ? '' : `/${name}`;

    setLoxoneConfig({
      address: `http://${user}:${pass}@${ip}`, // Pro Loxone generujeme přímou IP (ne přes Proxy)
      instruction: `${BASE_PATH}${pathSuffix}`,
      body: xmlBody,
      isDimmer
    });
  };

  const handleNodeSelect = (node: HikNode) => {
    setSelectedNode(node);
    setEditValue(node.text);
  };

  const editorUI = useMemo(() => {
    if (!selectedNode) return <div className="text-gray-400 italic flex flex-col items-center justify-center h-full gap-4">
      <Database size={48} className="opacity-10" />
      <p>Select a parameter from the tree to edit</p>
    </div>;
    
    const isFolder = selectedNode.children.length > 0;
    if (isFolder) return <div className="text-amber-600 font-medium flex items-center gap-2">
      <Info size={20} />
      This is a folder. Select a specific parameter inside to modify its value.
    </div>;

    const caps = selectedNode.capabilities;
    
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
          <div className="text-xs text-blue-600 font-bold uppercase mb-1">API Path Context</div>
          <div className="text-sm font-mono break-all">{selectedNode.fullPath}</div>
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            Value for <span className="text-blue-600">&lt;{selectedNode.tag}&gt;</span>
          </label>
          
          {caps?.options ? (
            <select 
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            >
              {caps.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : caps?.min !== undefined ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs text-gray-500">
                <span className="bg-gray-100 px-2 py-1 rounded">Min: {caps.min}</span>
                <span className="font-bold text-blue-600 text-xl border-b-2 border-blue-200 px-2">{editValue}</span>
                <span className="bg-gray-100 px-2 py-1 rounded">Max: {caps.max}</span>
              </div>
              <input 
                type="range" 
                min={caps.min} 
                max={caps.max} 
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          ) : (
            <input 
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
          <button 
            onClick={handleShowLoxone}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors shadow-sm"
          >
            <Database size={18} className="mr-2" />
            Loxone Config
          </button>
          <button 
            onClick={handlePut}
            className="flex-1 inline-flex items-center justify-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors shadow-sm"
          >
            <Save size={18} className="mr-2" />
            Update Camera
          </button>
        </div>
      </div>
    );
  }, [selectedNode, editValue, handlePut, handleShowLoxone]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header Bar */}
      <header className="bg-slate-800 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-4">
          <div className="flex items-center gap-2 mr-4 group cursor-default">
            <Settings className="text-blue-400 group-hover:rotate-90 transition-transform duration-500" />
            <h1 className="font-bold text-lg tracking-tight">HikSmart Explorer</h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 flex-1 w-full md:w-auto">
            <div className="flex items-center bg-slate-700 rounded-md px-2 py-1 flex-1 min-w-[140px] focus-within:ring-2 ring-blue-500 transition-all">
              <span className="text-[10px] text-slate-400 mr-2 uppercase font-black">IP</span>
              <input 
                type="text" value={ip} onChange={e => setIp(e.target.value)} 
                placeholder="192.168.1.100"
                className="bg-transparent border-none outline-none text-sm w-full placeholder-slate-500"
              />
            </div>
            <div className="flex items-center bg-slate-700 rounded-md px-2 py-1 flex-1 min-w-[100px] focus-within:ring-2 ring-blue-500 transition-all">
              <span className="text-[10px] text-slate-400 mr-2 uppercase font-black">User</span>
              <input 
                type="text" value={user} onChange={e => setUser(e.target.value)} 
                className="bg-transparent border-none outline-none text-sm w-full"
              />
            </div>
            <div className="flex items-center bg-slate-700 rounded-md px-2 py-1 flex-1 min-w-[100px] focus-within:ring-2 ring-blue-500 transition-all">
              <span className="text-[10px] text-slate-400 mr-2 uppercase font-black">Pass</span>
              <input 
                type="password" value={pass} onChange={e => setPass(e.target.value)} 
                className="bg-transparent border-none outline-none text-sm w-full"
              />
            </div>
            <button 
              disabled={loading}
              onClick={loadData}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 px-5 py-1.5 rounded-md font-bold text-sm transition-all flex items-center shadow-lg active:scale-95"
            >
              {loading ? <span className="animate-spin mr-2">◌</span> : <Search size={16} className="mr-2" />}
              Load Configuration
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col md:flex-row gap-4 overflow-hidden h-[calc(100vh-140px)]">
        
        {/* Left Pane: Tree View */}
        <div className="w-full md:w-1/3 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-500 flex items-center uppercase tracking-wider">
              <Database size={14} className="mr-2" />
              Camera Parameters
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${nodes.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              {nodes.length > 0 ? 'Online' : 'Disconnected'}
            </span>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar bg-slate-50/30">
            {nodes.length > 0 ? (
              <TreeView nodes={nodes} onSelect={handleNodeSelect} selectedId={selectedNode?.id || null} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-gray-400">
                <AlertCircle size={48} className="mb-4 opacity-10" />
                <p className="text-sm">Connect to a camera to see its parameter tree.</p>
                <div className="mt-4 text-[10px] text-gray-400 max-w-[200px] leading-relaxed italic">
                  Tip: If using Chrome, you might need a "CORS Unblock" extension to talk to local devices.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Editor */}
        <div className="w-full md:w-2/3 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-bold text-gray-500 flex items-center uppercase tracking-wider">
              <Settings size={14} className="mr-2" />
              Modification Panel
            </span>
          </div>
          <div className="flex-1 p-6 overflow-auto custom-scrollbar">
            {editorUI}
          </div>
        </div>
      </main>

      {/* Status Bar */}
      <footer className="bg-slate-50 border-t border-gray-200 px-4 py-2 flex items-center justify-between text-[11px]">
        <div className={`flex items-center font-semibold truncate mr-4 ${
          statusType === 'error' ? 'text-red-600' : statusType === 'success' ? 'text-green-600' : 'text-slate-500'
        }`}>
          {statusType === 'error' && <AlertCircle size={12} className="mr-1.5 flex-shrink-0" />}
          {statusType === 'success' && <CheckCircle2 size={12} className="mr-1.5 flex-shrink-0" />}
          {statusType === 'info' && <Info size={12} className="mr-1.5 flex-shrink-0" />}
          <span className="truncate">{status}</span>
        </div>
        <div className="text-gray-400 flex-shrink-0 font-medium">
          Hikvision Explorer v2.1 | API: {BASE_PATH}
        </div>
      </footer>

      {/* Modals */}
      {loxoneConfig && (
        <LoxoneModal config={loxoneConfig} onClose={() => setLoxoneConfig(null)} />
      )}
    </div>
  );
};

export default App;
