import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

/**
 * This file is web-only and used to configure the root HTML for every web page
 * during static rendering. The contents of this function only run in Node.js
 * environments and do not have access to the DOM or browser APIs.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <title>Dimer</title>
        <meta name="description" content="Know your deficit. Own your day." />
        <meta name="theme-color" content="#070B14" />

        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Dimer" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work
          closer to how they do on native.
        */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: backgroundStyle }} />

        <script dangerouslySetInnerHTML={{ __html: serviceWorkerScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}

const backgroundStyle = `html, body { background-color: #070B14; }`

const serviceWorkerScript = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
`
