import { z } from "zod";

const SvgTransformSchema = z
  .array(z.number().finite())
  .length(6) as unknown as z.ZodType<
  [number, number, number, number, number, number]
>;

export const SvgVectorPathSchema = z.object({
  d: z.string().min(1).max(1_000_000),
  transform: SvgTransformSchema,
  fill: z.string().max(512),
  stroke: z.string().max(512),
  strokeWidth: z.number().finite().min(0).max(100000),
  lineCap: z.enum(["butt", "round", "square"]),
  lineJoin: z.enum(["miter", "round", "bevel"]),
  miterLimit: z.number().finite().min(0).max(100000),
  fillRule: z.enum(["nonzero", "evenodd"]),
  opacity: z.number().finite().min(0).max(1),
  fillOpacity: z.number().finite().min(0).max(1),
  strokeOpacity: z.number().finite().min(0).max(1),
});

export type SvgVectorPath = z.infer<typeof SvgVectorPathSchema>;

const SvgViewBoxSchema = z
  .array(z.number().finite())
  .length(4)
  .superRefine((viewBox, context) => {
    for (const index of [2, 3] as const) {
      const dimension = viewBox[index];
      if (dimension === undefined || dimension <= 0 || dimension > 100000) {
        context.addIssue({
          code: "custom",
          message: "SVG viewBox 的宽度和高度必须大于 0 且不超过 100000",
          path: [index],
        });
      }
    }
  }) as unknown as z.ZodType<[number, number, number, number]>;

export const SvgVectorDataSchema = z.object({
  viewBox: SvgViewBoxSchema,
  content: z.string().min(1).max(2_000_000),
  paths: z.array(SvgVectorPathSchema).min(1).max(10000),
});

export type SvgVectorData = z.infer<typeof SvgVectorDataSchema>;


export type VectorPath = SvgVectorPath;
export type VectorData = SvgVectorData;
