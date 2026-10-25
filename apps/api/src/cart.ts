import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import type { Cart } from "@shopmaple/contracts";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const cookieName = "maple_cart";
const lifetime = 30 * 24 * 60 * 60 * 1000;
function token(req: Request) {
  const value = req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function currentCart(db: PrismaClient, req: Request) {
  const value = token(req);
  return value
    ? db.cart.findFirst({
        where: { tokenHash: hash(value), expiresAt: { gt: new Date() } },
      })
    : null;
}
export async function readCart(
  db: PrismaClient,
  cartId?: string,
): Promise<Cart> {
  const rows = cartId
    ? await db.cartItem.findMany({
        where: { cartId },
        include: { variant: { include: { product: true } } },
        orderBy: { variantId: "asc" },
      })
    : [];
  const items = rows.map(({ variant: v, quantity }) => ({
    variantId: v.id,
    handle: v.product.handle,
    title: v.product.title,
    variantTitle: v.title,
    image: v.product.images[0] ?? "",
    pricePaise: v.pricePaise,
    quantity,
    lineTotalPaise: v.pricePaise === null ? null : v.pricePaise * quantity,
    available:
      v.pricePaise !== null && v.available && v.published && v.product.published && v.stockPolicy !== "made_to_order",
    stockPolicy: v.stockPolicy,
  }));
  return {
    items,
    itemCount: items.reduce((sum, x) => sum + x.quantity, 0),
    subtotalPaise: items.some(x => x.lineTotalPaise === null) ? null : items.reduce((sum, x) => sum + x.lineTotalPaise!, 0),
    currency: "INR",
    checkoutEnabled: false,
    mode: "preview",
  };
}
export async function setCartQuantity(
  db: PrismaClient,
  req: Request,
  res: Response,
  id: string,
  quantity: number,
  secure: boolean,
) {
  const existing = await currentCart(db, req);
  if (quantity > 0) {
    const variant = await db.variant.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!variant || !variant.product.published)
      throw new HttpError(
        404,
        "PRODUCT_NOT_FOUND",
        "This item is no longer available.",
      );
    if (variant.pricePaise === null || !variant.available || !variant.published || variant.stockPolicy === "made_to_order")
      throw new HttpError(
        409,
        "ENQUIRY_REQUIRED",
        "Please enquire about this item before ordering.",
      );
  }
  if (!existing && quantity === 0) return readCart(db);
  const secret = existing ? undefined : randomBytes(32).toString("hex");
  const cart =
    existing ??
    (await db.cart.create({
      data: {
        tokenHash: hash(secret!),
        expiresAt: new Date(Date.now() + lifetime),
      },
    }));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await db.$transaction(
        async (tx) => {
          if (quantity === 0) {
            await tx.cartItem.deleteMany({
              where: { cartId: cart.id, variantId: id },
            });
            return;
          }
          const count = await tx.cartItem.count({ where: { cartId: cart.id } });
          const line = await tx.cartItem.findUnique({
            where: { cartId_variantId: { cartId: cart.id, variantId: id } },
          });
          if (count >= 50 && !line)
            throw new HttpError(
              409,
              "CART_LIMIT",
              "Your cart can contain up to 50 different items.",
            );
          await tx.cartItem.upsert({
            where: { cartId_variantId: { cartId: cart.id, variantId: id } },
            create: { cartId: cart.id, variantId: id, quantity },
            update: { quantity },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code) &&
        attempt < 3
      )
        continue;
      throw error;
    }
  }
  if (secret)
    res.cookie(cookieName, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: lifetime,
    });
  return readCart(db, cart.id);
}
