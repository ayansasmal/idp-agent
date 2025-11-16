# Next.js 16 Error Handling Implementation Guide

This document provides detailed, step-by-step implementation instructions for fixing the HTML import error in the AI-IDP web application and ensuring proper error handling in Next.js 16 App Router.

## Background

The web application is currently in a hybrid state with both Pages Router (`/src/pages`) and App Router (`/src/app`) directories. This is causing build errors related to HTML imports, specifically:

```
Error: <Html> should not be imported outside of pages/_document.
```

This occurs because Next.js 16 has different approaches to handling error pages between the Pages Router and App Router.

## Root Cause Analysis

1. The Pages Router uses:
   - `_document.tsx`: To define HTML structure
   - `_app.tsx`: For global app wrapper
   - `404.tsx`, `500.tsx`: For error pages

2. The App Router uses:
   - `layout.tsx`: Combines document and app functionality
   - `error.tsx`: For route segment errors
   - `global-error.tsx`: For root layout errors
   - `not-found.tsx`: For 404 errors

3. When the build process tries to generate static pages for 404.tsx, it encounters a conflict with the App Router's approach to rendering HTML tags.

## Implementation Steps

### Phase 1: Immediate Fix (Short-term Solution)

This phase provides a quick fix to resolve build errors without major refactoring.

1. **Disable Pages Router Error Routes**

   Edit `next.config.js` to temporarily disable static generation for error pages:

   ```javascript
   // next.config.js
   const nextConfig = {
     // Existing config...

     // Disable Pages Router temporarily during migration
     useFileSystemPublicRoutes: false,

     // Use standalone output for production
     output: 'standalone',

     // Optimize build performance
     experimental: {
       workerThreads: false,
       cpus: 1
     }
   };
   ```

   This prevents Next.js from trying to generate static pages for the Pages Router error routes.

2. **Test the Build**

   Run the build process to verify the error is resolved:

   ```bash
   npm run build:web
   ```

### Phase 2: Proper App Router Error Implementation

This phase implements the correct error handling approach for Next.js 16 App Router.

1. **Verify App Router Error Components**

   First, ensure the App Router has all required error components:

   - `app/not-found.tsx`: Already exists and looks good
   - `app/error.tsx`: Already exists, review content
   - `app/global-error.tsx`: Need to create

2. **Create global-error.tsx**

   Create a file at `src/app/global-error.tsx`:

   ```tsx
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
   ```

   **Important notes about global-error.tsx**:
   - Must be a client component ('use client')
   - Must include `<html>` and `<body>` tags
   - Should provide a way to return to the home page
   - For dev environment, include error details for debugging
   - Cannot use CSS modules or import styles directly

3. **Update the error.tsx Component**

   Review and update the existing `src/app/error.tsx`:

   ```tsx
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
   ```

   **Important notes about error.tsx**:
   - Must be a client component ('use client')
   - Should NOT include `<html>` or `<body>` tags
   - Should provide a way to retry (using reset())
   - For dev environment, include error details for debugging

4. **Ensure not-found.tsx is Properly Set Up**

   Verify the content of `src/app/not-found.tsx`. It should look similar to:

   ```tsx
   export default function NotFound() {
     return (
       <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4">
         <div className="text-6xl font-bold text-gray-300">404</div>
         <h1 className="mt-4 text-2xl font-bold text-gray-900">Page not found</h1>
         <p className="mt-2 text-gray-600">The page you are looking for does not exist.</p>
         <a
           href="/"
           className="mt-6 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
         >
           Return Home
         </a>
       </div>
     );
   }
   ```

5. **Test the App Router Error Handling**

   Create a temporary test page to verify error handling:

   ```tsx
   // src/app/test-error/page.tsx
   'use client';

   import { useEffect } from 'react';

   export default function TestErrorPage() {
     useEffect(() => {
       throw new Error('This is a test error');
     }, []);

     return <div>This page should throw an error</div>;
   }
   ```

   Then navigate to `/test-error` to verify the error.tsx component works.

### Phase 3: Complete Migration (Long-term Solution)

Once you've verified that the App Router error handling works correctly, you can complete the migration:

1. **Move Any Remaining Global Styles**

   Ensure all global styles from `_app.tsx` are properly moved to `app/global.css`

2. **Verify Provider Implementation**

   Make sure the providers from `_app.tsx` are properly implemented in `app/providers.tsx`

3. **Remove Pages Directory Entirely**

   Once you're confident that all functionality has been migrated:

   ```bash
   # After verifying all functionality works
   rm -rf src/pages
   ```

4. **Update next.config.js**

   Remove the temporary Pages Router disabling:

   ```javascript
   // next.config.js
   const nextConfig = {
     // Existing config...

     // Remove this line after migration is complete
     // useFileSystemPublicRoutes: false,

     // Keep production optimizations
     output: 'standalone',
   };
   ```

## Testing Strategy

To thoroughly test the error handling implementation:

1. **Build Test**
   ```bash
   npm run build:web
   ```
   Verify no HTML import errors occur during build.

2. **404 Error Test**
   Navigate to a non-existent route (e.g., `/some-random-page`) and verify the not-found.tsx component is displayed.

3. **Component Error Test**
   Create a temporary page that throws an error and verify the error.tsx component is displayed.

4. **Root Layout Error Test**
   Creating errors in the root layout is challenging and not recommended, but to test global-error.tsx, you could temporarily add code that throws an error to the layout.tsx file.

## Troubleshooting

If you encounter issues during implementation:

1. **Build Errors Persist**
   - Verify that useFileSystemPublicRoutes is set to false
   - Check for any references to Html from next/document in app/* files
   - Try building with NODE_ENV=production for a cleaner build

2. **Error Components Not Displaying**
   - Verify they are client components ('use client')
   - Check console for additional errors
   - Review Next.js documentation for any changes in error handling APIs

3. **Static Generation Issues**
   - If still encountering issues with static generation, consider adjusting the output option in next.config.js to 'export' for static site generation or 'standalone' for server rendering

## Conclusion

By following these implementation steps, you should be able to resolve the HTML import error and properly implement error handling in the Next.js 16 App Router. This approach ensures a clean separation from the Pages Router approach and leverages the more modern error handling capabilities of the App Router.