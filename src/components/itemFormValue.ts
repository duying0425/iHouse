import type { AnchorPosition, Category, Item, StorageEntry } from "@/types";

export interface ItemFormValue {
  name: string;
  category: Category;
  brand: string;
  tags: string;
  spec: string;
  purchaseDate: string;
  price: string;
  remark: string;
  image: string;
  gallery: string[];
  areaImageId: string | null;
  areaImagePos: AnchorPosition | null;
  /** 新建时可在表单内直接选择收纳到本区域的储物单元 */
  containerItemId: string | null;
  containerSlot: string;
  contents: StorageEntry[];
  usage: string;
  maintenanceCycle: string;
  lastMaintenanceDate: string;
}

export function itemToFormValue(item?: Partial<Item>): ItemFormValue {
  return {
    name: item?.name ?? "",
    category: (item?.category as Category) ?? "家电",
    brand: item?.brand ?? "",
    tags: item?.tags?.join(", ") ?? "",
    spec: item?.spec ?? "",
    purchaseDate: item?.purchaseDate ?? "",
    price: item?.price != null ? String(item.price) : "",
    remark: item?.remark ?? "",
    image: item?.image ?? "",
    gallery: item?.gallery?.map((image) => image) ?? [],
    areaImageId: item?.areaImageId ?? null,
    areaImagePos: item?.areaImagePos ?? null,
    containerItemId: item?.containerItemId ?? null,
    containerSlot: item?.containerSlot ?? "",
    contents: item?.contents?.map((content) => ({ ...content })) ?? [],
    usage: item?.usage ?? "",
    maintenanceCycle: item?.maintenanceCycle != null ? String(item.maintenanceCycle) : "",
    lastMaintenanceDate: item?.lastMaintenanceDate ?? "",
  };
}

export function normalizeContents(contents: StorageEntry[]): StorageEntry[] | undefined {
  const result = contents
    .map((content) => ({
      id: content.id,
      name: content.name.trim(),
      quantity: content.quantity?.trim() || undefined,
      remark: content.remark?.trim() || undefined,
    }))
    .filter((content) => content.name.length > 0);
  return result.length > 0 ? result : undefined;
}
