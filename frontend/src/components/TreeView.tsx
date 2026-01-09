
import React, { useState } from 'react';
import { HikNode } from '../types';
import { ChevronRight, ChevronDown, Folder, FileCode } from 'lucide-react';

interface TreeViewProps {
  nodes: HikNode[];
  onSelect: (node: HikNode) => void;
  selectedId: string | null;
}

const TreeNode: React.FC<{ node: HikNode; onSelect: (node: HikNode) => void; selectedId: string | null; depth: number }> = ({ node, onSelect, selectedId, depth }) => {
  const [isOpen, setIsOpen] = useState(depth < 1); // Open root by default
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div className="select-none">
      <div 
        className={`flex items-center py-1 px-2 cursor-pointer transition-colors hover:bg-blue-50 ${isSelected ? 'bg-blue-100 text-blue-700' : ''}`}
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
        onClick={() => onSelect(node)}
      >
        <span 
          className="mr-1 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-blue-600"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }
          }}
        >
          {hasChildren ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
        </span>
        <span className="mr-2 text-gray-500">
          {hasChildren ? <Folder size={14} /> : <FileCode size={14} />}
        </span>
        <span className="text-sm font-medium truncate flex-1">{node.tag}</span>
        {!hasChildren && node.text && (
          <span className="text-xs text-gray-400 truncate max-w-[100px] ml-2">
            {node.text}
          </span>
        )}
      </div>
      {hasChildren && isOpen && (
        <div>
          {node.children.map(child => (
            <TreeNode key={child.id} node={child} onSelect={onSelect} selectedId={selectedId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const TreeView: React.FC<TreeViewProps> = ({ nodes, onSelect, selectedId }) => {
  return (
    <div className="py-2">
      {nodes.map(node => (
        <TreeNode key={node.id} node={node} onSelect={onSelect} selectedId={selectedId} depth={0} />
      ))}
    </div>
  );
};

export default TreeView;
