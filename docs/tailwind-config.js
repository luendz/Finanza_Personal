    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['DM Sans', 'sans-serif'],
            heading: ['Manrope', 'sans-serif']
          },
          colors: {
            appbg: '#f4f7fb',
            appbg2: '#eaf0f7',
            card: '#ffffff',
            borderc: '#dce5f0',
            text1: '#122033',
            text2: '#526178',
            text3: '#8794a8',
            green1: '#168b63',
            greenbg: '#ecf9f3',
            greentx: '#11694c',
            red1: '#d84d5f',
            redbg: '#fff1f3',
            redtx: '#9f2336',
            blue1: '#2563eb',
            bluebg: '#edf4ff',
            bluetx: '#1d4fbf',
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
