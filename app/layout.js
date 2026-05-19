import './globals.css';

export const metadata = {
  title: 'BAG Property Holdings | Property Portfolio',
  description: 'Explore BAG Property Holdings rental and property opportunities through one public portfolio landing page.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
