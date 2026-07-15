import type { Area, Home, Item } from "@/types";
import { imageOf } from "@/utils/image";

// 生成物品图片
const img = (prompt: string, size: "landscape_4_3" | "square" = "square") =>
  imageOf(prompt, size);

/**
 * 内置示例数据：一套两室一厅户型
 * - 区域在户型图上的边界(bounds)与锚点(floorPlanPos)均使用百分比坐标(0-100)
 *   与 FloorPlan 组件的 SVG viewBox 对应
 * - 每个区域含 1~2 张区域图(images)，物品位置(areaImagePos)标在对应区域图上
 */
export const seedHome: Home = {
  schemaVersion: 3,
  title: "城南·溪岸花园 3-2-1801",
  subtitle: "居所图鉴 · 居家设施与物品档案",
  floorPlanImage: "builtin-floorplan",
  areas: [
    {
      id: "living",
      name: "客厅",
      floorPlanPos: { x: 64, y: 72 },
      bounds: { x: 34, y: 52.8, w: 60, h: 38.9 },
      images: [
        {
          id: "living-overview",
          url: img("明亮客厅全景，米色沙发木质茶几，落地窗自然光，温馨北欧风", "landscape_4_3"),
          label: "区域总图",
        },
        {
          id: "living-facility",
          url: img("客厅墙面插座开关与电源管线布局示意图，俯视平面标注", "landscape_4_3"),
          label: "设施布局图",
        },
      ],
      description: "南北通透的主活动区，连接阳台，承担会客与影音功能。",
      items: [
        {
          id: "living-sofa",
          areaId: "living",
          name: "三人布艺沙发",
          category: "家具",
          brand: "宜家 KIVIK",
          spec: "332×98×83cm 深灰",
          purchaseDate: "2023-04-12",
          price: 4999,
          remark: "靠南墙摆放，可拆洗外套",
          image: img("深灰色三人布艺沙发产品图，北欧简约风"),
          areaImageId: "living-overview",
          areaImagePos: { x: 55, y: 65 },
        },
        {
          id: "living-tv",
          areaId: "living",
          name: "65寸智能电视",
          category: "家电",
          brand: "索尼 Sony",
          spec: "XR-65X90L 4K Mini LED",
          purchaseDate: "2023-06-01",
          price: 8999,
          remark: "壁挂于西墙，HDMI1 接机顶盒",
          image: img("索尼65寸超薄智能电视产品图，黑色边框"),
          areaImageId: "living-overview",
          areaImagePos: { x: 82, y: 40 },
          usage:
            "1. 遥控器长按电源键开机，短按息屏。\n2. HDMI1 为机顶盒，HDMI2 为游戏机；按 INPUT 切换信号源。\n3. 音量用侧面 +/- 键，静音按 MUTING。\n4. 投屏：设置 → 网络 → 屏幕镜像，手机选 BRAVIA。",
        },
        {
          id: "living-table",
          areaId: "living",
          name: "实木茶几",
          category: "家具",
          brand: "源氏木语",
          spec: "120×60×40cm 橡木",
          purchaseDate: "2023-04-20",
          price: 1280,
          remark: "沙发前居中放置",
          image: img("橡木实木茶几产品图，原木色简约"),
          areaImageId: "living-overview",
          areaImagePos: { x: 60, y: 72 },
        },
        {
          id: "living-lamp",
          areaId: "living",
          name: "落地阅读灯",
          category: "装饰",
          brand: "小米 米家",
          spec: "智能调光 1.5m",
          purchaseDate: "2023-05-08",
          price: 349,
          remark: "沙发左角，色温 2700-6500K",
          image: img("白色落地阅读灯产品图，极简圆柱"),
          areaImageId: "living-overview",
          areaImagePos: { x: 42, y: 78 },
        },
        {
          id: "living-ac",
          areaId: "living",
          name: "立式空调柜机",
          category: "家电",
          brand: "格力 Gree",
          spec: "KFR-72LW 3匹 一级能效",
          purchaseDate: "2022-11-15",
          price: 7299,
          remark: "东北角，滤网半年清洗一次",
          image: img("白色立式空调柜机产品图，圆柱造型"),
          areaImageId: "living-facility",
          areaImagePos: { x: 88, y: 30 },
          // 滤网清洗：每半年一次；上次 2026-06-25，演示「即将到期」
          maintenanceCycle: 180,
          lastMaintenanceDate: "2026-06-25",
        },
      ],
    },
    {
      id: "bedroom",
      name: "主卧",
      floorPlanPos: { x: 69, y: 28 },
      bounds: { x: 44, y: 8.3, w: 50, h: 38.9 },
      images: [
        {
          id: "bedroom-overview",
          url: img("温馨主卧全景，双人床米色床品，木质衣柜，柔和暖光", "landscape_4_3"),
          label: "区域总图",
        },
        {
          id: "bedroom-facility",
          url: img("卧室墙面开关插座与空调插座布局示意图，平面标注", "landscape_4_3"),
          label: "设施布局图",
        },
      ],
      description: "朝南主卧，含独立衣柜区，安静避光适合休息。",
      items: [
        {
          id: "bedroom-bed",
          areaId: "bedroom",
          name: "1.8米实木双人床",
          category: "家具",
          brand: "林氏木业",
          spec: "180×200cm 橡胶木",
          purchaseDate: "2023-03-02",
          price: 3299,
          remark: "床头朝东墙，含液压储物",
          image: img("橡木1.8米双人床产品图，米色床品简约"),
          areaImageId: "bedroom-overview",
          areaImagePos: { x: 55, y: 55 },
        },
        {
          id: "bedroom-wardrobe",
          areaId: "bedroom",
          name: "推拉门衣柜",
          category: "家具",
          brand: "索菲亚",
          spec: "240×60×240cm 定制",
          purchaseDate: "2023-02-18",
          price: 8800,
          remark: "西墙整面，内部已分区",
          image: img("白色推拉门衣柜产品图，通顶定制"),
          areaImageId: "bedroom-overview",
          areaImagePos: { x: 85, y: 50 },
        },
        {
          id: "bedroom-nightstand",
          areaId: "bedroom",
          name: "床头柜",
          category: "家具",
          brand: "林氏木业",
          spec: "50×40×45cm 单个",
          purchaseDate: "2023-03-02",
          price: 399,
          remark: "床左侧，带抽屉",
          image: img("原木色床头柜产品图，单抽屉简约"),
          areaImageId: "bedroom-overview",
          areaImagePos: { x: 40, y: 60 },
          contents: [
            { id: "night-c1", name: "电池", quantity: "4节", remark: "5号" },
            { id: "night-c2", name: "充电器", quantity: "1个", remark: "Type-C" },
            { id: "night-c3", name: "电筒", quantity: "1只", remark: "应急用" },
          ],
        },
        {
          id: "bedroom-ac",
          areaId: "bedroom",
          name: "壁挂空调",
          category: "家电",
          brand: "美的 Midea",
          spec: "KFR-35GW 1.5匹 一级",
          purchaseDate: "2022-11-15",
          price: 2899,
          remark: "床头北墙上方，遥控器在床头柜",
          image: img("白色壁挂空调室内机产品图，超薄"),
          areaImageId: "bedroom-facility",
          areaImagePos: { x: 60, y: 20 },
          // 滤网清洗：每半年一次；上次 2025-12-01，演示「已过期」
          maintenanceCycle: 180,
          lastMaintenanceDate: "2025-12-01",
        },
      ],
    },
    {
      id: "kitchen",
      name: "厨房",
      floorPlanPos: { x: 23, y: 28 },
      bounds: { x: 6, y: 8.3, w: 34, h: 38.9 },
      images: [
        {
          id: "kitchen-overview",
          url: img("整洁厨房全景，白色橱柜不锈钢台面，灶具油烟机", "landscape_4_3"),
          label: "区域总图",
        },
        {
          id: "kitchen-facility",
          url: img("厨房燃气水管电源插座布局示意图，俯视平面标注", "landscape_4_3"),
          label: "设施布局图",
        },
      ],
      description: "L 型操作台布局，含燃气灶与水槽，干湿分离。",
      items: [
        {
          id: "kitchen-fridge",
          areaId: "kitchen",
          name: "对开门冰箱",
          category: "家电",
          brand: "海尔 Haier",
          spec: "BCD-540WL 540升 风冷",
          purchaseDate: "2022-10-20",
          price: 4599,
          remark: "西北角，独立回路",
          image: img("银色对开门冰箱产品图，大容量"),
          areaImageId: "kitchen-overview",
          areaImagePos: { x: 25, y: 40 },
          contents: [
            { id: "fridge-c1", name: "雪糕", quantity: "1盒", remark: "冷冻室上层" },
            { id: "fridge-c2", name: "冰块", quantity: "2格", remark: "制冰盒" },
            { id: "fridge-c3", name: "饮料", quantity: "6罐", remark: "冷藏室门板" },
          ],
        },
        {
          id: "kitchen-stove",
          areaId: "kitchen",
          name: "燃气灶",
          category: "管线设施",
          brand: "方太 Fotile",
          spec: "JZT-TH28B 双眼 5.2kW",
          purchaseDate: "2022-10-20",
          price: 2199,
          remark: "台面嵌入，左侧旋钮点火",
          image: img("不锈钢双眼燃气灶产品图，嵌入式"),
          areaImageId: "kitchen-facility",
          areaImagePos: { x: 55, y: 45 },
        },
        {
          id: "kitchen-hood",
          areaId: "kitchen",
          name: "抽油烟机",
          category: "家电",
          brand: "方太 Fotile",
          spec: "EMD20T+TH28B 侧吸 24m³",
          purchaseDate: "2022-10-20",
          price: 4999,
          remark: "与灶具联动，三月清一次油网",
          image: img("黑色侧吸式抽油烟机产品图，大吸力"),
          areaImageId: "kitchen-facility",
          areaImagePos: { x: 55, y: 20 },
          // 油网清洗：每季度一次；上次 2026-05-20，演示「即将到期」
          maintenanceCycle: 90,
          lastMaintenanceDate: "2026-05-20",
        },
        {
          id: "kitchen-cabinet",
          areaId: "kitchen",
          name: "整体橱柜",
          category: "储物",
          brand: "欧派 Oppein",
          spec: "L型 3.6m 石英石台面",
          purchaseDate: "2022-09-30",
          price: 15600,
          remark: "上柜含调味拉篮，下柜含碗碟拉篮",
          image: img("白色整体橱柜产品图，石英石台面L型布局"),
          areaImageId: "kitchen-overview",
          areaImagePos: { x: 70, y: 75 },
        },
      ],
    },
    {
      id: "bathroom",
      name: "卫生间",
      floorPlanPos: { x: 18, y: 72 },
      bounds: { x: 6, y: 52.8, w: 24, h: 38.9 },
      images: [
        {
          id: "bathroom-overview",
          url: img("整洁卫生间全景，白色洁具淋浴玻璃隔断，瓷砖", "landscape_4_3"),
          label: "区域总图",
        },
        {
          id: "bathroom-facility",
          url: img("卫生间水管地漏角阀热水器管路布局示意图，平面标注", "landscape_4_3"),
          label: "设施布局图",
        },
      ],
      description: "干湿分离，含淋浴区与洗手台，热水器挂于墙面。",
      items: [
        {
          id: "bath-heater",
          areaId: "bathroom",
          name: "电热水器",
          category: "家电",
          brand: "史密斯 A.O.Smith",
          spec: "EWH-80E5W 80升",
          purchaseDate: "2022-12-05",
          price: 2899,
          remark: "西北角高处壁挂，每年换镁棒",
          image: img("白色圆柱电热水器产品图，壁挂式"),
          areaImageId: "bathroom-facility",
          areaImagePos: { x: 25, y: 20 },
          // 镁棒更换：每年一次；上次 2025-06-10，演示「已过期」
          maintenanceCycle: 365,
          lastMaintenanceDate: "2025-06-10",
        },
        {
          id: "bath-washer",
          areaId: "bathroom",
          name: "滚筒洗衣机",
          category: "家电",
          brand: "小天鹅 LittleSwan",
          spec: "TG100V20WD 10公斤 变频",
          purchaseDate: "2022-12-05",
          price: 2399,
          remark: "东南角，含烘干功能",
          image: img("白色滚筒洗衣机产品图，前置面板"),
          areaImageId: "bathroom-overview",
          areaImagePos: { x: 80, y: 75 },
        },
        {
          id: "bath-toilet",
          areaId: "bathroom",
          name: "智能马桶",
          category: "管线设施",
          brand: "TOTO",
          spec: "CW988B 即热式 虹吸",
          purchaseDate: "2023-01-10",
          price: 5680,
          remark: "靠西墙，需预留电源",
          image: img("白色智能马桶产品图，一体式即热"),
          areaImageId: "bathroom-overview",
          areaImagePos: { x: 30, y: 60 },
        },
      ],
    },
  ],
};

/** 生成唯一 id */
export function genId(prefix = "id"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 深拷贝种子数据（避免直接污染） */
export function cloneSeed(): Home {
  return JSON.parse(JSON.stringify(seedHome)) as Home;
}

/** 收集所有品牌（用于筛选器） */
export function collectBrands(areas: Area[]): string[] {
  const set = new Set<string>();
  areas.forEach((a) => a.items.forEach((i) => i.brand && set.add(i.brand)));
  return Array.from(set).sort();
}

/** 统计物品总数 */
export function countItems(areas: Area[]): number {
  return areas.reduce((sum, a) => sum + a.items.length, 0);
}

/** 按 areaId+itemId 查找物品与所属区域 */
export function findItem(
  areas: Area[],
  areaId: string,
  itemId: string
): { item: Item; area: Area } | undefined {
  const area = areas.find((a) => a.id === areaId);
  if (!area) return undefined;
  const item = area.items.find((i) => i.id === itemId);
  if (!item) return undefined;
  return { item, area };
}
