
import React, { useState, useRef, useEffect } from 'react';
import { DisplayMode, FileSendMode } from '../types';

interface SenderProps {
  onSend: (data: string, mode: DisplayMode) => void;
  onFileSend: (file: File, options: { mode: FileSendMode, throttleBytes: number, throttleMs: number, onProgress: (p: number) => void }) => Promise<void>;
  isConnected: boolean;
}

const Sender: React.FC<SenderProps> = ({ onSend, onFileSend, isConnected }) => {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<DisplayMode>(DisplayMode.Text);
  const [isTimerEnabled, setIsTimerEnabled] = useState(false);
  const [timerInterval, setTimerInterval] = useState(1000);
  const [addNewline, setAddNewline] = useState(false);
  
  // 文件发送相关
  const [fileSendMode, setFileSendMode] = useState<FileSendMode>(FileSendMode.Raw);
  const [throttleBytes, setThrottleBytes] = useState(128);
  const [throttleMs, setThrottleMs] = useState(10);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 定时发送逻辑
  useEffect(() => {
    let interval: any;
    if (isTimerEnabled && isConnected && input.trim()) {
      interval = setInterval(() => {
        const dataToSend = addNewline ? input + '\r\n' : input;
        onSend(dataToSend, mode);
      }, timerInterval);
    }
    return () => clearInterval(interval);
  }, [isTimerEnabled, isConnected, input, timerInterval, addNewline, mode, onSend]);

  const handleSendClick = () => {
    if (!input.trim()) return;
    const dataToSend = addNewline ? input + '\r\n' : input;
    onSend(dataToSend, mode);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileSendClick = async () => {
    if (!selectedFile || !isConnected) return;
    
    setIsSendingFile(true);
    setFileProgress(0);
    await onFileSend(selectedFile, {
      mode: fileSendMode,
      throttleBytes,
      throttleMs,
      onProgress: setFileProgress
    });
    setIsSendingFile(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isConnected) return;
    
    setIsSendingFile(true);
    setFileProgress(0);
    await onFileSend(file, {
      mode: fileSendMode,
      throttleBytes,
      throttleMs,
      onProgress: setFileProgress
    });
    setIsSendingFile(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex gap-4 flex-1 min-h-0">
        {/* 左侧：普通发送区 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex space-x-2 bg-gray-100 p-0.5 rounded-md">
              <button onClick={() => setMode(DisplayMode.Text)} className={`text-[10px] px-2 py-1 rounded transition-colors ${mode === DisplayMode.Text ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500'}`}>文本模式</button>
              <button onClick={() => setMode(DisplayMode.Hex)} className={`text-[10px] px-2 py-1 rounded transition-colors ${mode === DisplayMode.Hex ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500'}`}>Hex 模式</button>
            </div>
            
            <div className="flex items-center space-x-3 text-[11px]">
              <label className="flex items-center cursor-pointer text-gray-600">
                <input type="checkbox" checked={addNewline} onChange={e => setAddNewline(e.target.checked)} className="mr-1 rounded text-blue-600" />
                加 \r\n
              </label>
              <div className="flex items-center text-gray-600">
                <input type="checkbox" checked={isTimerEnabled} onChange={e => setIsTimerEnabled(e.target.checked)} className="mr-1 rounded text-blue-600" />
                定时发送
                <input 
                  type="number" value={timerInterval} onChange={e => setTimerInterval(Number(e.target.value))}
                  className="w-16 mx-1 px-1 border rounded text-center outline-none focus:ring-1 focus:ring-blue-500" 
                  disabled={isTimerEnabled}
                />
                ms
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-1 min-h-0">
            <textarea 
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={mode === DisplayMode.Hex ? "输入 Hex (如 01 02 FF)" : "输入文本内容..."}
              className="flex-1 h-full p-2 bg-gray-50 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
            <button 
              onClick={handleSendClick} disabled={!isConnected || !input.trim()}
              className="w-20 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg disabled:opacity-30 shadow-sm transition-all flex flex-col items-center justify-center shrink-0"
            >
              <i className="fas fa-paper-plane text-sm mb-1"></i>
              <span className="text-[11px]">发送</span>
            </button>
          </div>
        </div>

        {/* 右侧：文件发送区 */}
        <div className="w-72 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold text-gray-600">文件传输</h3>
            <div className="flex bg-gray-200 p-0.5 rounded text-[9px]">
              <button onClick={() => setFileSendMode(FileSendMode.Raw)} className={`px-2 py-0.5 rounded ${fileSendMode === FileSendMode.Raw ? 'bg-white shadow-sm font-bold text-blue-600' : 'text-gray-500'}`}>RAW</button>
              <button onClick={() => setFileSendMode(FileSendMode.YModem)} className={`px-2 py-0.5 rounded ${fileSendMode === FileSendMode.YModem ? 'bg-white shadow-sm font-bold text-blue-600' : 'text-gray-500'}`}>YModem</button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>每批发送 (字节)</span>
              <input type="number" value={throttleBytes} onChange={e => setThrottleBytes(Number(e.target.value))} className="w-14 px-1 border rounded text-center" />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>延迟 (毫秒)</span>
              <input type="number" value={throttleMs} onChange={e => setThrottleMs(Number(e.target.value))} className="w-14 px-1 border rounded text-center" />
            </div>
          </div>

          <div className="pt-1">
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
            
            {/* 显示选中的文件信息 */}
            {selectedFile && (
              <div className="text-[10px] text-gray-600 mb-2 p-2 bg-white border border-gray-200 rounded">
                <div className="flex items-center">
                  <i className="fas fa-file mr-2 text-blue-500"></i>
                  <span className="truncate flex-1">{selectedFile.name}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span>大小: {(selectedFile.size / 1024).toFixed(2)} KB</span>
                  <button 
                    onClick={() => setSelectedFile(null)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              </div>
            )}

            {/* 两个按钮：选择文件和发送 */}
            <div className="flex gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={!isConnected || isSendingFile}
                className={`flex-1 py-2 rounded-md text-[11px] font-bold transition-all shadow-sm flex items-center justify-center ${
                  isSendingFile ? 'bg-gray-100 text-gray-500' : 'bg-white border border-blue-500 text-blue-600 hover:bg-blue-50'
                }`}
              >
                <i className="fas fa-folder-open mr-2"></i>
                选择文件
              </button>
              <button 
                onClick={handleFileSendClick}
                disabled={!isConnected || isSendingFile || !selectedFile}
                className={`flex-1 py-2 rounded-md text-[11px] font-bold transition-all shadow-sm flex items-center justify-center ${
                  isSendingFile ? 'bg-amber-100 text-amber-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <i className={`fas ${isSendingFile ? 'fa-sync fa-spin' : 'fa-paper-plane'} mr-2`}></i>
                {isSendingFile ? `发送中 ${fileProgress}%` : '发送'}
              </button>
            </div>
            
            {isSendingFile && (
              <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                <div className="bg-amber-500 h-1 rounded-full transition-all" style={{ width: `${fileProgress}%` }}></div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sender;
