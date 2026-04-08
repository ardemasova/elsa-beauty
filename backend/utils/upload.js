const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const db = require("../db");
const { authenticateToken } = require("../middleware/auth");
const { resolveTenantSchema } = require("../utils/tenant");

const router = express.Router();

// ✅ allowed entities
const ALLOWED_ENTITIES = new Set(["masters", "clients"]);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { entity } = req.params;

    if (!ALLOWED_ENTITIES.has(entity)) {
      return cb(new Error("Unsupported entity"), null);
    }

    const uploadsRoot = path.join(__dirname, "..", "uploads");
    const entityDir = path.join(uploadsRoot, entity);

    ensureDir(entityDir);
    cb(null, entityDir);
  },
  filename: (req, file, cb) => {
    const { id } = req.params;
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${id}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

/**
 * POST /api/uploads/:entity/:id/photo
 * - Saves file into backend/uploads/:entity
 * - Updates DB photo_url for the record
 */
router.post("/:entity/:id/photo", authenticateToken, upload.single("photo"), async (req, res) => {
  const { entity, id } = req.params;

  if (!ALLOWED_ENTITIES.has(entity)) {
    return res.status(400).json({ message: "Unsupported entity" });
  }

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const photo_url = `/uploads/${entity}/${req.file.filename}`;

  try {
    const schema = await resolveTenantSchema(req);

    // ✅ Persist photo_url in DB (so GET /api/clients returns it)
    if (entity === "masters") {
      await db.query(`UPDATE ${schema}.masters SET photo_url = $1 WHERE id = $2`, [photo_url, id]);
    } else if (entity === "clients") {
      await db.query(`UPDATE ${schema}.clients SET photo_url = $1 WHERE id = $2`, [photo_url, id]);
    }

    return res.json({ photo_url });
  } catch (e) {
    console.error("UPLOAD PHOTO ERROR:", e);
    return res.status(500).json({ message: e.message || "Failed to update photo_url" });
  }
});

module.exports = router;