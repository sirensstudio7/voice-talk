import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireBusinessAccess, sendAuthError } from "../../auth/jwt.js";
import { db } from "../../db/client.js";
import { products } from "../../db/schema.js";
import { nonEmptyString, numberLike, optionalBoolean, optionalNonEmptyString, optionalNumberLike, optionalString } from "../../http/validation.js";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, uploadToStorage } from "../../storage/index.js";
import { readUploadedFile } from "../../http/multipart.js";
import { t, type Elysia } from "elysia";

export const productCreateBody = t.Object({
  product_id: nonEmptyString,
  name: nonEmptyString,
  price: numberLike,
  discount_percent: optionalNumberLike,
  category: nonEmptyString,
  description: optionalString,
  image_url: optionalString,
  is_active: optionalBoolean,
  sort_order: optionalNumberLike,
  duration_min: optionalNumberLike,
});

export const productUpdateBody = t.Object({
  product_id: optionalNonEmptyString,
  name: optionalNonEmptyString,
  price: optionalNumberLike,
  discount_percent: optionalNumberLike,
  category: optionalNonEmptyString,
  description: optionalString,
  image_url: optionalString,
  is_active: optionalBoolean,
  sort_order: optionalNumberLike,
  duration_min: optionalNumberLike,
});

export function productOut(p: typeof products.$inferSelect) {
  return {
    id: p.id,
    product_id: p.productId,
    name: p.name,
    price: p.price,
    discount_percent: p.discountPercent,
    category: p.category,
    description: p.description,
    image_url: p.imageUrl,
    is_active: p.isActive,
    live_only: p.liveOnly,
    sort_order: p.sortOrder,
    duration_min: p.durationMin,
  };
}

export async function registerAdminProductRoutes(app: Elysia): Promise<void> {
  app.get("/admin/businesses/:businessId/products", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const rows = await db
        .select()
        .from(products)
        .where(and(eq(products.businessId, businessId), eq(products.liveOnly, false)))
        .orderBy(products.sortOrder, products.name);
      return rows.map(productOut);
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/products", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const body = request.body;
      const [product] = await db
        .insert(products)
        .values({
          businessId,
          productId: String(body.product_id),
          name: String(body.name),
          price: Number(body.price),
          discountPercent: Number(body.discount_percent ?? 0),
          category: String(body.category),
          description: String(body.description ?? ""),
          imageUrl: String(body.image_url ?? ""),
          isActive: body.is_active !== false,
          sortOrder: Number(body.sort_order ?? 0),
          durationMin: Number(body.duration_min ?? 30),
        })
        .returning();
      return request.status(201, productOut(product!));
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: productCreateBody,
  });

  app.patch("/admin/businesses/:businessId/products/:productRowId", async (request) => {
    try {
      const { businessId, productRowId } = request.params as {
        businessId: string;
        productRowId: string;
      };
      await requireBusinessAccess(request, businessId);
      const product = await db.query.products.findFirst({ where: eq(products.id, productRowId) });
      if (!product || product.businessId !== businessId) {
        return request.status(404, { detail: "Product not found" });
      }
      const body = request.body;
      const updates: Partial<typeof products.$inferInsert> = {};
      if (body.product_id !== undefined) updates.productId = String(body.product_id);
      if (body.name !== undefined) updates.name = String(body.name);
      if (body.price !== undefined) updates.price = Number(body.price);
      if (body.discount_percent !== undefined) updates.discountPercent = Number(body.discount_percent);
      if (body.category !== undefined) updates.category = String(body.category);
      if (body.description !== undefined) updates.description = String(body.description);
      if (body.image_url !== undefined) updates.imageUrl = String(body.image_url);
      if (body.is_active !== undefined) updates.isActive = Boolean(body.is_active);
      if (body.sort_order !== undefined) updates.sortOrder = Number(body.sort_order);
      if (body.duration_min !== undefined) updates.durationMin = Number(body.duration_min);

      const [updated] = await db
        .update(products)
        .set(updates)
        .where(eq(products.id, productRowId))
        .returning();
      return productOut(updated!);
    } catch (err) {
      return sendAuthError(request, err);
    }
  }, {
    body: productUpdateBody,
  });

  app.delete("/admin/businesses/:businessId/products/:productRowId", async (request) => {
    try {
      const { businessId, productRowId } = request.params as {
        businessId: string;
        productRowId: string;
      };
      await requireBusinessAccess(request, businessId);
      const product = await db.query.products.findFirst({ where: eq(products.id, productRowId) });
      if (!product || product.businessId !== businessId) {
        return request.status(404, { detail: "Product not found" });
      }
      await db.delete(products).where(eq(products.id, productRowId));
      return request.status(204, );
    } catch (err) {
      return sendAuthError(request, err);
    }
  });

  app.post("/admin/businesses/:businessId/product-images", async (request) => {
    try {
      const { businessId } = request.params as { businessId: string };
      await requireBusinessAccess(request, businessId);
      const data = readUploadedFile(request.body);
      if (!data) return request.status(400, { detail: "No file uploaded." });

      const contentType = (data.mimetype || "").toLowerCase();
      const extension = ALLOWED_IMAGE_TYPES[contentType];
      if (!extension) {
        return request.status(400, { detail: "Upload a PNG, JPG, WEBP, or GIF image." });
      }

      const buffer = await data.toBuffer();
      if (!buffer.length) return request.status(400, { detail: "Uploaded file is empty." });
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return request.status(400, { detail: "Image must be 5 MB or smaller." });
      }

      const filename = `${randomUUID().replace(/-/g, "")}${extension}`;
      const url = await uploadToStorage(
        "product-images",
        `${businessId}/${filename}`,
        buffer,
        contentType,
      );
      return request.status(201, { image_url: url });
    } catch (err) {
      return sendAuthError(request, err);
    }
  });
}
