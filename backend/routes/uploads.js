/**
 * POST /api/uploads/:entity/:id/photo   (multipart field "photo")
 *
 * - login + branch access required
 * - admins: any master/client of the branch; masters: only their own photo
 * - images only (JPEG/PNG/WebP, checked by file signature), max 5 MB
 * - the record must exist in the caller's branch
 */
const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

const ENTITIES = new Set(["masters", "clients"]);
const MAX_BYTES = 5 * 1024 * 1024;
const UPLOADS_ROOT = path.join(__dirname, "..", "uploads");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

/** Detects the real image type from the first bytes (the browser-sent type can be faked). */
function detectImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ".jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return null;
}

router.post("/:entity/:id/photo", authenticateToken, (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Image is larger than 5 MB" });
    if (err) return res.status(400).json({ message: "Upload failed" });
    next();
  });
}, async (req, res, next) => {
  const { entity, id } = req.params;
  if (!ENTITIES.has(entity)) return res.status(400).json({ message: "Unsupported entity" });
  if (!UUID_RE.test(id)) return res.status(400).json({ message: "Invalid id" });
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const ext = detectImage(req.file.buffer);
  if (!ext) return res.status(400).json({ message: "Only JPEG, PNG or WebP images are allowed" });

  try {
    const schema = await resolveTenantSchema(req);

    if (req.user.role !== "admin") {
      // Masters may only change their own profile photo.
      if (entity !== "masters") return res.status(403).json({ message: "Forbidden" });
      const own = await db.query(`SELECT 1 FROM ${schema}.masters WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
      if (!own.rows.length) return res.status(403).json({ message: "Forbidden" });
    }

    const exists = await db.query(`SELECT 1 FROM ${schema}.${entity} WHERE id = $1`, [id]);
    if (!exists.rows.length) return res.status(404).json({ message: "Record not found" });

    // Files are grouped per branch so branches never share a folder.
    const dir = path.join(UPLOADS_ROOT, req.tenant.schema, entity);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(dir, filename), req.file.buffer);

    const photo_url = `/uploads/${req.tenant.schema}/${entity}/${filename}`;
    await db.query(`UPDATE ${schema}.${entity} SET photo_url = $1 WHERE id = $2`, [photo_url, id]);

    res.json({ photo_url });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
