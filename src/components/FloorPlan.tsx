import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AnchorPosition, Area } from "@/types";
import { cn } from "@/lib/utils";

const VB_W = 1000;
const VB_H = 720;

/** 内置户型图标识：使用 SVG 绘制 */
export const BUILTIN_FLOORPLAN = "builtin-floorplan";

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
  /** 是否显示区域序号锚点 */
  showAreaAnchors?: boolean;
  /** 紧凑模式（侧栏小图） */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

const pctToX = (p: number) => (p / 100) * VB_W;
const pctToY = (p: number) => (p / 100) * VB_H;

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
  showAreaAnchors = true,
  compact = false,
  className,
  style,
}: FloorPlanProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // 拖拽用 ref 避免闭包过期；用 state 触发视觉刷新
  const dragIdRef = useRef<string | null>(null);
  const dragPosRef = useRef<AnchorPosition | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<AnchorPosition | null>(null);

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
   * 拖拽区域锚点：
   * - 拖拽期间只更新本地 state（不写 store），避免每个像素触发全局 re-render
   * - pointer capture 绑定在稳定的 <svg> 上（而非会被 React 替换的 <circle>），
   *   保证 pointerup 一定能收到，dragId 不会卡死
   * - pointerup 时才把最终位置写入 store（仅一次）
   */
  const startDrag = useCallback(
    (e: React.PointerEvent, areaId: string) => {
      if (!editable) return;
      e.stopPropagation();
      dragIdRef.current = areaId;
      setDragId(areaId);
      const p = toPct(e.clientX, e.clientY);
      dragPosRef.current = p;
      setDragPos(p);
      // 在稳定的 SVG 上捕获指针，确保拖拽期间持续接收事件、且 pointerup 必到
      svgRef.current?.setPointerCapture?.(e.pointerId);
    },
    [editable, toPct]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragIdRef.current) return;
      const p = toPct(e.clientX, e.clientY);
      if (!p) return;
      dragPosRef.current = p;
      setDragPos(p); // 仅本地 state
    },
    [toPct]
  );

  const endDrag = useCallback(() => {
    const id = dragIdRef.current;
    const p = dragPosRef.current;
    if (id && p && onAreaMove) {
      onAreaMove(id, p); // 拖拽结束才写入 store
    }
    dragIdRef.current = null;
    dragPosRef.current = null;
    setDragId(null);
    setDragPos(null);
  }, [onAreaMove]);

  const areaFill = useMemo(
    () => (id: string) => (id === highlightAreaId ? "#EFD9C4" : "#FBF8F2"),
    [highlightAreaId]
  );

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
            {/* 内置模式才画房间矩形 + 外墙 */}
            {areas.map((a, idx) => {
              if (!a.bounds) return null;
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
                onPointerDown={(e) => startDrag(e, a.id)}
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
