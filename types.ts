
export enum Parity {
  None = 'none',
  Even = 'even',
  Odd = 'odd'
}

export enum StopBits {
  One = 1,
  Two = 2
}

export enum DataBits {
  Seven = 7,
  Eight = 8
}

export interface SerialConfig {
  baudRate: number;
  dataBits: DataBits;
  stopBits: StopBits;
  parity: Parity;
  bufferSize: number;
  flowControl: 'none' | 'hardware';
}

export enum DisplayMode {
  Text = 'text',
  Hex = 'hex'
}

export enum FileSendMode {
  Raw = 'raw',
  YModem = 'ymodem'
}

export enum CommMode {
  Serial = 'serial',
  WebSocket = 'websocket',
  Bluetooth = 'bluetooth'
}

export interface BluetoothConfig {
  serviceUUID: string;
  characteristicUUID: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'rx' | 'tx' | 'info' | 'error';
  data: Uint8Array;
  text: string;
  byteCount: number; // 记录实际接收/发送的字节数
}

export interface QuickSendItem {
  id: string;
  label: string;
  content: string;
  mode: DisplayMode;
}
