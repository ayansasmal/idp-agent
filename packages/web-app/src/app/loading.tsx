export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="flex flex-col items-center">
        <div className="w-16 h-16 border-t-4 border-b-4 border-blue-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-lg font-medium text-gray-700">Loading...</p>
      </div>
    </div>
  );
}