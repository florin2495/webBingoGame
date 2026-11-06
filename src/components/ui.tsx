"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const v = {
    primary: "bg-indigo-600 text-white enabled:hover:bg-indigo-500",
    secondary:
      "bg-zinc-200 text-zinc-900 enabled:hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:enabled:hover:bg-zinc-700",
    danger: "bg-rose-600 text-white enabled:hover:bg-rose-500",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`min-h-11 rounded-lg px-4 py-2 font-semibold transition-colors disabled:opacity-40 ${v} ${className}`}
    />
  );
}

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <input
        {...props}
        className="min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${className}`}
    >
      {children}
    </section>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-400">
      {children}
    </p>
  );
}
