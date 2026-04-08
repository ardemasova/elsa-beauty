const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const router = express.Router();

// ✅ allowed entities
const ALLOWED_ENTITIES = new Set(["masters", "clients"]);

// helper: ensure dir exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// multer storage
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

// NOTE: this route is mounted as /api/uploads in index.js
// POST /api/uploads/:entity/:id/photo
router.post("/:entity/:id/photo", upload.single("photo"), async (req, res) => {
  const { entity } = req.params;

  if (!ALLOWED_ENTITIES.has(entity)) {
    return res.status(400).json({ message: "Unsupported entity" });
  }

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  // public URL served by express.static("/uploads", ...)
  const photo_url = `/uploads/${entity}/${req.file.filename}`;

  // ✅ Update DB record (you must implement these 2 functions depending on your DB layer)
  // - masters: set photo_url where id = :id
  // - clients: set photo_url where id = :id
  //
  // If you already have DB update logic below, add the "clients" case there.

  try {
    // Example pseudo-switch (replace with your real DB code)
    // if (entity === "masters") await Masters.updatePhoto(req.params.id, photo_url);
    // if (entity === "clients") await Clients.updatePhoto(req.params.id, photo_url);

    return res.json({ photo_url });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to update photo_url" });
  }
});

module.exports = router;