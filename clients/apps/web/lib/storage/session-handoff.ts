"use client";

import "client-only";

import type { ZodType } from "zod";

/**
 * A value a page leaves for itself across a full-page sign-in redirect. It lives
 * in this tab's sessionStorage and is read once. Nothing sensitive belongs here:
 * the page stores an id it can verify with the server, never a token.
 */
export function sessionHandoff(key: string) {
  return {
    write(value: unknown): void {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    /** Reads the value without consuming it. */
    peek(): unknown {
      const raw = window.sessionStorage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    /** Reads and removes the value. A malformed value is dropped. */
    take<T>(schema: ZodType<T>): T | null {
      const value = this.peek();
      this.clear();
      const parsed = schema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
    clear(): void {
      window.sessionStorage.removeItem(key);
    },
  };
}
