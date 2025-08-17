import Chat from "@/components/Chat";

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Platform Agent Chat</h1>
        <p className="mt-2 text-lg text-gray-600">
          Natural language interface for platform operations
        </p>
      </div>
      
      <Chat />

      <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">Example Operations:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-blue-700">
          <div>• Deploy my Node.js app to staging</div>
          <div>• Scale payment service to 5 replicas</div>
          <div>• Show status of production services</div>
          <div>• Roll back user-auth to previous version</div>
          <div>• Create a PostgreSQL database</div>
          <div>• Check logs for api-gateway</div>
        </div>
      </div>
    </div>
  );
}