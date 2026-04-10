    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Nunito Sans', 'sans-serif'],
            heading: ['Nunito', 'sans-serif']
          },
          colors: {
            appbg: '#f6f7fb',
            appbg2: '#eef2f7',
            card: '#ffffff',
            borderc: '#e4e8f0',
            text1: '#182033',
            text2: '#5f6b85',
            text3: '#98a2b3',
            green1: '#2f9e6f',
            greenbg: '#eefaf4',
            greentx: '#1f6f50',
            red1: '#dc5a5a',
            redbg: '#fff3f3',
            redtx: '#9b2c2c',
            blue1: '#3f6fd8',
            bluebg: '#eef3ff',
            bluetx: '#244caa',
            accent: '#3f6fd8'
          },
          boxShadow: {
            soft: '0 1px 4px rgba(0,0,0,0.06)',
            modal: '0 8px 40px rgba(0,0,0,0.15)',
            toast: '0 4px 20px rgba(0,0,0,0.2)'
          },
          borderRadius: {
            app: '14px',
            smapp: '9px'
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
