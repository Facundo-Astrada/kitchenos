import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#1c2d4a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: 64,
            fontWeight: 900,
            fontFamily: 'sans-serif',
            letterSpacing: -2,
          }}
        >
          KOS
        </span>
      </div>
    ),
    { width: 180, height: 180 }
  )
}
