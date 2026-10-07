import React from 'react';

export default function FullPageSkeleton() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: '#f4fbf7',
      backgroundImage: 'radial-gradient(at 0% 100%, rgba(34, 197, 94, 0.08) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(15, 34, 56, 0.03) 0px, transparent 50%)',
    }}>
      {/* Top Navbar Skeleton */}
      <div style={{
        height: '70px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        justifyContent: 'space-between'
      }}>
        <div style={{ width: '120px', height: '32px', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite ease-in-out' }} />
        <div style={{ width: '40px', height: '40px', backgroundColor: '#e2e8f0', borderRadius: '50%', animation: 'pulse 1.5s infinite ease-in-out' }} />
      </div>

      {/* Main Content Skeleton */}
      <div style={{
        maxWidth: '900px',
        width: '100%',
        margin: '60px auto',
        padding: '0 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px'
      }}>
        {/* Header Skeleton */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ width: '60%', height: '36px', backgroundColor: '#e2e8f0', borderRadius: '6px', animation: 'pulse 1.5s infinite ease-in-out' }} />
          <div style={{ width: '40%', height: '20px', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite ease-in-out', animationDelay: '0.2s' }} />
        </div>

        {/* Card Skeletons */}
        <div style={{ 
          backgroundColor: '#fff', 
          borderRadius: '16px', 
          padding: '32px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
              <div style={{ width: '48px', height: '48px', backgroundColor: '#e2e8f0', borderRadius: '12px', flexShrink: 0, animation: 'pulse 1.5s infinite ease-in-out' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <div style={{ width: '40%', height: '20px', backgroundColor: '#e2e8f0', borderRadius: '4px', animation: 'pulse 1.5s infinite ease-in-out' }} />
                <div style={{ width: '80%', height: '16px', backgroundColor: '#f1f5f9', borderRadius: '4px', animation: 'pulse 1.5s infinite ease-in-out' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}} />
    </div>
  );
}
