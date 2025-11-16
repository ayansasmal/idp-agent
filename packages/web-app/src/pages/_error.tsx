import { NextPageContext } from 'next';

interface ErrorProps {
  statusCode?: number;
}

function Error({ statusCode }: ErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4">
      <div className="text-6xl font-bold text-gray-300">{statusCode || 'Error'}</div>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">
        {statusCode ? `An error ${statusCode} occurred on server` : 'An error occurred on client'}
      </h1>
      <p className="mt-2 text-gray-600">Sorry, something went wrong.</p>
      <a
        href="/"
        className="mt-6 px-4 py-2 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Return Home
      </a>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;