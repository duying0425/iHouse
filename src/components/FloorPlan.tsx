import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AnchorPosition, Area, Bounds } from "@/types";
import { cn } from "@/lib/utils";

const VB_W = 1000;
const VB_H = 720;

/** 内置户型图标识：使用 SVG 绘制 */
export const BUILTIN_FLOORPLAN = "builtin-floorplan";

/** bounds 调整把手类型：move=整体移动，其余为 8 个方向 */
export type Handle = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Marker {
  id: string;
  pos: AnchorPosition;
  label?: string;
  color?: string;
  active?: boolean;
}

interface FloorPlanProps {
  areas: Area[];
  /** 户型图底图（图片 URL/base64）；为 BUILTIN_FLOORPLAN 或空时使用内置 SVG */
  floorPlanImage?: string;
  /** 高亮某个区域（边框加粗 + 填色加深） */
  highlightAreaId?: string;
  /** 物品标记点 */
  itemMarkers?: Marker[];
  /** 当前激活的物品标记 id（脉冲强调） */
  activeMarkerId?: string;
  /** 是否可点选位置（录入用） */
  pickable?: boolean;
  /** 已选位置 */
  pickedPos?: AnchorPosition | null;
  onPick?: (pos: AnchorPosition) => void;
  /** 点击区域锚点 */
  onAreaClick?: (areaId: string) => void;
  /** 区域锚点可拖拽（设置模式用），拖拽结束回调 */
  editable?: boolean;
  onAreaMove?: (areaId: string, pos: AnchorPosition) => void;
  /** 区域矩形边界(bounds)可编辑（设置模式用），拖拽结束回调；传 null 清除 */
  boundsEditable?: boolean;
  onAreaBoundsChange?: (areaId: string, bounds: Bounds | null) => void;
  /** 是否显示区域序号锚点 */
  showAreaAnchors?: boolean;
  /** 紧凑模式（侧栏小图） */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

const pctToX = (p: number) => (p / 100) * VB_W;
const pctToY = (p: number) => (p / 100) * VB_H;

const MIN_SIZE = 2; // bounds 最小宽高（百分比）

/** 根据 handle 类型与指针位移计算新 bounds (锚定相反边拉伸，防止越界移位) */
export function resizeBounds(
  start: Bounds,
  handle: Handle,
  dx: number,
  dy: number
): Bounds {
  let { x, y, w, h } = start;

  // 水平拉伸：固定相对侧边缘
  if (handle === "move") {
    x = Math.max(0, Math.min(100 - w, x + dx));
  } else {
    if (handle === "nw" || handle === "w" || handle === "sw") {
      const right = start.x + start.w;
      x = Math.max(0, Math.min(right - MIN_SIZE, start.x + dx));
      w = right - x;
    }
    if (handle === "ne" || handle === "e" || handle === "se") {
      w = Math.max(MIN_SIZE, Math.min(100 - start.x, start.w + dx));
    }
  }

  // 垂直拉伸：固定相对侧边缘
  if (handle === "move") {
    y = Math.max(0, Math.min(100 - h, y + dy));
  } else {
    if (handle === "nw" || handle === "n" || handle === "ne") {
      const bottom = start.y + start.h;
      y = Math.max(0, Math.min(bottom - MIN_SIZE, start.y + dy));
      h = bottom - y;
    }
    if (handle === "sw" || handle === "s" || handle === "se") {
      h = Math.max(MIN_SIZE, Math.min(100 - start.y, start.h + dy));
    }
  }

  return { x, y, w, h };
}

export default function FloorPlan({
  areas,
  floorPlanImage,
  highlightAreaId,
  itemMarkers = [],
  activeMarkerId,
  pickable = false,
  pickedPos,
  onPick,
  onAreaClick,
  editable = false,
  onAreaMove,
  boundsEditable = false,
  onAreaBoundsChange,
  showAreaAnchors = true,
  compact = false,
  className,
  style,
}: FloorPlanProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // 锚点拖拽：ref 避免闭包过期；state 触发视觉刷新
  const dragIdRef = useRef<string | null>(null);
  const dragPosRef = useRef<AnchorPosition | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<AnchorPosition | null>(null);

  // bounds 拖拽：与锚点拖拽互斥（同一时间只进行一种）
  const dragBoundsIdRef = useRef<string | null>(null);
  const dragHandleRef = useRef<Handle | null>(null);
  const dragStartBoundsRef = useRef<Bounds | null>(null);
  const dragPointerStartRef = useRef<AnchorPosition | null>(null);
  const [dragBoundsId, setDragBoundsId] = useState<string | null>(null);
  const [dragBoundsCurrent, setDragBoundsCurrent] = useState<Bounds | null>(null);
  const dragBoundsCurrentRef = useRef<Bounds | null>(null);

  const isImageMode =
    !!floorPlanImage && floorPlanImage !== BUILTIN_FLOORPLAN;

  /** 把鼠标/指针坐标转为百分比（0-100，并 clamp） */
  const toPct = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }, []);

  const handlePick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!pickable || !onPick) return;
      const p = toPct(e.clientX, e.clientY);
      if (p) onPick(p);
    },
    [pickable, onPick, toPct]
  );

  /**
   * 锚点拖拽：拖拽期间只更新本地 state（不写 store），避免每个像素触发全局 re-render。
   * pointer capture 绑定在稳定的 <svg> 上，保证 pointerup 一定能收到。
   * pointerup 时才把最终位置写入 store（仅一次）。
   */
  const startAnchorDrag = useCallback(
    (e: React.PointerEvent, areaId: string) => {
      if (!editable) return;
      e.stopPropagation();
      dragIdRef.current = areaId;
      setDragId(areaId);
      const p = toPct(e.clientX, e.clientY);
      dragPosRef.current = p;
      setDragPos(p);
      svgRef.current?.setPointerCapture?.(e.pointerId);
    },
    [editable, toPct]
  );

  /** bounds 拖拽：move=整体移动，其余=调整对应边/角 */
  const startBoundsDrag = useCallback(
    (e: React.PointerEvent, areaId: string, handle: Handle, current: Bounds) => {
      if (!boundsEditable || !onAreaBoundsChange) return;
      e.stopPropagation();
      dragBoundsIdRef.current = areaId;
      dragHandleRef.current = handle;
      dragStartBoundsRef.current = current;
      const p = toPct(e.clientX, e.clientY);
      dragPointerStartRef.current = p;
      setDragBoundsId(areaId);
      setDragBoundsCurrent(current);
      dragBoundsCurrentRef.current = current;
      svgRef.current?.setPointerCapture?.(e.pointerId);
    },
    [boundsEditable, onAreaBoundsChange, toPct]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // bounds 拖拽优先
      if (dragBoundsIdRef.current) {
        const p = toPct(e.clientX, e.clientY);
        const start = dragStartBoundsRef.current;
        const sp = dragPointerStartRef.current;
        const handle = dragHandleRef.current;
        if (!p || !start || !sp || !handle) return;
        const next = resizeBounds(start, handle, p.x - sp.x, p.y - sp.y);
        dragBoundsCurrentRef.current = next;
        setDragBoundsCurrent(next); // 仅本地 state
        return;
      }
      // 锚点拖拽
      if (dragIdRef.current) {
        const p = toPct(e.clientX, e.clientY);
        if (!p) return;
        dragPosRef.current = p;
        setDragPos(p);
      }
    },
    [toPct]
  );

  const endDrag = useCallback(() => {
    // bounds 拖拽结束
    const bid = dragBoundsIdRef.current;
    const bcur = dragBoundsCurrentRef.current;
    if (bid && bcur && onAreaBoundsChange) {
      onAreaBoundsChange(bid, bcur); // 拖拽结束才写入 store
    }
    dragBoundsIdRef.current = null;
    dragHandleRef.current = null;
    dragStartBoundsRef.current = null;
    dragPointerStartRef.current = null;
    setDragBoundsId(null);
    setDragBoundsCurrent(null);
    dragBoundsCurrentRef.current = null;

    // 锚点拖拽结束
    const aid = dragIdRef.current;
    const apos = dragPosRef.current;
    if (aid && apos && onAreaMove) {
      onAreaMove(aid, apos);
    }
    dragIdRef.current = null;
    dragPosRef.current = null;
    setDragId(null);
    setDragPos(null);
  }, [onAreaMove, onAreaBoundsChange]);

  const areaFill = useMemo(
    () => (id: string) => (id === highlightAreaId ? "#EFD9C4" : "#FBF8F2"),
    [highlightAreaId]
  );

  /** 8 个把手列表 */
  const HANDLES: { handle: Handle; cursor: string }[] = useMemo(
    () => [
      { handle: "nw", cursor: "nwse-resize" },
      { handle: "n", cursor: "ns-resize" },
      { handle: "ne", cursor: "nesw-resize" },
      { handle: "e", cursor: "ew-resize" },
      { handle: "se", cursor: "nwse-resize" },
      { handle: "s", cursor: "ns-resize" },
      { handle: "sw", cursor: "nesw-resize" },
      { handle: "w", cursor: "ew-resize" },
    ],
    []
  );

  /** 计算某个把手在 bounds 上的坐标（百分比） */
  const handlePos = (b: Bounds, handle: Handle): AnchorPosition => {
    switch (handle) {
      case "nw":
      case "move":
        return { x: b.x, y: b.y };
      case "n":
        return { x: b.x + b.w / 2, y: b.y };
      case "ne":
        return { x: b.x + b.w, y: b.y };
      case "e":
        return { x: b.x + b.w, y: b.y + b.h / 2 };
      case "se":
        return { x: b.x + b.w, y: b.y + b.h };
      case "s":
        return { x: b.x + b.w / 2, y: b.y + b.h };
      case "sw":
        return { x: b.x, y: b.y + b.h };
      case "w":
        return { x: b.x, y: b.y + b.h / 2 };
    }
  };

  return (
    <div className={cn("relative w-full", className)} style={style}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className={cn(
          "block w-full h-auto select-none touch-none",
          pickable && "cursor-crosshair",
          editable && !pickable && "cursor-default"
        )}
        onClick={handlePick}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="img"
        aria-label="户型图"
      >
        {/* 底图 */}
        {isImageMode ? (
          <image
            href={floorPlanImage}
            x={0}
            y={0}
            width={VB_W}
            height={VB_H}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <>
            <rect x={0} y={0} width={VB_W} height={VB_H} fill="#F5F1EA" />
            {/* 内置模式才画房间矩形 + 外墙（若开启 bounds 编辑，房间矩形由下方统一渲染带把手） */}
            {areas.map((a, idx) => {
              if (!a.bounds) return null;
              if (boundsEditable) return null; // 编辑模式下统一用带把手的渲染
              const x = pctToX(a.bounds.x);
              const y = pctToY(a.bounds.y);
              const w = pctToX(a.bounds.w);
              const h = pctToY(a.bounds.h);
              const isHi = a.id === highlightAreaId;
              return (
                <g key={a.id}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={areaFill(a.id)}
                    stroke={isHi ? "#A86B3C" : "#D0C4B3"}
                    strokeWidth={isHi ? 3 : 1.5}
                    onClick={() => onAreaClick?.(a.id)}
                    className={onAreaClick ? "cursor-pointer" : undefined}
                  />
                  {!compact && (
                    <text
                      x={x + w / 2}
                      y={y + h / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={isHi ? "#8C5630" : "#B97E4F"}
                      fontSize={26}
                      fontFamily="'Noto Serif SC', serif"
                      fontWeight={500}
                      opacity={0.55}
                      style={{ pointerEvents: "none" }}
                    >
                      {a.name}
                    </text>
                  )}
                  {!compact && (
                    <text
                      x={x + w / 2}
                      y={y + h / 2 + 32}
                      textAnchor="middle"
                      fill="#B97E4F"
                      fontSize={13}
                      fontFamily="'Fraunces', serif"
                      opacity={0.4}
                      style={{ pointerEvents: "none" }}
                    >
                      AREA · {String(idx + 1).padStart(2, "0")}
                    </text>
                  )}
                </g>
              );
            })}
            <rect
              x={pctToX(6)}
              y={pctToY(8.3)}
              width={pctToX(88)}
              height={pctToY(83.4)}
              fill="none"
              stroke="#1F1B16"
              strokeWidth={6}
              strokeLinejoin="round"
            />
            {!compact && (
              <text
                x={pctToX(6)}
                y={pctToY(8.3) - 14}
                fill="#6B6258"
                fontSize={14}
                fontFamily="'Fraunces', serif"
                letterSpacing={2}
              >
                FLOOR PLAN · 户型平面
              </text>
            )}
          </>
        )}

        {/* 物品标记点 */}
        {itemMarkers.map((m) => {
          const cx = pctToX(m.pos.x);
          const cy = pctToY(m.pos.y);
          const color = m.color || "#D97A3C";
          const isActive = m.id === activeMarkerId;
          return (
            <g key={m.id} style={{ pointerEvents: "none" }}>
              {isActive && (
                <circle cx={cx} cy={cy} r={14} fill={color} opacity={0.25}>
                  <animate
                    attributeName="r"
                    values="8;22;8"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.35;0;0.35"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              <circle
                cx={cx}
                cy={cy}
                r={isActive ? 9 : 6}
                fill={color}
                stroke="#FBF8F2"
                strokeWidth={2}
              />
              {!compact && m.label && (
                <text
                  x={cx + 12}
                  y={cy + 4}
                  fill="#1F1B16"
                  fontSize={12}
                  fontFamily="'Noto Sans SC', sans-serif"
                  style={{ pointerEvents: "none" }}
                >
                  {m.label}
                </text>
              )}
            </g>
          );
        })}

        {/* 已选位置（录入模式） */}
        {pickable && pickedPos && (
          <g style={{ pointerEvents: "none" }}>
            <circle
              cx={pctToX(pickedPos.x)}
              cy={pctToY(pickedPos.y)}
              r={20}
              fill="#D97A3C"
              opacity={0.2}
            />
            <circle
              cx={pctToX(pickedPos.x)}
              cy={pctToY(pickedPos.y)}
              r={8}
              fill="#D97A3C"
              stroke="#FBF8F2"
              strokeWidth={2}
            />
          </g>
        )}

        {/* 区域矩形边界（bounds）：
            - 图片模式下默认不显示，仅在 boundsEditable 时显示
            - 内置模式下非编辑时已由上方房间矩形渲染；编辑时统一在此渲染带把手
            - 拖拽中跟随本地 state */}
        {areas.map((a) => {
          const isHi = a.id === highlightAreaId;
          // 非编辑状态下，只有处于图片模式且被高亮时，才显示半透明矩形作为高亮效果
          if (!boundsEditable && (!isHi || !isImageMode)) return null;

          // 拖拽中用本地 state，否则用已保存 bounds
          const isDragging = a.id === dragBoundsId;
          const b = isDragging && dragBoundsCurrent ? dragBoundsCurrent : a.bounds;
          if (!b) return null;
          const x = pctToX(b.x);
          const y = pctToY(b.y);
          const w = pctToX(b.w);
          const h = pctToY(b.h);
          return (
            <g key={`bounds-${a.id}`}>
              {/* 半透明填充 + 边框 */}
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill={isHi ? "#A86B3C" : "#3D5A4A"}
                fillOpacity={boundsEditable ? (isDragging ? 0.22 : 0.12) : 0.15}
                stroke={isHi || isDragging ? "#A86B3C" : "#3D5A4A"}
                strokeWidth={boundsEditable ? (isDragging ? 2.5 : 2) : 2}
                strokeDasharray={boundsEditable && isDragging ? "6 4" : undefined}
                onPointerDown={boundsEditable ? (e) => startBoundsDrag(e, a.id, "move", b) : undefined}
                className={cn(boundsEditable && "cursor-move")}
                style={!boundsEditable ? { pointerEvents: "none" } : undefined}
              />
              {/* 区域名（图片模式下便于识别） */}
              {isImageMode && !compact && boundsEditable && (
                <text
                  x={x + w / 2}
                  y={y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#1F1B16"
                  fontSize={20}
                  fontFamily="'Noto Serif SC', serif"
                  fontWeight={500}
                  opacity={0.5}
                  style={{ pointerEvents: "none" }}
                >
                  {a.name}
                </text>
              )}
              {/* 8 个把手 */}
              {boundsEditable &&
                HANDLES.map(({ handle, cursor }) => {
                  const hp = handlePos(b, handle);
                  return (
                    <rect
                      key={handle}
                      x={pctToX(hp.x) - 6}
                      y={pctToY(hp.y) - 6}
                      width={12}
                      height={12}
                      fill="#FBF8F2"
                      stroke="#A86B3C"
                      strokeWidth={2}
                      rx={2}
                      onPointerDown={(e) => startBoundsDrag(e, a.id, handle, b)}
                      style={{ cursor }}
                    />
                  );
                })}
            </g>
          );
        })}

        {/* 区域序号锚点 */}
        {showAreaAnchors &&
          areas.map((a, idx) => {
            const isDragging = a.id === dragId;
            // 拖拽中跟随指针（本地 state），否则用已保存位置
            const pos = isDragging && dragPos ? dragPos : a.floorPlanPos;
            const cx = pctToX(pos.x);
            const cy = pctToY(pos.y);
            const isHi = a.id === highlightAreaId;
            return (
              <g
                key={`anchor-${a.id}`}
                onClick={(e) => {
                  if (editable) return; // 编辑模式由拖拽处理
                  onAreaClick?.(a.id);
                  e.stopPropagation();
                }}
                onPointerDown={(e) => startAnchorDrag(e, a.id)}
                className={cn(
                  onAreaClick && !editable && "cursor-pointer",
                  editable && "cursor-grab active:cursor-grabbing"
                )}
              >
                {/* 拖拽时光晕 */}
                {isDragging && (
                  <circle cx={cx} cy={cy} r={26} fill="#A86B3C" opacity={0.18} />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={compact ? 9 : 14}
                  fill={isHi || isDragging ? "#A86B3C" : "#3D5A4A"}
                  stroke="#FBF8F2"
                  strokeWidth={2.5}
                />
                {!compact && (
                  <text
                    x={cx}
                    y={cy + 5}
                    textAnchor="middle"
                    fill="#FBF8F2"
                    fontSize={15}
                    fontFamily="'Fraunces', serif"
                    fontWeight={600}
                    style={{ pointerEvents: "none" }}
                  >
                    {idx + 1}
                  </text>
                )}
                {/* 图片模式下显示区域名（便于识别） */}
                {isImageMode && !compact && (
                  <text
                    x={cx}
                    y={cy + (compact ? 16 : 24)}
                    textAnchor="middle"
                    fill="#1F1B16"
                    fontSize={13}
                    fontFamily="'Noto Serif SC', serif"
                    fontWeight={500}
                    style={{ pointerEvents: "none" }}
                  >
                    {a.name}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
    </div>
  );
}
