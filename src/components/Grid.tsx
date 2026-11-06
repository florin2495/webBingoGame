"use client";

type CellState = "empty" | "plain" | "marked" | "selected";

interface GridProps {
  size: number;
  /** Row-major values; null = empty cell (manual fill). */
  cells: (number | null)[];
  stateOf: (value: number | null, index: number) => CellState;
  onCellClick?: (value: number | null, index: number) => void;
  disabled?: boolean;
}

const textSize = (n: number) =>
  n <= 4 ? "text-2xl" : n <= 6 ? "text-xl" : n <= 8 ? "text-base" : "text-sm";

const styles: Record<CellState, string> = {
  empty: "bg-transparent border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-400",
  plain: "bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700",
  marked:
    "bg-emerald-500 border-emerald-600 text-white dark:bg-emerald-600 dark:border-emerald-500 line-through decoration-2",
  selected: "bg-amber-300 border-amber-500 text-zinc-900 ring-2 ring-amber-500",
};

export function Grid({ size, cells, stateOf, onCellClick, disabled }: GridProps) {
  return (
    <div
      className="mx-auto grid w-full max-w-[480px] gap-1 sm:gap-1.5"
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
            aria-pressed={state === "marked"}
            className={`aspect-square select-none rounded-md border font-semibold tabular-nums transition-colors ${textSize(size)} ${styles[state]} enabled:active:scale-95 disabled:cursor-default`}
          >
            {value ?? ""}
          </button>
        );
      })}
    </div>
  );
}
