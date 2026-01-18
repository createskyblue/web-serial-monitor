import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  SerialConfig,
  DataBits,
  StopBits,
  Parity,
  DisplayMode,
  LogEntry,
  QuickSendItem,
  FileSendMode,
  CommMode
} from './types';

// 蓝牙设备类型定义
interface BluetoothDevice {
  name?: string;
  gatt?: BluetoothRemoteGATTServer | null;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
  connected: boolean;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValue(value: Uint8Array): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
  value?: DataView;
}
import { 
  uint8ArrayToHex, 
  uint8ArrayToString, 
  stringToUint8Array, 
  hexToUint8Array 
} from './utils/converters';

// Standard components
import Sidebar from './components/Sidebar';
import Terminal from './components/Terminal';
import Sender from './components/Sender';
import QuickSendList from './components/QuickSendList';

interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    bufferSize?: number;
    flowControl?: string;
  }): Promise<void>;
  close(): Promise<void>;
}

const App: React.FC = () => {
  const [port, setPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAutoLineBreak, setIsAutoLineBreak] = useState(false);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [isPaused, setIsPaused] = useState(false); // 新增暂停状态
  const [maxBufferSize, setMaxBufferSize] = useState(100 * 1024); // 最大缓冲区大小，默认100KB

  // WebSocket 相关状态
  const [commMode, setCommMode] = useState<CommMode>(CommMode.Serial);
  const [wsUrl, setWsUrl] = useState(() => {
    const saved = localStorage.getItem('ws_url');
    return saved !== null ? saved : 'ws://localhost:8080';
  });
  const wsRef = useRef<WebSocket | null>(null);
  const shouldReconnectRef = useRef(true); // 控制是否自动重连
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null); // 重连定时器
  const [isReconnecting, setIsReconnecting] = useState(false); // 是否正在重连中

  // 蓝牙相关状态
  const [bluetoothServiceUUID, setBluetoothServiceUUID] = useState(() => {
    const saved = localStorage.getItem('bluetooth_service_uuid');
    return saved !== null ? saved : '';
  });
  const [bluetoothCharacteristicUUID, setBluetoothCharacteristicUUID] = useState(() => {
    const saved = localStorage.getItem('bluetooth_characteristic_uuid');
    return saved !== null ? saved : '';
  });
  const bluetoothDeviceRef = useRef<BluetoothDevice | null>(null);
  const bluetoothCharacteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const [config, setConfig] = useState<SerialConfig>({
    baudRate: 115200,
    dataBits: DataBits.Eight,
    stopBits: StopBits.One,
    parity: Parity.None,
    bufferSize: 255,
    flowControl: 'none'
  });
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(DisplayMode.Text);

  // 添加频率统计相关状态
  const [lineFrequency, setLineFrequency] = useState(0);
  const [splitPosition, setSplitPosition] = useState(60); // 分割条位置（百分比）
  const [isDragging, setIsDragging] = useState(false);

  const [quickSendItems, setQuickSendItems] = useState<QuickSendItem[]>(() => {
    const saved = localStorage.getItem('quick_send_list');
    return saved ? JSON.parse(saved) : [];
  });

  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const keepReadingRef = useRef(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const decoderRef = useRef(new TextDecoder("utf-8", { fatal: false }));
  const isPausedRef = useRef(false); // 使用ref来跟踪暂停状态，确保在异步函数中能获取最新值
  const maxBufferSizeRef = useRef(maxBufferSize); // 使用ref来跟踪maxBufferSize的最新值
  const sendQueueRef = useRef<{data: Uint8Array, text: string, mode: DisplayMode}[]>([]); // 发送队列
  const isSendingRef = useRef(false); // 是否正在发送
  
  // 用于统计每秒\n的计数器
  const newlineCountRef = useRef(0);
  const lastFrequencyUpdateRef = useRef(Date.now());

  // 同步isPaused状态到ref
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // 同步maxBufferSize状态到ref
  useEffect(() => {
    maxBufferSizeRef.current = maxBufferSize;
  }, [maxBufferSize]);

  // 保存最大缓冲区设置到localStorage
  useEffect(() => {
    localStorage.setItem('max_buffer_size', maxBufferSize.toString());
  }, [maxBufferSize]);

  // 从localStorage恢复设置
  useEffect(() => {
    const saved = localStorage.getItem('max_buffer_size');
    if (saved) {
      setMaxBufferSize(parseInt(saved, 10));
    }
  }, []);

  // 保存WebSocket URL到localStorage
  useEffect(() => {
    localStorage.setItem('ws_url', wsUrl);
  }, [wsUrl]);

  useEffect(() => {
    localStorage.setItem('quick_send_list', JSON.stringify(quickSendItems));
  }, [quickSendItems]);

  useEffect(() => {
    if (isAutoScroll) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [logs, isAutoScroll]);

  // 更新频率统计的定时器
  useEffect(() => {
    const frequencyTimer = setInterval(() => {
      const now = Date.now();
      const timeDiff = now - lastFrequencyUpdateRef.current;
      
      if (timeDiff >= 1000) { // 每秒更新一次
        setLineFrequency(newlineCountRef.current);
        newlineCountRef.current = 0; // 重置计数器
        lastFrequencyUpdateRef.current = now;
      }
    }, 1000);

    return () => clearInterval(frequencyTimer);
  }, []);

  // 计算当前缓冲区使用量 - 修复重复计算问题
  const calculateBufferSize = useCallback((logs: LogEntry[]) => {
    return logs.reduce((total, log) => {
      // 只计算原始数据大小，不重复计算文本
      return total + log.data.length;
    }, 0);
  }, []);

  const addLog = useCallback((type: LogEntry['type'], data: Uint8Array, newText: string) => {
    console.log('addLog called:', type, newText.substring(0, 50)); // 调试日志
    
    setLogs(prev => {
      let updatedLogs: LogEntry[];
      
      // 简化逻辑：每次都创建新日志，不进行合并
      // 检查新文本中包含多少个\n，更新计数器
      if (type === 'rx') {
        const newlineCount = (newText.match(/\n/g) || []).length;
        newlineCountRef.current += newlineCount;
      }
      
      const newLog: LogEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        type,
        data,
        text: newText,
        byteCount: data.length // 记录实际字节数
      };
      updatedLogs = [...prev, newLog];
      
      console.log('Updated logs before buffer check:', updatedLogs.length); // 调试日志
      
      // 重新启用缓冲区检查
      // 简化缓冲区检查 - 只在日志数量过多时清理
      if (updatedLogs.length > 1000) {
        // 删除最旧的500条记录
        const trimmedLogs = updatedLogs.slice(-500);
        console.log(`日志数量过多，已清理。当前数量: ${trimmedLogs.length}`);
        return trimmedLogs;
      }
      
      // 检查缓冲区大小限制 - 使用ref获取最新的maxBufferSize
      const currentSize = calculateBufferSize(updatedLogs);
      const currentMaxBufferSize = maxBufferSizeRef.current; // 从ref获取最新值
      console.log(`检查缓冲区: 当前大小=${currentSize}, 限制=${currentMaxBufferSize}`); // 调试日志
      
      if (currentSize > currentMaxBufferSize) {
        // 从最旧的记录开始删除，直到缓冲区大小在限制内
        let tempLogs = [...updatedLogs];
        while (calculateBufferSize(tempLogs) > currentMaxBufferSize && tempLogs.length > 10) {
          tempLogs.shift();
        }
        console.log(`缓冲区超限，已清理。当前大小: ${calculateBufferSize(tempLogs)}, 限制: ${currentMaxBufferSize}`);
        return tempLogs;
      }
      
      console.log('Final logs count:', updatedLogs.length); // 调试日志
      return updatedLogs;
    });
  }, [calculateBufferSize]); // 只依赖calculateBufferSize

  const disconnect = async () => {
    if (commMode === CommMode.Bluetooth) {
      // 蓝牙断开
      if (bluetoothDeviceRef.current && bluetoothDeviceRef.current.gatt) {
        try {
          await bluetoothDeviceRef.current.gatt.disconnect();
        } catch (e) {}
      }
      bluetoothDeviceRef.current = null;
      bluetoothCharacteristicRef.current = null;
      setIsConnected(false);
      setIsPaused(false);
      addLog('info', new Uint8Array(), '蓝牙已断开');
    } else if (commMode === CommMode.WebSocket) {
      // WebSocket 断开 - 用户主动关闭
      shouldReconnectRef.current = false; // 禁止自动重连
      setIsReconnecting(false); // 清除重连状态
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      setIsPaused(false);
      addLog('info', new Uint8Array(), 'WebSocket 已关闭');
    } else {
      // 串口断开
      keepReadingRef.current = false;
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (port) {
        try { await port.close(); } catch (e) {}
        setPort(null);
      }
      setIsConnected(false);
      setIsPaused(false);
      addLog('info', new Uint8Array(), '串口已关闭');
    }
  };

  const connect = async () => {
    if (commMode === CommMode.Bluetooth) {
      // 蓝牙连接
      if (!('bluetooth' in navigator)) {
        alert('您的浏览器不支持 Web Bluetooth API。请使用 Chrome 或 Edge 浏览器。');
        return;
      }

      if (!bluetoothServiceUUID || !bluetoothCharacteristicUUID) {
        alert('请先配置蓝牙服务 UUID 和特征 UUID');
        return;
      }

      try {
        // 请求蓝牙设备
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [{ services: [bluetoothServiceUUID] }],
          optionalServices: [bluetoothServiceUUID]
        });

        addLog('info', new Uint8Array(), `正在连接蓝牙设备: ${device.name || '未知设备'}`);

        // 连接到 GATT 服务器
        const server = await device.gatt!.connect();
        addLog('info', new Uint8Array(), 'GATT 服务器已连接');

        // 获取服务
        const service = await server.getPrimaryService(bluetoothServiceUUID);
        addLog('info', new Uint8Array(), '已获取服务');

        // 获取特征
        const characteristic = await service.getCharacteristic(bluetoothCharacteristicUUID);
        addLog('info', new Uint8Array(), '已获取特征');

        // 保存设备引用
        bluetoothDeviceRef.current = device;
        bluetoothCharacteristicRef.current = characteristic;

        // 订阅通知
        await characteristic.startNotifications();
        addLog('info', new Uint8Array(), '已启用通知');

        // 监听特征值变化
        characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
          if (isPausedRef.current) return;
          const value = event.target.value;
          const data = new Uint8Array(value.buffer);
          const textChunk = decoderRef.current.decode(data, { stream: true });
          addLog('rx', data, textChunk);
        });

        setIsConnected(true);
        addLog('info', new Uint8Array(), `蓝牙已连接: ${device.name || '未知设备'}`);

        // 监听断开连接事件
        device.addEventListener('gattserverdisconnected', () => {
          if (commMode === CommMode.Bluetooth && isConnected) {
            setIsConnected(false);
            setIsPaused(false);
            bluetoothDeviceRef.current = null;
            bluetoothCharacteristicRef.current = null;
            addLog('info', new Uint8Array(), '蓝牙设备已断开');
          }
        });
      } catch (err: any) {
        addLog('error', new Uint8Array(), `蓝牙连接失败: ${err.message}`);
      }
    } else if (commMode === CommMode.WebSocket) {
      // WebSocket 连接
      if (!wsUrl) {
        alert('请输入 WebSocket 服务器地址');
        return;
      }
      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          setIsConnected(true);
          setIsReconnecting(false);
          addLog('info', new Uint8Array(), `WebSocket 已连接: ${wsUrl}`);
        };

        ws.onmessage = (event) => {
          if (isPausedRef.current) return;
          let data: Uint8Array;
          let text: string;
          
          // 原样显示数据，不管text还是raw，不管是否乱码
          if (event.data instanceof ArrayBuffer) {
            data = new Uint8Array(event.data);
            // 不管是否乱码，原样解码显示
            text = decoderRef.current.decode(data, { stream: true });
          } else if (typeof event.data === 'string') {
            text = event.data;
            // 文本转为字节数组
            const encoder = new TextEncoder();
            data = encoder.encode(text);
          } else {
            // Blob或其他类型
            text = '[二进制数据]';
            data = new Uint8Array(0);
          }
          
          addLog('rx', data, text);
        };

        ws.onerror = (error) => {
          addLog('error', new Uint8Array(), `WebSocket 错误: ${error}`);
        };

        ws.onclose = () => {
          setIsConnected(false);
          setIsPaused(false);
          wsRef.current = null;
          
          // 如果需要重连，则启动自动重连
          if (shouldReconnectRef.current && commMode === CommMode.WebSocket) {
            setIsReconnecting(true);
            addLog('info', new Uint8Array(), 'WebSocket 连接已断开，1秒后尝试重连...');
            reconnectTimerRef.current = setTimeout(() => {
              connect();
            }, 1000);
          } else {
            setIsReconnecting(false);
            addLog('info', new Uint8Array(), 'WebSocket 连接已关闭');
          }
        };

        wsRef.current = ws;
        // 重置重连标志，允许自动重连
        shouldReconnectRef.current = true;
      } catch (err: any) {
        addLog('error', new Uint8Array(), `WebSocket 连接失败: ${err.message}`);
      }
    } else {
      // 串口连接
      if (!('serial' in navigator)) {
        alert('您的浏览器不支持 Web Serial API。');
        return;
      }
      try {
        const selectedPort = await (navigator as any).serial.requestPort();
        await selectedPort.open({
          baudRate: config.baudRate,
          dataBits: config.dataBits,
          stopBits: config.stopBits,
          parity: config.parity,
          flowControl: config.flowControl
        });
        setPort(selectedPort);
        setIsConnected(true);
        keepReadingRef.current = true;
        addLog('info', new Uint8Array(), `已连接: ${config.baudRate} bps`);
        readLoop(selectedPort);
      } catch (err: any) {
        addLog('error', new Uint8Array(), `连接失败: ${err.message}`);
      }
    }
  };

  const readLoop = async (selectedPort: SerialPort) => {
    decoderRef.current = new TextDecoder("utf-8", { fatal: false });
    while (selectedPort.readable && keepReadingRef.current) {
      const reader = selectedPort.readable.getReader();
      readerRef.current = reader;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          // 使用ref检查暂停状态，确保获取最新值
          if (value && !isPausedRef.current) { 
            const textChunk = decoderRef.current.decode(value, { stream: true });
            console.log('收到数据:', textChunk); // 调试日志
            addLog('rx', value, textChunk);
          }
        }
      } catch (error) {
        console.error('Read error:', error);
      } finally {
        reader.releaseLock();
      }
    }
  };

  const sendData = async (input: string, mode: DisplayMode) => {
    // 如果暂停状态，不允许发送数据
    if (isPaused) {
      addLog('error', new Uint8Array(), '发送失败: 已暂停');
      return;
    }

    const data = mode === DisplayMode.Hex ? hexToUint8Array(input) : stringToUint8Array(input);
    // 将数据解码为文本，确保log.text始终是文本格式
    const textToSend = uint8ArrayToString(data);
    // 先添加发送日志，确保在回环数据之前显示
    addLog('tx', data, textToSend);
    
    // 添加到发送队列，包含mode信息
    sendQueueRef.current.push({ data, text: textToSend, mode });
    
    // 触发队列处理
    processSendQueue();
  };

  const exportLogs = (format: 'txt' | 'bin') => {
    if (logs.length === 0) return;
    let blob: Blob;
    let filename = `serial_log_${new Date().getTime()}`;

    // 只导出RX和TX数据，不包含系统日志信息
    const content = logs.filter(l => l.type === 'rx' || l.type === 'tx').map(l => l.text).join('');
    blob = new Blob([content], { type: 'text/plain' });
    filename += format === 'txt' ? '.txt' : '.bin';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 一键复制功能
  const copyLogs = () => {
    if (logs.length === 0) return;
    
    // 只复制RX和TX数据，不包含系统日志信息
    const content = logs.filter(l => l.type === 'rx' || l.type === 'tx').map(l => l.text).join('');
    
    navigator.clipboard.writeText(content).then(() => {
      console.log('日志已复制到剪贴板');
    }).catch(err => {
      console.error('复制失败:', err);
      // 降级方案：使用传统的复制方法
      const textArea = document.createElement('textarea');
      textArea.value = content;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        console.log('日志已复制到剪贴板（降级方案）');
      } catch (err) {
        console.error('复制失败（降级方案）:', err);
      }
      document.body.removeChild(textArea);
    });
  };

  // 处理文件流发送
  const handleFileSend = async (file: File, options: { mode: FileSendMode, throttleBytes: number, throttleMs: number, onProgress: (p: number) => void }) => {
    // 如果暂停状态，不允许发送文件
    if (isPaused) {
      addLog('error', new Uint8Array(), '文件发送失败: 已暂停');
      return;
    }

    if (commMode === CommMode.Bluetooth) {
      // 蓝牙模式发送文件
      if (!bluetoothCharacteristicRef.current) {
        addLog('error', new Uint8Array(), '文件发送失败: 蓝牙未连接');
        return;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const total = data.length;

        // 添加文件发送的TX日志
        addLog('tx', data, `文件: ${file.name} (${total} 字节)`);
        addLog('info', new Uint8Array(), `开始发送文件: ${file.name} (${total} 字节)`);

        let sent = 0;
        while (sent < total) {
          if (isPaused) {
            addLog('error', new Uint8Array(), '文件发送中断: 已暂停');
            break;
          }

          // 蓝牙MTU限制，通常最大512字节，使用安全值20字节
          const chunkSize = Math.min(options.throttleBytes, 20);
          const chunk = data.slice(sent, sent + chunkSize);
          await bluetoothCharacteristicRef.current.writeValue(chunk);
          sent += chunk.length;
          options.onProgress(Math.round((sent / total) * 100));

          if (options.throttleMs > 0 && sent < total) {
            await new Promise(resolve => setTimeout(resolve, options.throttleMs));
          }
        }

        if (!isPaused) {
          addLog('info', new Uint8Array(), '文件发送完毕');
        }
      } catch (err: any) {
        addLog('error', new Uint8Array(), `文件发送中断: ${err.message}`);
      }
    } else if (commMode === CommMode.WebSocket) {
      // WebSocket 模式发送文件
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        addLog('error', new Uint8Array(), '文件发送失败: WebSocket 未连接');
        return;
      }
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const total = data.length;
        
        // 添加文件发送的TX日志，用于计数
        addLog('tx', data, `文件: ${file.name} (${total} 字节)`);
        addLog('info', new Uint8Array(), `开始发送文件: ${file.name} (${total} 字节)`);
        
        let sent = 0;
        while (sent < total) {
          // 检查是否在发送过程中被暂停
          if (isPaused) {
            addLog('error', new Uint8Array(), '文件发送中断: 已暂停');
            break;
          }
          
          const chunk = data.slice(sent, sent + options.throttleBytes);
          wsRef.current.send(chunk);
          sent += chunk.length;
          options.onProgress(Math.round((sent / total) * 100));
          
          if (options.throttleMs > 0 && sent < total) {
            await new Promise(resolve => setTimeout(resolve, options.throttleMs));
          }
        }
        
        if (!isPaused) {
          addLog('info', new Uint8Array(), '文件发送完毕');
        }
      } catch (err: any) {
        addLog('error', new Uint8Array(), `文件发送中断: ${err.message}`);
      }
    } else {
      // 串口模式发送文件
      if (!port || !port.writable) return;
      
      const writer = port.writable.getWriter();
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const total = data.length;
      
      // 添加文件发送的TX日志，用于计数
      addLog('tx', data, `文件: ${file.name} (${total} 字节)`);
      
      try {
        addLog('info', new Uint8Array(), `开始发送文件: ${file.name} (${total} 字节)`);
        
        let sent = 0;
        while (sent < total) {
          // 检查是否在发送过程中被暂停
          if (isPaused) {
            addLog('error', new Uint8Array(), '文件发送中断: 已暂停');
            break;
          }
          
          const chunk = data.slice(sent, sent + options.throttleBytes);
          await writer.write(chunk);
          sent += chunk.length;
          options.onProgress(Math.round((sent / total) * 100));
          
          if (options.throttleMs > 0 && sent < total) {
            await new Promise(resolve => setTimeout(resolve, options.throttleMs));
          }
        }
        
        if (!isPaused) {
          addLog('info', new Uint8Array(), '文件发送完毕');
        }
      } catch (err: any) {
        addLog('error', new Uint8Array(), `文件发送中断: ${err.message}`);
      } finally {
        writer.releaseLock();
      }
    }
  };

  // 发送队列处理函数
  const processSendQueue = useCallback(async () => {
    if (isSendingRef.current || sendQueueRef.current.length === 0) {
      return;
    }

    isSendingRef.current = true;

    while (sendQueueRef.current.length > 0) {
      const item = sendQueueRef.current.shift();
      if (!item) break;

      try {
        if (commMode === CommMode.Bluetooth) {
          // 蓝牙模式发送
          if (bluetoothCharacteristicRef.current) {
            // 蓝牙发送字节数据
            await bluetoothCharacteristicRef.current.writeValue(item.data);
          }
        } else if (commMode === CommMode.WebSocket) {
          // WebSocket 模式发送
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // 根据发送模式选择发送方式
            if (item.mode === DisplayMode.Hex) {
              // Hex模式：发送字节数据
              wsRef.current.send(item.data);
            } else {
              // Text模式：直接发送文本字符串
              wsRef.current.send(item.text);
            }
          }
        } else {
          // 串口模式发送（始终发送字节数据）
          if (port && port.writable) {
            const writer = port.writable.getWriter();
            await writer.write(item.data);
            writer.releaseLock();
          }
        }
      } catch (err: any) {
        addLog('error', new Uint8Array(), `发送失败: ${err.message}`);
      }
    }

    isSendingRef.current = false;
  }, [commMode, port]);

  // 切换暂停状态
  const togglePause = () => {
    if (!isConnected) return;
    
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    
    if (newPausedState) {
      addLog('info', new Uint8Array(), '串口数据已暂停');
    } else {
      addLog('info', new Uint8Array(), '串口数据已恢复');
    }
  };

  // 格式化缓冲区大小显示
  const formatBufferSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const currentBufferSize = calculateBufferSize(logs);

  // 处理分割条拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const mainElement = document.querySelector('main');
      if (!mainElement) return;
      
      const rect = mainElement.getBoundingClientRect();
      const headerHeight = rect.top + 56; // header height approximately
      const footerHeight = 80; // sender minimum height
      const totalHeight = window.innerHeight - headerHeight - footerHeight;
      
      // 计算新的分割位置（限制在10%-90%之间）
      const relativeY = e.clientY - headerHeight;
      const newPercent = Math.max(10, Math.min(90, (relativeY / (window.innerHeight - headerHeight - footerHeight)) * 100));
      setSplitPosition(newPercent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden text-gray-800">
      <Sidebar 
        config={config} setConfig={setConfig} isConnected={isConnected} 
        isAutoLineBreak={isAutoLineBreak} setIsAutoLineBreak={setIsAutoLineBreak}
        isAutoScroll={isAutoScroll} setIsAutoScroll={setIsAutoScroll}
        maxBufferSize={maxBufferSize} setMaxBufferSize={setMaxBufferSize}
        currentBufferSize={currentBufferSize}
        commMode={commMode} setCommMode={setCommMode}
        wsUrl={wsUrl} setWsUrl={setWsUrl}
        bluetoothServiceUUID={bluetoothServiceUUID} setBluetoothServiceUUID={setBluetoothServiceUUID}
        bluetoothCharacteristicUUID={bluetoothCharacteristicUUID} setBluetoothCharacteristicUUID={setBluetoothCharacteristicUUID}
        onConnect={connect} onDisconnect={disconnect} 
        isReconnecting={isReconnecting}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-blue-600 flex items-center">
              <i className="fas fa-microchip mr-2"></i>
              Web Serial Tool
            </h1>
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${isConnected ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
              {isConnected ? '已连接' : '未连接'}
            </div>
            {isConnected && (
              <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${isPaused ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white'}`}>
                {isPaused ? '已暂停' : '运行中'}
              </div>
            )}
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${currentBufferSize > maxBufferSize * 0.8 ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'}`}>
              缓冲区: {formatBufferSize(currentBufferSize)}/{formatBufferSize(maxBufferSize)}
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="bg-gray-100 p-1 rounded-lg flex border border-gray-200">
              <button onClick={() => setDisplayMode(DisplayMode.Text)} className={`px-3 py-1 text-xs rounded-md transition-colors ${displayMode === DisplayMode.Text ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500'}`}>文本</button>
              <button onClick={() => setDisplayMode(DisplayMode.Hex)} className={`px-3 py-1 text-xs rounded-md transition-colors ${displayMode === DisplayMode.Hex ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-gray-500'}`}>HEX</button>
            </div>
            
            <div className="flex bg-white border rounded-md overflow-hidden shadow-sm">
              <button onClick={() => exportLogs('txt')} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 border-r border-gray-100">
                <i className="fas fa-file-alt mr-1"></i> 导出 TXT
              </button>
              <button onClick={() => exportLogs('bin')} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                <i className="fas fa-file-code mr-1"></i> 导出 BIN
              </button>
            </div>
            
            {/* 一键复制按钮 */}
            <button 
              onClick={copyLogs}
              disabled={logs.length === 0}
              className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white border border-blue-600 rounded-md text-xs transition-colors shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <i className="fas fa-copy mr-1"></i> 复制
            </button>
            
            {/* 暂停按钮 */}
            <button 
              onClick={togglePause}
              disabled={!isConnected}
              className={`px-4 py-1.5 border rounded-md text-xs transition-colors shadow-sm ${
                isPaused 
                  ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-600' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'} mr-1`}></i>
              {isPaused ? '恢复' : '暂停'}
            </button>
            
            <button onClick={() => setLogs([])} className="px-4 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md text-xs transition-colors shadow-sm">
              清屏
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col" style={{ height: `${splitPosition}%` }}>
          <div className="flex-1 overflow-hidden p-2 flex flex-col">
            <Terminal 
              logs={logs} 
              displayMode={displayMode} 
              isAutoLineBreak={isAutoLineBreak}
              terminalEndRef={terminalEndRef}
              aiAnalysis={null}
              onCloseAi={() => {}}
              lineFrequency={lineFrequency}
            />
          </div>
        </div>

        {/* 分割条 */}
        <div 
          className="h-1 bg-gray-200 hover:bg-blue-400 cursor-row-resize transition-colors flex items-center justify-center"
          onMouseDown={handleMouseDown}
        ></div>
        

        <div className="bg-white shadow-sm m-2 mb-2" style={{ height: `${100 - splitPosition}%`, minHeight: '80px' }}>
          <Sender onSend={sendData} onFileSend={handleFileSend} isConnected={isConnected && !isPaused} isReconnecting={isReconnecting} />
        </div>
      </main>

      <QuickSendList items={quickSendItems} onUpdate={setQuickSendItems} onSend={sendData} isConnected={isConnected && !isPaused} isReconnecting={isReconnecting} />
    </div>
  );
};

export default App;
