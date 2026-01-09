import React from 'react';
import { LoxoneConfig } from '../types';
import { Copy, X, Info } from 'lucide-react';

interface LoxoneModalProps {
  config: LoxoneConfig;
  onClose: () => void;
}

const LoxoneModal: React.FC<LoxoneModalProps> = ({ config, onClose }) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const FieldRow = ({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) => (
    <div className="mb-4">
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-bold text-gray-700">{label}</label>
        <button 
          onClick={() => copyToClipboard(value)}
          className="p-1 hover:bg-gray-100 rounded text-blue-600 transition-colors"
          title="Copy to clipboard"
        >
          <Copy size={16} />
        </button>
      </div>
      {multiline ? (
        <textarea 
          readOnly 
          value={value}
          className="w-full h-32 p-2 text-xs font-mono bg-gray-50 border border-gray-200 rounded resize-none focus:outline-none"
        />
      ) : (
        <input 
          type="text" 
          readOnly 
          value={value}
          className="w-full p-2 text-sm bg-gray-50 border border-gray-200 rounded focus:outline-none"
        />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-blue-600 text-white">
          <h2 className="font-bold text-lg">Loxone Config Helper</h2>
          <button onClick={onClose} className="hover:bg-blue-700 p-1 rounded transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          <section className="mb-6">
            <h3 className="text-blue-600 font-semibold mb-3 border-b border-blue-100 pb-1">Nastavení objektu 'Virtuální výstup'</h3>
            <FieldRow label="Adresa" value={config.address} />
          </section>

          <section>
            <h3 className="text-blue-600 font-semibold mb-3 border-b border-blue-100 pb-1">Nastavení objektu 'Příkaz'</h3>
            <FieldRow label="Instrukce při zapnutí" value={config.instruction} />
            <FieldRow label="HTTP header při zapnutí" value="Content-Type: application/xml" />
            <FieldRow label="HTTP body při zapnutí" value={config.body} multiline />
            
            {config.isDimmer && (
              <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 p-2 rounded mb-4">
                <Info size={16} />
                {/* ZDE BYLA CHYBA: Nahrazeno '->' za '&gt;' */}
                <span>ℹ Obsahuje '\v' -&gt; Napojte tento příkaz na Stmívač v Loxone Configu.</span>
              </div>
            )}
            
            <FieldRow label="HTTP při zapnutí" value="PUT" />
          </section>
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition-colors"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoxoneModal;