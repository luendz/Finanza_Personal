    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['DM Sans', 'sans-serif'],
            heading: ['Cormorant Garamond', 'Georgia', 'serif']
          },
          colors: {
            appbg: '#f3f6fa',
            appbg2: '#e8eef5',
            card: '#ffffff',
            borderc: '#d6e0ec',
            text1: '#142033',
            text2: '#475569',
            text3: '#64748b',
            green1: '#15805f',
            greenbg: '#edf8f3',
            greentx: '#0f6c4d',
            red1: '#d94a5d',
            redbg: '#fff1f3',
            redtx: '#a32138',
            blue1: '#2563eb',
            bluebg: '#eef4ff',
            bluetx: '#1f55c7',
            accent: '#2563eb'
          },
          boxShadow: {
            soft: '0 10px 32px rgba(23, 43, 77, 0.07)',
            modal: '0 24px 70px rgba(16, 32, 56, 0.20)',
            toast: '0 12px 32px rgba(16, 32, 56, 0.24)'
          },
          borderRadius: {
            app: '18px',
            smapp: '11px'
          },
          keyframes: {
            up: {
              '0%': { opacity: '0', transform: 'translateY(5px)' },
              '100%': { opacity: '1', transform: 'translateY(0)' }
            }
          },
          animation: {
            up: 'up 0.2s ease'
          }
        }
      }
    };
