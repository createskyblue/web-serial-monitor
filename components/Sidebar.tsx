import React from 'react';
import { SerialConfig, DataBits, StopBits, Parity, CommMode } from '../types';

interface SidebarProps {
  config: SerialConfig;
  setConfig: React.Dispatch<React.SetStateAction<SerialConfig>>;
  isConnected: boolean;
  isAutoLineBreak: boolean;
  setIsAutoLineBreak: (val: boolean) => void;
  isAutoScroll: boolean;
  setIsAutoScroll: (val: boolean) => void;
  maxBufferSize: number;
  setMaxBufferSize: (val: number) => void;
  currentBufferSize: number;
  commMode: CommMode;
  setCommMode: (val: CommMode) => void;
  wsUrl: string;
  setWsUrl: (val: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  isReconnecting?: boolean;
}

const baudRates = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
const bufferSizes = [
  { value: 50 * 1024, label: '50 KB' },
  { value: 100 * 1024, label: '100 KB' },
  { value: 200 * 1024, label: '200 KB' },
  { value: 500 * 1024, label: '500 KB' },
  { value: 1024 * 1024, label: '1 MB' },
  { value: 2 * 1024 * 1024, label: '2 MB' },
  { value: 5 * 1024 * 1024, label: '5 MB' },
  { value: 10 * 1024 * 1024, label: '10 MB' }
];

// 格式化缓冲区大小显示
const formatBufferSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const Sidebar: React.FC<SidebarProps> = ({
  config,
  setConfig,
  isConnected,
  isAutoLineBreak,
  setIsAutoLineBreak,
  isAutoScroll,
  setIsAutoScroll,
  maxBufferSize,
  setMaxBufferSize,
  currentBufferSize,
  commMode,
  setCommMode,
  wsUrl,
  setWsUrl,
  onConnect,
  onDisconnect,
  isReconnecting = false
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: name === 'baudRate' || name === 'dataBits' || name === 'stopBits' ? Number(value) : value
    }));
  };

  const handleBufferSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMaxBufferSize(Number(e.target.value));
  };

  const bufferUsagePercent = (currentBufferSize / maxBufferSize) * 100;
  const isBufferNearLimit = bufferUsagePercent > 80;

  return (
    <aside className="w-72 bg-white border-r flex flex-col h-full shadow-sm z-20">
      <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
        <h2 className="text-lg font-bold mb-6 text-gray-700 border-b pb-2 flex items-center">
          <i className="fas fa-cog mr-2 text-blue-500"></i>
          配置参数
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">通讯模式</label>
            <select
              value={commMode}
              onChange={(e) => setCommMode(e.target.value as CommMode)}
              disabled={isConnected}
              className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 outline-none"
            >
              <option value={CommMode.Serial}>串口 (Serial)</option>
              <option value={CommMode.WebSocket}>WebSocket</option>
            </select>
          </div>

          {commMode === CommMode.WebSocket ? (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">WebSocket 服务器地址</label>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                disabled={isConnected}
                placeholder="ws://localhost:8080"
                className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">支持 ws:// 或 wss:// 协议</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">波特率</label>
                <select name="baudRate" value={config.baudRate} onChange={handleChange} disabled={isConnected} className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 outline-none">
                  {baudRates.map(br => <option key={br} value={br}>{br}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">数据位</label>
                  <select name="dataBits" value={config.dataBits} onChange={handleChange} disabled={isConnected} className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 outline-none">
                    <option value={DataBits.Seven}>7</option>
                    <option value={DataBits.Eight}>8</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">停止位</label>
                  <select name="stopBits" value={config.stopBits} onChange={handleChange} disabled={isConnected} className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 outline-none">
                    <option value={StopBits.One}>1</option>
                    <option value={StopBits.Two}>2</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">校验位</label>
                <select name="parity" value={config.parity} onChange={handleChange} disabled={isConnected} className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 outline-none">
                  <option value={Parity.None}>None (无)</option>
                  <option value={Parity.Even}>Even (偶)</option>
                  <option value={Parity.Odd}>Odd (奇)</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">最大缓冲区大小</label>
            <select value={maxBufferSize} onChange={handleBufferSizeChange} className="w-full bg-gray-50 border border-gray-300 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              {bufferSizes.map(size => (
                <option key={size.value} value={size.value}>{size.label}</option>
              ))}
            </select>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>当前使用</span>
                <span>{formatBufferSize(currentBufferSize)} / {formatBufferSize(maxBufferSize)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-colors ${
                    isBufferNearLimit ? 'bg-red-500' : bufferUsagePercent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(bufferUsagePercent, 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-gray-500 mt-1 text-right">
                {bufferUsagePercent.toFixed(1)}% 使用中
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">终端设置</label>
            <div className="space-y-3 p-3 bg-gray-50 rounded-md border border-gray-200">
              <label className="flex items-center text-xs text-gray-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isAutoLineBreak}
                  onChange={(e) => setIsAutoLineBreak(e.target.checked)}
                  className="mr-2 rounded text-blue-600 focus:ring-0"
                />
                <span>按数据包强制换行</span>
              </label>
              
              <label className="flex items-center text-xs text-gray-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isAutoScroll}
                  onChange={(e) => setIsAutoScroll(e.target.checked)}
                  className="mr-2 rounded text-blue-600 focus:ring-0"
                />
                <span>自动滚动到底部</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-3 bg-white border-t">
        {!isConnected && !isReconnecting ? (
          <button onClick={onConnect} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors flex items-center justify-center">
            <i className={`fas ${commMode === CommMode.WebSocket ? 'fa-globe' : 'fa-plug'} mr-2`}></i>
            {commMode === CommMode.WebSocket ? '连接 WebSocket' : '开启串口'}
          </button>
        ) : (
          <button onClick={onDisconnect} className={`w-full ${isReconnecting ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-500 hover:bg-red-600'} text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors flex items-center justify-center`}>
            <i className={`fas ${isReconnecting ? 'fa-spinner fa-spin' : 'fa-power-off'} mr-2`}></i>
            {commMode === CommMode.WebSocket ? (isReconnecting ? '放弃重连' : '断开 WebSocket') : '关闭串口'}
          </button>
        )}
        
        {isBufferNearLimit && (
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
            <i className="fas fa-exclamation-triangle mr-1"></i>
            缓冲区接近上限，旧数据将被自动删除
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
