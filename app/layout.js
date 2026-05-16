export const metadata = {
  title: 'HPDR Bot Dashboard',
  description: 'Trading bot dashboard',
}

export default function RootLayout({ children }) {
  return (
    <html lang="he">
      <body>{children}</body>
    </html>
  )
}
