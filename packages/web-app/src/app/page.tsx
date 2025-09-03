import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          AI-Powered Integrated Developer Platform
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Use natural language to manage your infrastructure. Deploy, scale, and monitor your applications 
          through conversational AI with built-in safety controls and human approval workflows.
        </p>
        <div className="flex justify-center space-x-4">
          <Link 
            href="/chat"
            className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            Start Chatting
          </Link>
          <Link 
            href="/dashboard"
            className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            View Dashboard
          </Link>
          <Link 
            href="/approvals"
            className="border border-gray-300 text-gray-700 px-8 py-3 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            View Approvals
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center mb-4">
            <div className="bg-indigo-100 rounded-lg p-3 mr-4">
              <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Natural Language Operations</h3>
          </div>
          <p className="text-gray-600 mb-4">
            Describe what you want in plain English: "Deploy my Node.js app to staging with PostgreSQL" 
            and the AI agent handles all the complexity.
          </p>
          <Link href="/chat" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Try the chat interface →
          </Link>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center mb-4">
            <div className="bg-green-100 rounded-lg p-3 mr-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Human Approval Workflow</h3>
          </div>
          <p className="text-gray-600 mb-4">
            Risky operations require human approval. Review changes, assess impact, and approve or reject 
            with detailed rollback plans.
          </p>
          <Link href="/approvals" className="text-indigo-600 hover:text-indigo-700 font-medium">
            View approval queue →
          </Link>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center mb-4">
            <div className="bg-blue-100 rounded-lg p-3 mr-4">
              <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Safety-First Design</h3>
          </div>
          <p className="text-gray-600 mb-4">
            Conservative risk assessment, policy compliance checks, and comprehensive audit trails 
            ensure safe platform operations.
          </p>
          <div className="text-gray-500">
            Built-in safety controls
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center mb-4">
            <div className="bg-orange-100 rounded-lg p-3 mr-4">
              <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Real-time Dashboard</h3>
          </div>
          <p className="text-gray-600 mb-4">
            Monitor all platform operations with live status updates, progress tracking, and detailed 
            execution logs in a comprehensive dashboard.
          </p>
          <Link href="/dashboard" className="text-orange-600 hover:text-orange-700 font-medium">
            View dashboard →
          </Link>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center mb-4">
            <div className="bg-purple-100 rounded-lg p-3 mr-4">
              <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Multi-Agent Architecture</h3>
          </div>
          <p className="text-gray-600 mb-4">
            Built on a distributed multi-agent system with Meta-Agent orchestration, Infrastructure Agent for 
            K8s operations, and Observability Agent for monitoring.
          </p>
          <div className="text-gray-500">
            Production Ready System
          </div>
        </div>
      </div>

      {/* Example Operations */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Example Operations</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="font-medium text-gray-900">Deployment:</div>
            <div className="text-gray-600">"Deploy my Node.js app to staging with PostgreSQL"</div>
            <div className="text-gray-600">"Roll back user-auth to the previous version"</div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-gray-900">Scaling:</div>
            <div className="text-gray-600">"Scale payment service to handle 5000 users"</div>
            <div className="text-gray-600">"Auto-scale api-gateway based on CPU usage"</div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-gray-900">Monitoring:</div>
            <div className="text-gray-600">"Show me the health of all production services"</div>
            <div className="text-gray-600">"Check logs for payment-service errors"</div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-gray-900">Infrastructure:</div>
            <div className="text-gray-600">"Create a Redis cache for session storage"</div>
            <div className="text-gray-600">"Set up a CDN for static assets"</div>
          </div>
        </div>
      </div>
    </div>
  );
}
