export default function Custom500() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4">
      <div className="text-6xl font-bold text-gray-300">500</div>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">Server Error</h1>
      <p className="mt-2 text-gray-600">Sorry, something went wrong on our server.</p>
      <a
        href="/"
        className="mt-6 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Return Home
      </a>
    </div>
  );
}