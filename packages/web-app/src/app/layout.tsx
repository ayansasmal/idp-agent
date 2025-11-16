import './global.css';
import Providers from './providers';

export const metadata = {
  title: 'AI-IDP Platform',
  description: 'AI-Powered Integrated Developer Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
