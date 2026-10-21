import { z } from "zod";

export const ProjectAssetSchema = z.object({
  id: z.string().min(1).max(256),
  kind: z.enum(["image", "svg"]),
  fileName: z.string().min(1).max(255),
  relativePath: z
    .string()
    .min(1)
    .max(512)
    .refine(
      (value) =>
        value.replaceAll("\\", "/").startsWith("assets/") &&
        !value.split(/[\\/]/).includes(".."),
      "素材路径必须位于 assets 目录内",
    ),
  mimeType: z.string().min(1).max(128),
  width: z.number().positive().max(20000),
  height: z.number().positive().max(20000),
  size: z.number().int().nonnegative().max(100 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string(),
  source: z
    .object({
      provider: z.string().min(1).max(64),
      providerAssetId: z.string().min(1).max(128),
      author: z.string().min(1).max(256),
      pageUrl: z.string().url().max(2048),
      license: z.string().min(1).max(256),
      licenseUrl: z.string().url().max(2048),
    })
    .optional(),
});

export type ProjectAsset = z.infer<typeof ProjectAssetSchema>;

