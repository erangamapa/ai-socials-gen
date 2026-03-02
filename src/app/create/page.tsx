import { JobForm } from "@/components/job-form";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ fromVariant?: string }>;
}) {
  const { fromVariant } = await searchParams;
  return (
    <main className="relative min-h-screen flex items-start justify-center pt-12 px-4 pb-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-linear-to-b from-primary/4 via-secondary/2 to-transparent" />
      <JobForm fromVariantId={fromVariant} />
    </main>
  );
}
