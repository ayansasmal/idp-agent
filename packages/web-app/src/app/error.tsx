'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
      <div className="text-5xl font-bold text-gray-300">Error</div>
      <h2 className="mt-4 text-xl font-bold text-gray-900">Something went wrong!</h2>
      <p className="mt-2 text-gray-600">
        We've encountered an error while processing your request.
      </p>
      <button
        onClick={reset}
        className="mt-6 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Try Again
      </button>
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 p-4 bg-red-50 rounded-md border border-red-200 max-w-2xl">
          <p className="text-red-700 font-mono text-sm">
            {error?.message || 'Unknown error'}
          </p>
        </div>
      )}
    </div>
  );
}