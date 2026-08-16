import { v2 as cloudinary } from "cloudinary";
import { env } from "../env.js";

/**
 * Image storage.
 *
 * Files cannot live on the server's disk: Render wipes it on every deploy, so
 * a team photo uploaded on Tuesday would vanish on Wednesday. Cloudinary's
 * free tier holds 25GB, serves from a CDN, and converts to WebP or AVIF per
 * browser on its own — which is most of what next/image would otherwise be
 * doing on our behalf.
 *
 * Uploads are admin-only. There is no public upload endpoint and there should
 * never be one.
 */

export const imagesConfigured = Boolean(env.CLOUDINARY_URL);

if (imagesConfigured) {
  /* CLOUDINARY_URL is read from the environment automatically, but being
     explicit means a typo fails here rather than at the first upload. */
  cloudinary.config({ secure: true });
}

export type UploadedImage = {
  url: string;
  publicId: string;
  width: number;
  height: number;
};

export type UploadKind = "team" | "product";

const presets: Record<UploadKind, { folder: string; transformation: object[] }> =
  {
    /* Square, face-aware crop — a team grid with one off-centre portrait in it
       looks careless, and nobody wants to crop their own photograph. */
    team: {
      folder: "riyad/team",
      transformation: [
        { width: 800, height: 800, crop: "fill", gravity: "face" },
        { quality: "auto", fetch_format: "auto" },
      ],
    },
    product: {
      folder: "riyad/products",
      transformation: [
        { width: 1600, crop: "limit" },
        { quality: "auto", fetch_format: "auto" },
      ],
    },
  };

export async function uploadImage(
  buffer: Buffer,
  kind: UploadKind,
): Promise<UploadedImage> {
  if (!imagesConfigured) {
    throw new Error(
      "CLOUDINARY_URL is not set — add it to .env to enable uploads",
    );
  }

  const preset = presets[kind];

  const result = await new Promise<Record<string, unknown>>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: preset.folder,
          transformation: preset.transformation,
          resource_type: "image",
          overwrite: false,
        },
        (error, uploaded) => {
          if (error || !uploaded) return reject(error ?? new Error("No result"));
          resolve(uploaded as unknown as Record<string, unknown>);
        },
      );
      stream.end(buffer);
    },
  );

  return {
    url: String(result.secure_url),
    publicId: String(result.public_id),
    width: Number(result.width),
    height: Number(result.height),
  };
}

/** Removing a row should not leave the image behind, paid for and orphaned. */
export async function deleteImage(publicId: string): Promise<void> {
  if (!imagesConfigured) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.warn("[images] could not delete", publicId, error);
  }
}