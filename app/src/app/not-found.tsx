import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="font-mono font-semibold text-xl">Not found</h1>
      <Link href="/" className="text-primary text-sm underline underline-offset-4">Back to the playground</Link>
    </div>
  );
}
