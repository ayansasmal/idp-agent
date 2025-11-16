# Next.js Migration Plan: Pages Router to App Router

This document outlines a comprehensive plan for migrating the web app from a hybrid Pages/App Router approach to a fully App Router-based implementation, in line with Next.js 16 best practices.

## Current State Analysis

The project currently exists in a hybrid state:

### Pages Router Components (`/src/pages`)
- `_app.tsx`: Global app wrapper
- `_document.tsx`: Custom document structure
- `_error.tsx`: Custom error page
- `404.tsx`: Custom 404 page
- `500.tsx`: Custom 500 page

### App Router Components (`/src/app`)
- `layout.tsx`: Root layout with HTML structure
- `page.tsx`: Home page
- `not-found.tsx`: 404 page for App Router
- `error.tsx`: Error boundary for App Router
- Various route-specific pages and API routes

This hybrid approach is causing build errors, particularly with HTML imports, as Next.js 16 has moved away from the Pages Router and fully embraces the App Router.

## Migration Strategy

We'll use a phased approach to ensure minimal disruption:

### Phase 1: Immediate Fix for Build Issues

1. **Disable Pages Router in next.config.js**:
   ```javascript
   module.exports = {
     // Other config...
     useFileSystemPublicRoutes: false, // Disables Pages Router
   };
   ```

2. **Remove or Comment Out exportPathMap**:
   This is not compatible with App Router and causes issues.

3. **Add Build Flag to Skip Static Generation**:
   ```javascript
   module.exports = {
     // Other config...
     output: 'standalone',
     experimental: {
       workerThreads: false,
       cpus: 1
     },
   };
   ```

### Phase 2: Complete Migration to App Router

1. **Move Global Styles and Providers**:
   - Ensure all global styles from `_app.tsx` are in `app/global.css`
   - Move provider setup from `_app.tsx` to `app/providers.tsx`

2. **Replicate Document Customizations**:
   - Move font definitions from `_document.tsx` to `layout.tsx` using Next.js 16's font system
   - Move meta tags to `layout.tsx` or use the Metadata API

3. **Ensure Error Handling**:
   - Verify `app/error.tsx` has equivalent functionality to `pages/_error.tsx`
   - Verify `app/not-found.tsx` has equivalent functionality to `pages/404.tsx`
   - Add `app/global-error.tsx` to handle fatal errors (equivalent to 500.tsx)

4. **Migrate Page-Specific Logic**:
   - Ensure any page initialization logic from `_app.tsx` is moved to appropriate App Router components

5. **Remove Pages Directory**:
   After verifying all functionality works, remove the `/src/pages` directory entirely

### Phase 3: Optimize App Router Implementation

1. **Implement Route Groups** for better organization
2. **Add Loading States** using `loading.tsx` for better UX
3. **Implement Server Components** where appropriate for better performance
4. **Add Metadata API** for improved SEO
5. **Implement Route Handlers** for API endpoints

## Implementation Steps

### Step 1: Fix Immediate Build Issues

```javascript
// next.config.js
const nextConfig = {
  // ...existing config

  // Disable Pages Router temporarily while migrating
  useFileSystemPublicRoutes: false,

  // Use server-side rendering with standalone output
  output: 'standalone',

  // Optimize for build time
  experimental: {
    workerThreads: false,
    cpus: 1
  },

  // Remove exportPathMap completely
};
```

### Step 2: Ensure App Router Has Required Components

1. **Verify Layout Structure**:
   ```tsx
   // app/layout.tsx
   import './globals.css';
   import { Inter } from 'next/font/google';
   import Providers from './providers';

   const inter = Inter({ subsets: ['latin'] });

   export const metadata = {
     title: 'AI-IDP Platform',
     description: 'AI-Powered Integrated Developer Platform',
   };

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <body className={inter.className}>
           <Providers>{children}</Providers>
         </body>
       </html>
     );
   }
   ```

2. **Create Global Error Boundary**:
   ```tsx
   // app/global-error.tsx
   'use client';

   export default function GlobalError({
     error,
     reset,
   }: {
     error: Error;
     reset: () => void;
   }) {
     return (
       <html lang="en">
         <body>
           <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4">
             <div className="text-6xl font-bold text-gray-300">500</div>
             <h1 className="mt-4 text-2xl font-bold text-gray-900">Server Error</h1>
             <p className="mt-2 text-gray-600">
               We're sorry, something went wrong on our end.
             </p>
             <button
               onClick={() => reset()}
               className="mt-6 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
             >
               Try again
             </button>
           </div>
         </body>
       </html>
     );
   }
   ```

### Step 3: Test and Remove Pages Directory

After verifying that all functionality works with the App Router:

```bash
# Verify build works without Pages Router
npm run build:web

# Once confirmed, remove Pages Router files
rm -rf src/pages
```

## Benefits of Migration

1. **Better Performance**: App Router enables more granular code splitting
2. **Server Components**: Reduces client-side JavaScript
3. **Improved Loading States**: Better UX with suspense and streaming
4. **Simplified Routing**: More intuitive nested routing
5. **Better TypeScript Support**: Enhanced type safety throughout
6. **Future-Proof**: Aligns with Next.js's strategic direction

## Post-Migration Optimization

- Implement React Server Components where possible
- Add metadata optimization for SEO
- Implement streaming for improved UX
- Add route groups for better organization
- Optimize data fetching with Server Actions

## Rollback Plan

If issues arise during migration:
1. Revert next.config.js changes
2. Re-enable Pages Router
3. Gradually migrate individual routes rather than all at once

---

This migration plan provides a path to resolve the current build issues while setting the foundation for a modern, performant web application using Next.js 16's App Router.