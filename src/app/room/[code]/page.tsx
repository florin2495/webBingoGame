import { Suspense } from "react";
import { RoomClient } from "@/components/RoomClient";

export default function Page({ params }: PageProps<"/room/[code]">) {
  return (
    <Suspense fallback={<p className="p-8 text-center text-zinc-500">Se încarcă…</p>}>
      {params.then(({ code }) => (
        <RoomClient code={code.toUpperCase()} />
      ))}
    </Suspense>
  );
}
