import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LibraryTable } from "@/components/library-table";

export default function LibraryPage() {
  return (
    <main className="min-h-screen max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Job Library</h1>
        <Link href="/create">
          <Button>New Job</Button>
        </Link>
      </div>
      <LibraryTable />
    </main>
  );
}
