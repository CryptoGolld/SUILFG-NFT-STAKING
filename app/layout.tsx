'use client'

import './globals.css'
import '@mysten/dapp-kit/dist/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit'
import { getFullnodeUrl } from '@mysten/sui.js/client'
import { Toaster } from 'react-hot-toast'
import { usePathname } from 'next/navigation'

const queryClient = new QueryClient()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const showToaster = !(pathname && pathname.startsWith('/dashboard'))
  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          {(() => {
            const { networkConfig } = createNetworkConfig({
              mainnet: { url: getFullnodeUrl('mainnet') },
              testnet: { url: getFullnodeUrl('testnet') },
            })
            return (
              <SuiClientProvider networks={networkConfig} defaultNetwork="mainnet">
            <WalletProvider
              autoConnect={false}
              storageKey="sui-wallet"
            >
              {children}
              {showToaster && <Toaster position="top-right" />}
            </WalletProvider>
              </SuiClientProvider>
            )
          })()}
        </QueryClientProvider>
      </body>
    </html>
  )
}
