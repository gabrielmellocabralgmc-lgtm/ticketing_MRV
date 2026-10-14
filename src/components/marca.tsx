import clsx from "clsx";

/** Selo "MRV" (texto, sem reproduzir o logotipo oficial). */
export function Marca({ className, claro }: { className?: string; claro?: boolean }) {
  return (
    <span className={clsx("rounded-md px-2 py-0.5 font-display text-[15px] font-extrabold", claro ? "bg-white text-mrv-600" : "bg-mrv-600 text-white", className)}>
      MRV
    </span>
  );
}
