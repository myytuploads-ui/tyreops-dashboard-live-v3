import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Rescue Tyres Owner OS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          background: 'linear-gradient(155deg, #14181f 0%, #0c0f14 48%, #10141a 100%)',
          color: '#eef1f5',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.45,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 4px)',
            opacity: 0.35,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '-10%',
            left: '-5%',
            width: '55%',
            height: '55%',
            background: 'radial-gradient(circle, rgba(237,48,71,0.22), transparent 68%)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 14,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: '#f0a0ab',
                fontWeight: 700,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 999, background: '#ed3047', boxShadow: '0 0 16px #ed3047' }} />
              Rescue Tyres
            </div>
            <div style={{ fontSize: 54, fontWeight: 650, letterSpacing: '-0.04em', lineHeight: 1.05 }}>Owner OS</div>
            <div style={{ fontSize: 22, color: '#9aa3ae' }}>Mobile tyre command · graphite pulse</div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 999,
              border: '1px solid rgba(237,48,71,0.35)',
              background: 'rgba(237,48,71,0.1)',
              color: '#f3b3bb',
              fontSize: 13,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            LIVE HUD
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, position: 'relative' }}>
          {[
            { label: 'TODAY', value: 'Jobs', chrome: '12' },
            { label: 'WEEK', value: 'Earnings', chrome: '—' },
            { label: 'PULSE', value: 'Needs You', chrome: '0' },
          ].map((panel) => (
            <div
              key={panel.label}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '22px 20px',
                borderRadius: 22,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(10,12,16,0.55))',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ fontSize: 12, letterSpacing: '0.18em', color: '#8f969f', textTransform: 'uppercase' }}>{panel.label}</div>
              <div style={{ fontSize: 18, color: '#c5cad3' }}>{panel.value}</div>
              <div style={{ fontSize: 42, fontWeight: 650, letterSpacing: '-0.05em', color: '#f4f6f8' }}>{panel.chrome}</div>
              <div style={{ height: 4, borderRadius: 999, background: 'rgba(237,48,71,0.35)', marginTop: 6 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <div style={{ fontSize: 14, color: '#7f8692', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Robotic console · public-safe preview
          </div>
          <div style={{ fontSize: 14, color: '#ed3047', fontWeight: 700 }}>RESCUE TYRES</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
