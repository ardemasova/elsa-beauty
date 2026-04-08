import { useMemo, useState } from "react";
import { uploadPhoto, toAbsoluteUploadUrl } from "../api/uploadApi";

/**
 * props:
 * - entity: "masters" | "clients"
 * - id: uuid (обязателен)
 * - token: string (обязателен)
 * - currentUrl: string | null  (то, что хранится в БД, например "/uploads/...")
 * - onUploaded: (newUrl: string) => void
 */
export default function PhotoUpload({ entity, id, token, currentUrl, onUploaded }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Показываем либо текущую картинку из БД, либо выбранный локальный preview
  const [localPreview, setLocalPreview] = useState("");

  const imgSrc = useMemo(() => {
    if (localPreview) return localPreview; // blob:
    return toAbsoluteUploadUrl(currentUrl);
  }, [localPreview, currentUrl]);

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setLoading(true);

    // локальный preview (сразу показать пользователю)
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);

    try {
      const result = await uploadPhoto(token, entity, id, file);
      // result.photo_url ожидаем "/uploads/..."
      onUploaded?.(result.photo_url);
      // убираем blob preview и показываем уже реальный URL
      setLocalPreview("");
    } catch (err) {
      setError(err.message || "Upload failed");
      setLocalPreview("");
    } finally {
      setLoading(false);
      // чтобы можно было выбрать тот же файл повторно
      e.target.value = "";
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e5e7eb",
            background: "#f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            color: "#6b7280",
          }}
        >
          {imgSrc ? (
            <img src={imgSrc} alt="photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            "No"
          )}
        </div>

        <label
          style={{
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid rgba(0, 80, 103, 0.35)",
            cursor: loading ? "not-allowed" : "pointer",
            background: "#fff",
            color: "#005067",
            fontWeight: 800,
            opacity: loading ? 0.7 : 1,
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handlePick}
            disabled={loading}
            style={{ display: "none" }}
          />
          {loading ? "Uploading..." : "Upload photo"}
        </label>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 8, fontWeight: 700 }}>
          {error}
        </div>
      )}
    </div>
  );
}