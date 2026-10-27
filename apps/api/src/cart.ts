import { createHash, randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import type { Cart, CartMutationInput } from "@shopmaple/contracts";
import { canAddToCart } from "@shopmaple/contracts";
import { cartCookieName, guestCartToken } from "./cart-credential.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const lifetime = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function currentCart(db: PrismaClient, req: Request, secure: boolean) {
  const value = guestCartToken(req, secure);
  return value
    ? db.cart.findFirst({
        where: { tokenHash: hash(value), expiresAt: { gt: new Date() } },
      })
    : null;
}
export async function readCart(
  db: PrismaClient | Prisma.TransactionClient,
  cartId?: string,
  checkoutEnabled = false,
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
    cartable: v.product.published && canAddToCart(v),
    stockPolicy: v.stockPolicy,
  }));
  return {
    items,
    itemCount: items.reduce((sum, x) => sum + x.quantity, 0),
    subtotalPaise: items.some(x => x.lineTotalPaise === null) ? null : items.reduce((sum, x) => sum + x.lineTotalPaise!, 0),
    currency: "INR",
    checkoutEnabled,
    mode: "preview",
  };
}
const identity = (secret: string) => hash("shopmaple-cart-context-v1:" + secret);
function setCookie(res: Response, secret: string, secure: boolean) {
  res.cookie(cartCookieName(secure), secret, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: lifetime });
}
export async function bootstrapCart(db: PrismaClient, req: Request, res: Response, secure: boolean, checkoutEnabled = false) {
  let secret = guestCartToken(req, secure);
  let rotated = false;
  const result = await db.$transaction(async tx => {
    let cart = secret ? await tx.cart.findUnique({ where: { tokenHash: hash(secret) } }) : null;
    if (!secret || !cart || cart.expiresAt <= new Date()) {
      secret = randomBytes(32).toString("hex");
      rotated = true;
      cart = await tx.cart.create({ data: { tokenHash: hash(secret), expiresAt: new Date(Date.now() + lifetime) } });
    }
    return { ...await readCart(tx, cart?.id, checkoutEnabled), mutationContext: { cartIdentity: identity(secret!), revision: cart!.revision } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (rotated) setCookie(res, secret!, secure);
  return result;
}
export async function setCartQuantity(
  db: PrismaClient,
  req: Request,
  id: string,
  input: CartMutationInput,
  secure: boolean,
  checkoutEnabled = false,
) {
  const { quantity, mutation } = input;
  const reject = (status: number, code: string, message: string) => ({
    status,
    body: { code, message, mutationResult: { id: mutation.id, status: "rejected" as const } },
  });
  const secret = guestCartToken(req, secure);
  if (!secret || identity(secret) !== mutation.cartIdentity)
    return reject(409, "CART_SESSION_CHANGED", "Your cart session changed. Please review your cart.");
  const payloadHash = hash(JSON.stringify([id, quantity, mutation.cartIdentity, mutation.expectedRevision]));
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const cart = await tx.cart.findUnique({ where: { tokenHash: hash(secret) } });
        if (!cart || cart.expiresAt <= new Date())
          return reject(409, "CART_SESSION_CHANGED", "Your cart session changed. Please review your cart.");
        const previous = await tx.cartMutationReceipt.findUnique({
          where: { cartId_operationId: { cartId: cart.id, operationId: mutation.id } },
        });
        if (previous && previous.payloadHash !== payloadHash)
          return reject(409, "CART_OPERATION_CONFLICT", "This cart update conflicts with an earlier request. Please review your cart.");
        if (previous && previous.status !== 200)
          return reject(previous.status, previous.code, previous.message);
        const success = async (status: "applied" | "replayed", revision: number) => ({
          status: 200,
          body: {
            ...await readCart(tx, cart.id, checkoutEnabled),
            mutationContext: { cartIdentity: mutation.cartIdentity, revision },
            mutationResult: { id: mutation.id, status },
          },
        });
        if (previous) return success("replayed", cart.revision);
        const recordRejection = async (status: number, code: string, message: string) => {
          await tx.cartMutationReceipt.create({ data: { cartId: cart.id, operationId: mutation.id, payloadHash, status, code, message } });
          return reject(status, code, message);
        };
        if (cart.revision !== mutation.expectedRevision)
          return recordRejection(409, "CART_REVISION_CONFLICT", "Your cart changed in another window. Please review it before trying again.");
        if (quantity > 0) {
          const line = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: id } } });
          // Existing selections may shrink even if publication or pricing changed.
          // Adding or growing a selection still requires current public pricing.
          if (!line || quantity > line.quantity) {
            const variant = await tx.variant.findUnique({ where: { id }, include: { product: true } });
            if (!variant || !variant.product.published)
              return recordRejection(404, "PRODUCT_NOT_FOUND", "This item is no longer available.");
            if (!canAddToCart(variant))
              return recordRejection(409, "ENQUIRY_REQUIRED", "Please enquire about this item before adding it to your cart.");
          }
          if (!line && await tx.cartItem.count({ where: { cartId: cart.id } }) >= 50)
            return recordRejection(409, "CART_LIMIT", "Your cart can contain up to 50 different items.");
          await tx.cartItem.upsert({
            where: { cartId_variantId: { cartId: cart.id, variantId: id } },
            create: { cartId: cart.id, variantId: id, quantity }, update: { quantity },
          });
        } else {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id, variantId: id } });
        }
        const updated = await tx.cart.update({ where: { id: cart.id }, data: { revision: { increment: 1 } } });
        await tx.cartMutationReceipt.create({ data: { cartId: cart.id, operationId: mutation.id, payloadHash, status: 200, code: "", message: "" } });
        return success("applied", updated.revision);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Cart transaction did not complete");
}
