'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4">
          <div className="text-6xl font-bold text-gray-300">500</div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">Server Error</h1>
          <p className="mt-2 text-gray-600">
            We've encountered an unexpected error in the application.
          </p>
          <div className="mt-6 space-x-4">
            <button
              onClick={() => reset()}
              className="px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Try Again
            </button>
            <a
              href="/"
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Return Home
            </a>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-8 p-4 bg-red-50 rounded-md border border-red-200 max-w-2xl">
              <h2 className="text-red-800 font-semibold">Error details (dev only):</h2>
              <p className="mt-2 text-red-700 font-mono text-sm">
                {error?.message || 'Unknown error'}
              </p>
              {error?.digest && (
                <p className="mt-1 text-red-700 font-mono text-sm">
                  Digest: {error.digest}
                </p>
              )}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
