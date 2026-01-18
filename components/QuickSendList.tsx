
import React, { useRef } from 'react';
import { QuickSendItem, DisplayMode } from '../types';

interface QuickSendListProps {
  items: QuickSendItem[];
  onSend: (content: string, mode: DisplayMode) => void;
  onUpdate: (items: QuickSendItem[]) => void;
  isConnected: boolean;
  isReconnecting?: boolean;
}

const QuickSendList: React.FC<QuickSendListProps> = ({ items, onSend, onUpdate, isConnected, isReconnecting = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addItem = () => {
    const newItem: QuickSendItem = {
      id: Math.random().toString(36).substr(2, 9),
      label: '新指令',
      content: '',
      mode: DisplayMode.Text
    };
    onUpdate([...items, newItem]);
  };

  const removeItem = (id: string) => {
    onUpdate(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, updates: Partial<QuickSendItem>) => {
    onUpdate(items.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const exportData = () => {
    const dataStr = JSON.stringify(items, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `serial_quick_send_${new Date().getTime()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          onUpdate(json);
        }
      } catch (err) {
        alert('无效的 JSON 文件');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <aside className="w-80 bg-white border-l flex flex-col h-full shadow-sm z-20">
      <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700 flex items-center">
          <i className="fas fa-bolt mr-2 text-yellow-500"></i>
          快捷发送
        </h2>
        <div className="flex space-x-1">
          <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-white rounded transition-colors" title="导入">
            <i className="fas fa-file-import"></i>
          </button>
          <button onClick={exportData} className="p-1.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-white rounded transition-colors" title="导出">
            <i className="fas fa-file-export"></i>
          </button>
          <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {items.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-xs">
            暂无快捷指令
          </div>
        )}
        {items.map((item) => (
          <div key={item.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-200 transition-colors group">
            <div className="flex items-center justify-between mb-2">
              <input 
                value={item.label}
                onChange={(e) => updateItem(item.id, { label: e.target.value })}
                className="bg-transparent text-[11px] font-bold text-gray-600 focus:outline-none focus:text-blue-600 w-2/3"
                placeholder="指令名称"
              />
              <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                <i className="fas fa-times-circle text-xs"></i>
              </button>
            </div>
            
            <textarea 
              value={item.content}
              onChange={(e) => updateItem(item.id, { content: e.target.value })}
              className="w-full text-xs font-mono p-2 bg-white border border-gray-200 rounded mb-2 h-12 outline-none focus:border-blue-300 resize-none"
              placeholder="内容..."
            />
            
            <div className="flex items-center justify-between">
              <div className="flex bg-gray-200 p-0.5 rounded">
                <button 
                  onClick={() => updateItem(item.id, { mode: DisplayMode.Text })}
                  className={`px-2 py-0.5 text-[9px] rounded ${item.mode === DisplayMode.Text ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500'}`}
                >T</button>
                <button 
                  onClick={() => updateItem(item.id, { mode: DisplayMode.Hex })}
                  className={`px-2 py-0.5 text-[9px] rounded ${item.mode === DisplayMode.Hex ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500'}`}
                >H</button>
              </div>
              
              <button 
                onClick={() => onSend(item.content, item.mode)}
                disabled={(!isConnected && !isReconnecting) || !item.content}
                className="px-4 py-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-30 text-white text-[10px] font-bold rounded shadow-sm transition-colors flex items-center"
              >
                发送
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t">
        <button 
          onClick={addItem}
          className="w-full py-2 bg-white border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-500 hover:text-blue-600 rounded-lg text-xs font-medium transition-all"
        >
          <i className="fas fa-plus mr-1"></i> 添加快捷指令
        </button>
      </div>
    </aside>
  );
};

export default QuickSendList;
