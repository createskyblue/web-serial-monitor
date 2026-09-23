import React, { useEffect, useLayoutEffect, useRef, useCallback, useState, useMemo } from 'react';
import { LogEntry, DisplayMode, Rule } from '../types';
import { hexToUint8Array, uint8ArrayToString } from '../utils/converters';

interface ColorSegment {
  text: string;
  color?: string;
  bgColor?: string;
}

function highlightText(text: string, data: Uint8Array, rules: Rule[]): ColorSegment[] {
  if (!rules.length) return [{ text }];

  // 收集所有匹配区间
  interface Interval {
    start: number;
    end: number;
    color: string;
    bgColor?: string;
    priority: number;
  }
  const intervals: Interval[] = [];

  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri];
    if (rule.enabled === false) continue; // 停用的规则不参与染色

    // 将 key 转换为可搜索的文本（Hex 模式先转换）
    const keyToText = (key: string, mode: DisplayMode): string => {
      if (!key) return '';
      if (mode === DisplayMode.Hex) {
        try {
          const bytes = hexToUint8Array(key);
          return uint8ArrayToString(bytes);
        } catch { return ''; }
      }
      return key;
    };

    const leftText = keyToText(rule.leftKey, rule.leftKeyMode);
    const rightText = keyToText(rule.rightKey, rule.rightKeyMode);

    // 区间模式：left + right 均非空
    if (leftText && rightText) {
      let searchFrom = 0;
      while (searchFrom < text.length) {
        const leftIdx = text.indexOf(leftText, searchFrom);
        if (leftIdx === -1) break;
        const rightIdx = text.indexOf(rightText, leftIdx + leftText.length);
        if (rightIdx === -1) break;
        intervals.push({
          start: leftIdx,
          end: rightIdx + rightText.length,
          color: rule.color,
          bgColor: rule.bgColor,
          priority: ri
        });
        searchFrom = rightIdx + rightText.length;
      }
    } else if (leftText) {
      // 关键词模式：仅填起始（结束留空），按 left 作为关键词染色
      let searchFrom = 0;
      while (searchFrom < text.length) {
        const idx = text.indexOf(leftText, searchFrom);
        if (idx === -1) break;
        intervals.push({
          start: idx,
          end: idx + leftText.length,
          color: rule.color,
          bgColor: rule.bgColor,
          priority: ri
        });
        searchFrom = idx + 1;
      }
    }
  }

  if (!intervals.length) return [{ text }];

  // 按 start 排序，同 start 时高 priority 排后（后覆盖前）
  intervals.sort((a, b) => a.start - b.start || a.priority - b.priority);

  // 合并重叠区间（后定义的规则覆盖前面的）
  const merged: Interval[] = [];
  for (const iv of intervals) {
    if (merged.length === 0) {
      merged.push({ ...iv });
      continue;
    }
    const last = merged[merged.length - 1];
    if (iv.start < last.end) {
      // 重叠：高 priority 覆盖
      if (iv.priority >= last.priority) {
        // 当前规则替换重叠部分
        if (iv.start > last.start) {
          last.end = iv.start; // 截断前一段
        } else {
          merged.pop(); // 完全覆盖
        }
        merged.push({ ...iv });
      }
      // 低 priority 忽略重叠部分
    } else {
      merged.push({ ...iv });
    }
  }

  // 切分文本为片段
  const segments: ColorSegment[] = [];
  let pos = 0;
  for (const iv of merged) {
    if (iv.start > pos) {
      segments.push({ text: text.slice(pos, iv.start) });
    }
    segments.push({ text: text.slice(iv.start, iv.end), color: iv.color, bgColor: iv.bgColor });
    pos = iv.end;
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos) });
  }
  return segments;
}

/** HEX 转换；仅在 \n（或 \r\n 的 \n）处换行，与文本列浏览器的换行行为保持一致 */
function bytesToHexWithBreaks(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    result += b.toString(16).padStart(2, '0').toUpperCase();
    if (b === 0x0D) {
      if (i + 1 < bytes.length && bytes[i + 1] === 0x0A) {
        result += ' '; // \r\n 中的 \r 不加换行，留给 \n 处理
      } else {
        result += ' '; // 独立 \r：文本列浏览器渲染不换行，HEX 侧也不换行，保持两列行数一致（如 0D 0D 0A）
      }
    } else if (b === 0x0A) {
      result += '\n'; // \n 或 \r\n 中的 \n
    } else {
      result += ' ';
    }
  }
  return result;
}

interface TerminalProps {
  logs: LogEntry[];
  displayMode: DisplayMode;
  isGroupByTimeout: boolean;
  isShowTimestamp: boolean;
  terminalEndRef: React.RefObject<HTMLDivElement>;
  aiAnalysis: string | null;
  onCloseAi: () => void;
  lineFrequency?: number;
  totalRxBytes?: number;
  totalTxBytes?: number;
  totalLogCount?: number;
  hasMoreChunks?: boolean;
  hiddenChunksCount?: number;
  onLoadMore?: () => void;
  /** 用户从历史区域滚回底部时触发（用于卸载已加载的旧渲染区域） */
  onReachedBottom?: () => void;
  rules?: Rule[];
  isConnected?: boolean;
}

const Terminal: React.FC<TerminalProps> = ({
  logs, displayMode, isGroupByTimeout, isShowTimestamp, terminalEndRef,
  lineFrequency, totalRxBytes = 0, totalTxBytes = 0,
  totalLogCount, hasMoreChunks = false, hiddenChunksCount = 0, onLoadMore, onReachedBottom,
  rules = [], isConnected = false
}) => {
  // 染色缓存（跨条目：拼接所有日志文本后统一匹配，再按每条日志切回）
  const coloredLogs = useMemo(() => {
    if (rules.length === 0) {
      return logs.map(log => ({ log, segments: [{ text: log.text } as ColorSegment] }));
    }

    const texts = logs.map(l => l.text);
    const joined = texts.join('');
    const joinedSegments = highlightText(joined, new Uint8Array(), rules);

    // 记录每个片段在 joined 中的 [start, end)
    const segRanges: { start: number; end: number; seg: ColorSegment }[] = [];
    let p = 0;
    for (const seg of joinedSegments) {
      segRanges.push({ start: p, end: p + seg.text.length, seg });
      p += seg.text.length;
    }

    // 按每条日志切回，片段跨日志边界时自动拆分
    const result: { log: LogEntry; segments: ColorSegment[] }[] = [];
    let logStart = 0;
    let si = 0;
    for (const log of logs) {
      const logEnd = logStart + log.text.length;
      const segs: ColorSegment[] = [];
      if (log.text.length > 0) {
        while (si < segRanges.length && segRanges[si].start < logEnd) {
          const r = segRanges[si];
          const s = Math.max(r.start, logStart);
          const e = Math.min(r.end, logEnd);
          if (s < e) {
            segs.push({ text: r.seg.text.slice(s - r.start, e - r.start), color: r.seg.color, bgColor: r.seg.bgColor });
          }
          if (r.end <= logEnd) si++;
          else break; // 该片段跨越到下一个日志，保留 si 供下一条继续切
        }
      }
      result.push({ log, segments: segs });
      logStart = logEnd;
    }
    return result;
  }, [logs, rules]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const isAtBottomRef = useRef(true); // 是否粘在底部（sticky）
  const lastScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  // 用户主动上滑意图（滚轮/触摸/键盘/滚动条），仅此时才解除粘底
  const userScrollUpRef = useRef(false);
  // 上滑意图产生时的 scrollTop，用于确认「真的往上滚了」而不是内容增高造成的离底
  const userScrollIntentTopRef = useRef(0);
  // 程序化粘底滚动进行中，期间的 scroll 事件不解除粘底
  const isProgrammaticScrollRef = useRef(false);
  // 用 ref 保存最新回调，避免滚动监听器重复注册导致闭包过期
  const onReachedBottomRef = useRef(onReachedBottom);
  onReachedBottomRef.current = onReachedBottom;
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isProgrammaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
    lastScrollHeightRef.current = el.scrollHeight;
    // 滚动事件异步派发，下一帧后再允许用户意图解锁
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, []);

  // 滚动：区分「内容变化导致的位移」与「用户真正上滑」
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 50; // 距离底部50px以内视为在底部
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < threshold;
    const topDelta = el.scrollTop - lastScrollTopRef.current;
    const heightDelta = el.scrollHeight - lastScrollHeightRef.current;
    const wasAtBottom = isAtBottomRef.current;

    if (atBottom) {
      isAtBottomRef.current = true;
      userScrollUpRef.current = false;
      // 从历史区域滚回底部 → 通知卸载已加载的旧区域（还原渲染窗口）
      if (!wasAtBottom) onReachedBottomRef.current?.();
    } else if (isProgrammaticScrollRef.current) {
      // 程序化粘底过程中，保持粘底状态
    } else if (userScrollUpRef.current) {
      // 有上滑意图且已离底：确认 scrollTop 相对意图时刻确实下降过，或已明显离开底部
      const intentTop = userScrollIntentTopRef.current;
      if (el.scrollTop <= intentTop - 1 || topDelta < -1) {
        isAtBottomRef.current = false;
      }
    } else if (isAtBottomRef.current && topDelta < -1) {
      // 高速出数时：内容增高/顶部块卸载/浏览器锚定都会让 scrollTop 回退，
      // 只要 scrollHeight 在变，就视为内容变化，保持粘底（由粘底滚动追回）。
      // 仅当内容高度几乎不变、scrollTop 却下降 → 滚动条拖拽等真实上滑，才解锁。
      if (Math.abs(heightDelta) <= threshold) {
        isAtBottomRef.current = false;
      }
    }
    // 内容增高导致暂时离底：保持原粘底状态，等 useLayoutEffect 粘底滚动跟上

    lastScrollTopRef.current = el.scrollTop;
    lastScrollHeightRef.current = el.scrollHeight;
  }, []);

  // 主动识别用户上滑意图（wheel/键盘/触摸在位置对比之前更可靠）
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const markScrollUpIntent = () => {
      const el = scrollContainerRef.current;
      userScrollUpRef.current = true;
      userScrollIntentTopRef.current = el?.scrollTop ?? 0;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) markScrollUpIntent();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') {
        markScrollUpIntent();
      }
    };
    let lastTouchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      lastTouchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (lastTouchY == null) return;
      const y = e.touches[0]?.clientY;
      if (y == null) return;
      // 手指下拉 = 内容上移（scrollTop 减小）= 用户上滑查看历史
      if (y - lastTouchY > 8) markScrollUpIntent();
      lastTouchY = y;
    };
    const onTouchEnd = () => {
      lastTouchY = null;
    };

    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // 新数据到达：粘底时在绘制前直接拉到底（避免 useEffect 过晚导致高速流断锁）
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (userScrollUpRef.current && el) {
      // 仅当相对上滑意图发生时 scrollTop 真的降了，才解除粘底；
      // 内容增高导致的离底（scrollTop 未降）仍继续粘底。
      if (el.scrollTop <= userScrollIntentTopRef.current - 1) {
        isAtBottomRef.current = false;
        lastScrollTopRef.current = el.scrollTop;
        lastScrollHeightRef.current = el.scrollHeight;
        return;
      }
      userScrollUpRef.current = false;
    }
    if (isAtBottomRef.current) {
      scrollToBottom();
    } else if (el) {
      lastScrollTopRef.current = el.scrollTop;
      lastScrollHeightRef.current = el.scrollHeight;
    }
  }, [logs, scrollToBottom]);

  const handleLoadMore = useCallback(() => {
    if (!onLoadMore || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    if (scrollContainerRef.current) {
      prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
    }
    onLoadMore();
  }, [onLoadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMoreChunks) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) handleLoadMore(); },
      { root: scrollContainerRef.current, threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreChunks, handleLoadMore]);

  useEffect(() => {
    if (prevScrollHeightRef.current > 0 && scrollContainerRef.current) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      scrollContainerRef.current.scrollTop += newScrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
      isLoadingMoreRef.current = false;
    }
  }, [logs]);

  return (
    <div className="flex-1 bg-white rounded-xl overflow-hidden shadow-sm flex flex-col relative border border-gray-200 h-full">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 p-4 overflow-y-auto custom-scrollbar font-mono text-[13px] bg-slate-50/20 ${
          displayMode === DisplayMode.Hex
            ? 'whitespace-pre-wrap break-all'      // HEX 保持现状：自动换行
            : displayMode === DisplayMode.Text
              ? 'overflow-x-auto whitespace-pre'   // 文本模式：不换行，超出显示横向滚动条（同窗模式文本列行为）
              : ''
        }`}
      >
        <div ref={sentinelRef} className="h-1 w-full" />

        {hasMoreChunks && (
          <div className="text-center py-1 text-[10px] text-gray-400 select-none">
            ↑ 上拉加载更多 (已隐藏 {hiddenChunksCount} 块)
          </div>
        )}

        {totalLogCount === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-300">
            <i className="fas fa-terminal text-4xl opacity-20 mb-2"></i>
            <p className="text-xs font-sans">等待串口数据...</p>
          </div>
        )}

        {displayMode === DisplayMode.SplitView ? (
          <div className="flex">
            {/* 左侧：文本列（overflow-x-scroll 始终预留横向滚动条高度，保证与右侧列高度对称） */}
            <div className="flex-1 overflow-x-scroll whitespace-pre border-r border-gray-300 pr-3 min-w-0">
              {coloredLogs.map(({ log, segments }, idx) => {
                const isSystem = log.type !== 'rx' && log.type !== 'tx';
                if (isSystem) {
                  return (
                    <span key={log.id} className="text-amber-600 block my-2 text-xs border-l-2 border-amber-200 pl-2">
                      {log.text}
                    </span>
                  );
                }
                const isFirst = idx === 0;
                const prevLog = idx > 0 ? coloredLogs[idx - 1].log : null;
                const prevIsSystem = prevLog && prevLog.type !== 'rx' && prevLog.type !== 'tx';
                const prevEndsNewline = prevLog && !prevIsSystem && prevLog.text.endsWith('\n');
                const secondChanged = prevLog && !prevIsSystem &&
                  Math.floor(log.timestamp.getTime() / 1000) !== Math.floor(prevLog.timestamp.getTime() / 1000);
                const showTs = isShowTimestamp && (isFirst || prevEndsNewline || secondChanged);
                return (
                  <span key={log.id} className={log.type === 'tx' ? 'text-blue-600' : 'text-slate-800'}>
                    {showTs && (
                      <span className="text-gray-400 text-[10px] select-none opacity-70 mr-1">
                        [{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalDigits: 3 } as any)}]
                      </span>
                    )}
                    {segments.map((seg, si) => (
                      <span key={si} style={{ color: seg.color, backgroundColor: seg.bgColor }}>{seg.text}</span>
                    ))}
                  </span>
                );
              })}
            </div>
            {/* 右侧：HEX 列 */}
            <div className="flex-1 overflow-x-scroll whitespace-pre pl-3 min-w-0">
              {coloredLogs.map(({ log, segments }, idx) => {
                const isSystem = log.type !== 'rx' && log.type !== 'tx';
                if (isSystem) {
                  return (
                    <span key={log.id} className="text-amber-600 block my-2 text-xs border-l-2 border-amber-200 pl-2">
                      {log.text}
                    </span>
                  );
                }
                const isFirst = idx === 0;
                const prevLog = idx > 0 ? coloredLogs[idx - 1].log : null;
                const prevIsSystem = prevLog && prevLog.type !== 'rx' && prevLog.type !== 'tx';
                const prevEndsNewline = prevLog && !prevIsSystem && prevLog.text.endsWith('\n');
                const secondChanged = prevLog && !prevIsSystem &&
                  Math.floor(log.timestamp.getTime() / 1000) !== Math.floor(prevLog.timestamp.getTime() / 1000);
                const showTs = isShowTimestamp && (isFirst || prevEndsNewline || secondChanged);
                return (
                  <span key={log.id} className={log.type === 'tx' ? 'text-blue-600' : 'text-slate-800'}>
                    {showTs && (
                      <span className="text-gray-400 text-[10px] select-none opacity-70 mr-1">
                        [{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalDigits: 3 } as any)}]
                      </span>
                    )}
                    {segments.map((seg, si) => {
                      const bytes = new TextEncoder().encode(seg.text);
                      return (
                        <span key={si} style={{ color: seg.color, backgroundColor: seg.bgColor }}>{bytesToHexWithBreaks(bytes)}</span>
                      );
                    })}
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="inline">
            {coloredLogs.map(({ log, segments }, idx) => {
              const isSystem = log.type !== 'rx' && log.type !== 'tx';
              if (isSystem) {
                return (
                  <span key={log.id} className="text-amber-600 block my-2 text-xs border-l-2 border-amber-200 pl-2">
                    {log.text}
                  </span>
                );
              }

              // 时间戳：仅在第一条、上条以 \n 结尾、或秒数变化时显示
              const isFirst = idx === 0;
              const prevLog = idx > 0 ? coloredLogs[idx - 1].log : null;
              const prevIsSystem = prevLog && prevLog.type !== 'rx' && prevLog.type !== 'tx';
              const prevEndsNewline = prevLog && !prevIsSystem && prevLog.text.endsWith('\n');
              const secondChanged = prevLog && !prevIsSystem &&
                Math.floor(log.timestamp.getTime() / 1000) !== Math.floor(prevLog.timestamp.getTime() / 1000);
              const showTs = isShowTimestamp && (isFirst || prevEndsNewline || secondChanged);

              return (
                <span key={log.id} className={log.type === 'tx' ? 'text-blue-600' : 'text-slate-800'}>
                  {showTs && (
                    <span className="text-gray-400 text-[10px] select-none opacity-70 mr-1">
                      [{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalDigits: 3 } as any)}]
                    </span>
                  )}
                  {displayMode === DisplayMode.Hex
                    ? segments.map((seg, si) => {
                        const bytes = new TextEncoder().encode(seg.text);
                        return (
                          <span key={si} style={{ color: seg.color, backgroundColor: seg.bgColor }}>{bytesToHexWithBreaks(bytes)}</span>
                        );
                      })
                    : segments.map((seg, si) => (
                      <span key={si} style={{ color: seg.color, backgroundColor: seg.bgColor }}>{seg.text}</span>
                    ))}
                </span>
              );
            })}
          </div>
        )}
        <div ref={terminalEndRef} className="h-4 w-full invisible" />
      </div>

      <div className="bg-white px-4 py-1.5 text-[10px] text-gray-400 flex justify-between border-t border-gray-100 font-sans select-none">
        <div className="flex space-x-4">
          <span>总行数: {totalLogCount ?? logs.length}</span>
          <span className="text-emerald-600">接收: {totalRxBytes} 字节</span>
          <span className="text-blue-600">发送: {totalTxBytes} 字节</span>
          <span className="text-purple-600">换行频率: {lineFrequency !== undefined ? `${lineFrequency} 行/秒` : '0 行/秒'}</span>
        </div>
        <div className={`flex items-center space-x-2 ${isConnected ? 'text-green-600' : 'text-gray-400'}`}>
          <i className={`fas fa-circle text-[6px] ${isConnected ? 'text-green-500' : 'text-gray-300'}`}></i>
          <span>{now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
};

export default Terminal;
