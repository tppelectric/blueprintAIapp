"use client";

import { useCallback, useEffect, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import type { ReceiptRow } from "@/lib/receipts-types";

/**
 * Lazy-load job-receipts signed URLs when the thumb root enters the viewport.
 * Dedupes in-flight fetches; optional immediate fetch for lightbox open.
 */
export function useReceiptThumbIntersection(
  thumbs: Record<string, string>,
  setUrls: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
  const urlsRef = useRef<Record<string, string>>({});
  const inflightRef = useRef(
    new Map<string, Promise<string | null>>(),
  );
  const pathByIdRef = useRef(new Map<string, string>());
  const lastElByIdRef = useRef(new Map<string, HTMLElement>());
  type Obs = Pick<
    IntersectionObserver,
    "observe" | "unobserve" | "disconnect"
  >;
  const observerRef = useRef<Obs | null>(null);

  useEffect(() => {
    urlsRef.current = thumbs;
    if (Object.keys(thumbs).length === 0) {
      inflightRef.current.clear();
    }
  }, [thumbs]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      lastElByIdRef.current.clear();
    };
  }, []);

  const fetchSigned = useCallback(
    async (id: string, storagePath: string): Promise<string | null> => {
      const existing = urlsRef.current[id];
      if (existing) return existing;
      let p = inflightRef.current.get(id);
      if (!p) {
        p = (async () => {
          try {
            const sb = createBrowserClient();
            const { data: signed } = await sb.storage
              .from("job-receipts")
              .createSignedUrl(storagePath, 3600);
            const u = signed?.signedUrl ?? null;
            if (u) {
              setUrls((prev) => (prev[id] ? prev : { ...prev, [id]: u }));
              urlsRef.current = { ...urlsRef.current, [id]: u };
            }
            return u;
          } catch {
            return null;
          } finally {
            inflightRef.current.delete(id);
          }
        })();
        inflightRef.current.set(id, p);
      }
      return p;
    },
    [setUrls],
  );

  const triggerIntersect = useCallback(
    (id: string) => {
      const path = pathByIdRef.current.get(id);
      if (!path) return;
      void fetchSigned(id, path);
    },
    [fetchSigned],
  );

  const ensureObserver = useCallback(() => {
    if (observerRef.current) return observerRef.current;
    if (typeof IntersectionObserver === "undefined") {
      const noop: Obs = {
        observe: (el: Element) => {
          const id = (el as HTMLElement).dataset.receiptThumbId;
          if (id) triggerIntersect(id);
        },
        unobserve: () => {},
        disconnect: () => {},
      };
      observerRef.current = noop;
      return noop;
    }
    const obs: Obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          const id = el.dataset.receiptThumbId;
          if (!id) continue;
          obs.unobserve(el);
          triggerIntersect(id);
        }
      },
      { root: null, rootMargin: "120px", threshold: 0.01 },
    );
    observerRef.current = obs;
    return obs;
  }, [triggerIntersect]);

  const bindReceiptThumb = useCallback(
    (r: ReceiptRow) => (el: HTMLElement | null) => {
      const obs = ensureObserver();
      const prev = lastElByIdRef.current.get(r.id);
      if (prev && prev !== el) {
        obs.unobserve(prev);
      }
      if (el) {
        lastElByIdRef.current.set(r.id, el);
        el.dataset.receiptThumbId = r.id;
        pathByIdRef.current.set(r.id, r.storage_path);
        obs.observe(el);
      } else {
        lastElByIdRef.current.delete(r.id);
      }
    },
    [ensureObserver],
  );

  const getOrFetchThumbUrl = useCallback(
    async (r: ReceiptRow): Promise<string | null> => {
      if (urlsRef.current[r.id]) return urlsRef.current[r.id]!;
      pathByIdRef.current.set(r.id, r.storage_path);
      return fetchSigned(r.id, r.storage_path);
    },
    [fetchSigned],
  );

  return { bindReceiptThumb, getOrFetchThumbUrl };
}
