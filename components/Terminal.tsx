import React from 'react';
import { LogEntry, DisplayMode } from '../types';
import { uint8ArrayToHex } from '../utils/converters';

interface TerminalProps {
  logs: LogEntry[];
  displayMode: DisplayMode;
  isAutoLineBreak: boolean;
  terminalEndRef: React.RefObject<HTMLDivElement>;
  aiAnalysis: string | null; // Keep prop for compatibility but don't use
  onCloseAi: () => void;
  lineFrequency?: number; // 新增频率属性
  totalRxBytes?: number; // 累计接收字节数
  totalTxBytes?: number; // 累计发送字节数
}

const Terminal: React.FC<TerminalProps> = ({ logs, displayMode, isAutoLineBreak, terminalEndRef, lineFrequency, totalRxBytes = 0, totalTxBytes = 0 }) => {
  return (
    <div className="flex-1 bg-white rounded-xl overflow-hidden shadow-sm flex flex-col relative border border-gray-200 h-full">
      {/* Logs Window */}
      <div className={`flex-1 p-4 overflow-y-auto custom-scrollbar font-mono text-[13px] bg-slate-50/20 ${!isAutoLineBreak ? 'whitespace-pre-wrap break-all' : ''}`}>
        {logs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-300">
            <i className="fas fa-terminal text-4xl opacity-20 mb-2"></i>
            <p className="text-xs font-sans">等待串口数据...</p>
          </div>
        )}

        {isAutoLineBreak ? (
          logs.map((log) => (
            <div key={log.id} className="flex px-1 mb-1 hover:bg-gray-100 rounded">
              <span className="text-gray-400 mr-3 w-24 shrink-0 text-[11px] select-none opacity-80">
                {log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalDigits: 3 } as any)}
              </span>
              <span className={`mr-2 w-10 shrink-0 font-bold text-center rounded text-[9px] py-0.5 self-center ${
                log.type === 'rx' ? 'bg-emerald-100 text-emerald-700' : 
                log.type === 'tx' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
              }`}>
                {log.type === 'rx' ? 'RX' : log.type === 'tx' ? 'TX' : 'SYS'}
              </span>
              <span className={`break-all leading-relaxed ${log.type === 'rx' ? 'text-slate-800' : log.type === 'tx' ? 'text-blue-600' : 'text-slate-400 italic'}`}>
                {log.type === 'rx' ? (displayMode === DisplayMode.Hex ? uint8ArrayToHex(log.data) : log.text) : 
                 log.type === 'tx' ? (displayMode === DisplayMode.Hex ? uint8ArrayToHex(log.data) + ' ' : log.text) : 
                 log.text}
              </span>
            </div>
          ))
        ) : (
          <div className="inline">
            {logs.map((log) => (
              <span 
                key={log.id} 
                className={`${log.type === 'rx' ? 'text-slate-800' : log.type === 'tx' ? 'text-blue-600' : 'text-amber-600 block my-2 text-xs border-l-2 border-amber-200 pl-2'}`}
              >
                {log.type === 'tx' ? (displayMode === DisplayMode.Hex ? uint8ArrayToHex(log.data) + ' ' : log.text) : 
                 log.type === 'rx' ? (displayMode === DisplayMode.Hex ? uint8ArrayToHex(log.data) + ' ' : log.text) : 
                 `串口状态: ${log.text}`}
              </span>
            ))}
          </div>
        )}
        <div ref={terminalEndRef} className="h-4 w-full invisible" />
      </div>

      {/* 底部状态栏 */}
      <div className="bg-white px-4 py-1.5 text-[10px] text-gray-400 flex justify-between border-t border-gray-100 font-sans select-none">
        <div className="flex space-x-4">
          <span>总行数: {logs.length}</span>
          <span className="text-emerald-600">接收: {totalRxBytes} 字节</span>
          <span className="text-blue-600">发送: {totalTxBytes} 字节</span>
          {/* 显示每秒换行符频率 */}
          <span className="text-purple-600">换行频率: {lineFrequency !== undefined ? `${lineFrequency} 行/秒` : '0 行/秒'}</span>
        </div>
        <div className="flex items-center space-x-2">
          <i className={`fas fa-circle text-[6px] ${logs.length > 0 ? 'text-green-500' : 'text-gray-300'}`}></i>
          <span>{isAutoLineBreak ? '分行显示' : '原始流'}</span>
        </div>
      </div>
    </div>
  );
};

export default Terminal;
