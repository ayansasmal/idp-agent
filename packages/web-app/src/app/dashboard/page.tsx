"use client";

import ActionDashboard from '@/components/ActionDashboard';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Platform Dashboard</h1>
              <p className="text-gray-600 mt-2">
                Monitor and track all your platform operations in real-time
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link
                href="/chat"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                💬 New Chat
              </Link>
              
              <Link
                href="/sessions"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                📋 All Sessions
              </Link>
            </div>
          </div>
        </div>

        {/* Dashboard */}
        <ActionDashboard 
          userId="web-user"
          showFilters={true}
          autoRefresh={true}
          refreshInterval={10000}
          className="w-full"
        />

        {/* Quick Actions */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">🚀 Quick Deploy</h3>
            <p className="text-gray-600 text-sm mb-4">
              Deploy applications with natural language commands
            </p>
            <Link
              href="/chat"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Start Deployment →
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">📊 Monitoring</h3>
            <p className="text-gray-600 text-sm mb-4">
              Check service health and performance metrics
            </p>
            <Link
              href="/chat"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View Metrics →
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">🔧 Operations</h3>
            <p className="text-gray-600 text-sm mb-4">
              Scale, update, and manage your infrastructure
            </p>
            <Link
              href="/chat"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Manage Resources →
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 text-sm">
            AI-Powered Integrated Developer Platform • Real-time Action Tracking
          </p>
        </div>
      </div>
    </div>
  );
}