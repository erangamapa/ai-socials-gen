import { JobForm } from "@/components/job-form";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ fromVariant?: string }>;
}) {
  const { fromVariant } = await searchParams;
  return (
    <main className="min-h-screen flex items-start justify-center pt-12 px-4 pb-12">
      <JobForm fromVariantId={fromVariant} />
    </main>
  );
}
