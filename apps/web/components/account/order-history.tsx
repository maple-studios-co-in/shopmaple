"use client";
import Link from "next/link";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { orderStatusTabs, type OrderStatus, type OrderSummary } from "@shopmaple/contracts/account";
import { money } from "@/lib/format";
import { formatDate, itemCount } from "@/lib/account/format";
import { OrderPhoto } from "./account-parts";

type Tab = "all" | keyof typeof orderStatusTabs;
const tabs: Array<[Tab, string, string]> = [
  ["all", "All orders", "orders"],
  ["inProgress", "In progress", "orders in progress"],
  ["delivered", "Delivered", "delivered orders"],
  ["cancelled", "Cancelled", "cancelled orders"],
];
const inTab = (tab: Tab, status: OrderStatus) => tab === "all" || (orderStatusTabs[tab] as readonly OrderStatus[]).includes(status);

/** Search by number ("MF-10482", "10482", "#mf-104") or by the piece's name. */
function matches(order: OrderSummary, query: string) {
  const typed = query.trim().toLowerCase().replace(/^#/, "");
  if (!typed) return true;
  const number = /^(?:mf-?)?([0-9]+)$/.exec(typed)?.[1];
  if (number) return order.number.slice(3).includes(number);
  return [order.number, order.firstItem.title, order.firstItem.variant].some((value) => value.toLowerCase().includes(typed));
}

/** The order list (Figma 392:1338): search, the status tabs with their counts, then the orders. */
export function OrderHistory({ orders, preview = false }: { orders: OrderSummary[]; preview?: boolean }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const found = useMemo(() => orders.filter((order) => matches(order, query)), [orders, query]);
  const shown = found.filter((order) => inTab(tab, order.status));

  if (orders.length === 0)
    return (
      <section className="account-card" aria-labelledby={`${id}-empty`}>
        <h2 id={`${id}-empty`} className="account-empty-title">No orders yet</h2>
        <p className="account-muted">Orders you place online appear here, with every step from confirmation to delivery.</p>
        <Link className="account-cta" data-fill-button="" href="/collections/all">Explore furniture</Link>
      </section>
    );

  function choose(next: Tab, focus = false) {
    setTab(next);
    if (focus) tabRefs.current.get(next)?.focus();
  }
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const moves: Record<string, number> = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    choose(tabs[target]![0], true);
  }
  const label = tabs.find(([key]) => key === tab)!;
  return (
    <>
      <div className="account-order-controls">
        <div className="account-field account-order-search">
          <label className="account-label" htmlFor={`${id}-search`}>Search your orders</label>
          <input id={`${id}-search`} className="account-input" type="search" value={query} placeholder="Order number or product" autoComplete="off"
            onChange={(event) => setQuery(event.currentTarget.value)} />
        </div>
        <button type="button" className="account-cta" data-variant="quiet" data-fill-button="outline" onClick={() => { setQuery(""); setTab("all"); }}>
          All orders
        </button>
      </div>
      <div className="account-tabs" role="tablist" aria-label="Orders by status">
        {tabs.map(([key, name], index) => (
          <button key={key} type="button" role="tab" id={`${id}-tab-${key}`} aria-controls={`${id}-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
            className="account-tab" ref={(element) => { if (element) tabRefs.current.set(key, element); else tabRefs.current.delete(key); }}
            onClick={() => choose(key)} onKeyDown={(event) => onKeyDown(event, index)}>
            <span>{name}</span> <span className="account-tab-count">{found.filter((order) => inTab(key, order.status)).length}</span>
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="account-orders">
        {shown.length > 0 ? (
          <>
            <div className="account-orders-head" aria-hidden="true">
              <span>Order / item</span>
              <span>Date</span>
              <span>Status</span>
              <span>Total</span>
            </div>
            <ul className="account-orders-list">
              {shown.map((order) => (
                <li key={order.number} className="account-order-row" data-order-row={order.number}>
                  <div className="account-order-item">
                    <OrderPhoto src={order.firstItem.imageUrl} slot={68} />
                    <div className="account-order-name">
                      <p className="account-order-number">{`#${order.number}`}</p>
                      <p className="account-order-title">{order.firstItem.title}</p>
                      <Link className="account-order-link" href={preview ? `/account/orders/${order.number}?preview=design` : `/account/orders/${order.number}`}>
                        {`${itemCount(order.itemCount)} · View details`}
                        <span aria-hidden="true"> →</span>
                        <span className="sr-only">{` of order ${order.number}`}</span>
                      </Link>
                    </div>
                  </div>
                  <p className="account-order-date"><span className="sr-only">Placed </span>{formatDate(order.placedAt)}</p>
                  <p className="account-order-status"><span className="account-status" data-status={order.status}>{order.statusLabel}</span></p>
                  <p className="account-order-total"><span className="sr-only">Total </span>{money(order.totalPaise)}</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="account-orders-empty">
            {query.trim() ? (
              <>
                <p className="account-empty-title">{`No orders match “${query.trim()}”`}</p>
                <button type="button" className="account-text-link" onClick={() => setQuery("")}>Clear search</button>
              </>
            ) : (
              <p className="account-empty-title">{`No ${label[2]} yet`}</p>
            )}
          </div>
        )}
      </div>
      <p className="account-orders-count" role="status">{`Showing ${shown.length} ${shown.length === 1 ? "order" : "orders"}`}</p>
    </>
  );
}
