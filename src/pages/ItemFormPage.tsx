import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Save, X } from "lucide-react";
import PageLayout from "@/components/PageLayout";
import ItemForm, { itemToFormValue, normalizeContents, type ItemFormValue } from "@/components/ItemForm";
import EmptyState from "@/components/Empty";
import { useHomeStore } from "@/store";
import { imageOf } from "@/utils/image";

export default function ItemFormPage() {
  const { areaId = "" } = useParams();
  const navigate = useNavigate();
  const { areas, addItem } = useHomeStore();

  const area = areas.find((a) => a.id === areaId);
  const [value, setValue] = useState<ItemFormValue>(itemToFormValue());
  // 防止多次点击重复保存
  const [saving, setSaving] = useState(false);

  if (!area) {
    return (
      <PageLayout title="区域不存在">
        <EmptyState
          title="未找到该区域"
          action={
            <Link to="/" className="btn-primary">
              返回首页
            </Link>
          }
        />
      </PageLayout>
    );
  }

  const handleSave = () => {
    if (saving) return;
    if (!value.name.trim()) return;
    setSaving(true);
    try {
      const created = addItem(areaId, {
        name: value.name.trim(),
        category: value.category,
        brand: value.brand.trim() || undefined,
        spec: value.spec.trim() || undefined,
        purchaseDate: value.purchaseDate || undefined,
        price: value.price ? Number(value.price) : undefined,
        remark: value.remark.trim() || undefined,
        image:
          value.image ||
          imageOf(value.name + " 产品图", "square"),
        gallery: value.gallery,
        areaImageId: value.areaImageId || undefined,
        areaImagePos: value.areaImagePos || undefined,
        contents: normalizeContents(value.contents),
        usage: value.usage.trim() || undefined,
      });
      // replace：避免返回时又回到录入页造成重复保存
      navigate(`/area/${areaId}/item/${created.id}`, { replace: true });
    } catch (e) {
      setSaving(false);
      console.error(e);
    }
  };

  return (
    <PageLayout
      title={`录入 · ${area.name}`}
      subtitle={`为 ${area.name} 添加一件物品或设施`}
    >
      <nav className="mb-5 flex items-center gap-1 text-2xs text-ink/45">
        <Link to="/" className="hover:text-clay-500">
          居所图鉴
        </Link>
        <ChevronRight size={12} />
        <Link to={`/area/${areaId}`} className="hover:text-clay-500">
          {area.name}
        </Link>
        <ChevronRight size={12} />
        <span className="text-ink/70">录入物品</span>
      </nav>

      <ItemForm value={value} onChange={setValue} areaId={areaId} />

      <div className="mt-8 flex items-center justify-end gap-2 border-t border-line pt-5">
        <Link to={`/area/${areaId}`} className="btn-secondary">
          <X size={15} /> 取消
        </Link>
        <button
          onClick={handleSave}
          disabled={!value.name.trim() || saving}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save size={15} /> {saving ? "保存中…" : "保存入库"}
        </button>
      </div>
    </PageLayout>
  );
}
