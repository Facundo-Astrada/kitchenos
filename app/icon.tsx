import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          borderRadius: 80,
          background: '#1c2d4a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: 180,
            fontWeight: 900,
            fontFamily: 'sans-serif',
            letterSpacing: -4,
          }}
        >
          KOS
        </span>
      </div>
    ),
    { width: 512, height: 512 }
  )
}
