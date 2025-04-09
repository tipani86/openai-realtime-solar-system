"use client";

import dynamic from 'next/dynamic';
import React from 'react';

// Dynamically import the WebRTCClient with SSR disabled
const WebRTCClient = dynamic(
  () => import('@/components/WebRTCClient'),
  { ssr: false } // This is the key - it prevents server-side rendering
);

export default function App() {
  return <WebRTCClient />;
}
