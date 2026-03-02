import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LibraryTable } from "@/components/library-table";
import { Plus } from "lucide-react";

export default function LibraryPage() {
  return (
    <main className="min-h-screen max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Job Library</h1>
        <Link href="/create">
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold">
            <Plus className="h-4 w-4 mr-1.5" />
            New Job
          </Button>
        </Link>
      </div>
      <LibraryTable />
    </main>
  );
}
