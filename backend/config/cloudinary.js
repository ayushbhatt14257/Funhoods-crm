const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Folder layout (organized so anyone can find things without the app):
//   funhoods-crm/products/<CODE>/images     — product gallery photos
//   funhoods-crm/products/<CODE>/video      — one product video
//   funhoods-crm/customers/<CODE>/docs      — GST cert, Aadhaar, business card
//   funhoods-crm/customers/<CODE>/builty    — that dealer's builty (LR receipt) per invoice

// --- Legacy single-file uploads (unchanged behavior, still used by the
// original "product photo" and dealer GST/Aadhaar endpoints) ---
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req) => ({
    folder: `funhoods-crm/products/${(req.params.code || 'misc').toUpperCase()}/images`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
  }),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const dealerDocStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => ({
    folder: `funhoods-crm/customers/${(req.params.code || 'misc').toUpperCase()}/docs`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    resource_type: 'auto',
  }),
});
const uploadDealerDoc = multer({ storage: dealerDocStorage, limits: { fileSize: 8 * 1024 * 1024 } });

// --- Memory-buffer uploads for everything new below, so each controller can
// pick the exact dynamic folder/resource_type/public_id itself (multi-image
// galleries, video, per-dealer builty) without fighting multer-storage-cloudinary's
// static-folder assumption. ---
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function uploadBuffer(buffer, { folder, resourceType = 'image', publicId } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType, public_id: publicId },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

function destroyAsset(publicId, resourceType = 'image') {
  if (!publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(() => {
    // Best-effort: a missing/already-deleted Cloudinary asset shouldn't block the DB update.
  });
}

module.exports = { cloudinary, upload, uploadDealerDoc, uploadMemory, uploadBuffer, destroyAsset };
