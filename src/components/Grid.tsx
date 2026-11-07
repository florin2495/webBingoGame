"use client";

/**
 * empty    - manual fill, nothing placed yet
 * plain    - not marked
 * mine     - marked, a number I called (light green)
 * marked   - marked, called by someone else (dark green)
 * wrong    - marked but never called (end-of-game reveal, and while "Show" is active)
 * selected - chosen to be called, waiting for confirmation
 * hint     - called but not marked yet, highlighted by the "catch up" helper
 */
export type CellState = "empty" | "plain" | "mine" | "marked" | "wrong" | "selected" | "hint";

interface GridProps {
  size: number;
  /** Row-major values; null = empty cell (manual fill). */
  cells: (number | null)[];
  stateOf: (value: number | null, index: number) => CellState;
  onCellClick?: (value: number | null, index: number) => void;
  disabled?: boolean;
  /** Smaller variant for the end-of-game reveal. */
  compact?: boolean;
}

const textSize = (n: number, compact: boolean) => {
  if (compact) return n <= 5 ? "text-sm" : n <= 7 ? "text-xs" : "text-[10px]";
  return n <= 4 ? "text-2xl" : n <= 6 ? "text-xl" : n <= 8 ? "text-base" : "text-sm";
};

const styles: Record<CellState, string> = {
  empty: "bg-transparent border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400",
  plain: "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700",
  mine: "bg-emerald-200 border-emerald-400 text-emerald-950 dark:bg-emerald-300 dark:border-emerald-200",
  marked: "bg-emerald-700 border-emerald-800 text-white dark:bg-emerald-800 dark:border-emerald-600",
  wrong: "bg-rose-200 border-rose-500 text-rose-900 line-through decoration-2 dark:bg-rose-300",
  selected: "bg-amber-300 border-amber-500 text-zinc-900 ring-2 ring-amber-500",
  hint: "bg-white dark:bg-zinc-900 border-yellow-400 ring-4 ring-yellow-400 animate-pulse",
};

export function Grid({ size, cells, stateOf, onCellClick, disabled, compact = false }: GridProps) {
  return (
    <div
      className={`mx-auto grid w-full ${compact ? "max-w-[300px] gap-0.5" : "max-w-[480px] gap-1 sm:gap-1.5"}`}
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
    >
      {cells.map((value, i) => {
        const state = stateOf(value, i);
        return (
          <button
            key={i}
            type="button"
            disabled={disabled || !onCellClick}
            onClick={() => onCellClick?.(value, i)}
            aria-label={value === null ? `Celula goală ${i + 1}` : `Numărul ${value}`}
            aria-pressed={state === "mine" || state === "marked"}
            className={`aspect-square select-none border font-semibold tabular-nums transition-colors ${compact ? "rounded" : "rounded-md"} ${textSize(size, compact)} ${styles[state]} enabled:active:scale-95 disabled:cursor-default`}
          >
            {value ?? ""}
          </button>
        );
      })}
    </div>
  );
}
