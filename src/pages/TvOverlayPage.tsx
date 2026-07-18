import React, { useState, useEffect } from 'react';
import { supabase, fetchOccupiedTables } from '../services/supabaseService';
import { useStore } from '../contexts/StoreContext';
import { Maximize, Minimize } from 'lucide-react';

const TvOverlayPage: React.FC = () => {
  const { currentStore } = useStore();
  const [liveVideoUrl, setLiveVideoUrl] = useState<string>(localStorage.getItem('tv_live_video') || '');
  const [showRaffle, setShowRaffle] = useState(false);
  const [raffleWinner, setRaffleWinner] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFooterAd, setShowFooterAd] = useState(false);

  useEffect(() => {
    // Aparece a cada 60s, dura 10s
    const adInterval = setInterval(() => {
      setShowFooterAd(true);
      setTimeout(() => setShowFooterAd(false), 10000);
    }, 60000);
    return () => clearInterval(adInterval);
  }, []);

  // Ouve a mudança de URL e Gol do Brasil
  useEffect(() => {
    if (!currentStore) return;

    const channel = supabase.channel('tv_overlay_events')
      .on('broadcast', { event: 'set_live_video' }, async (payload) => {
        try {
          if (payload.payload && typeof payload.payload.url === 'string') {
            setLiveVideoUrl(payload.payload.url);
            localStorage.setItem('tv_live_video', payload.payload.url);
          }
        } catch (e) {
          console.error('Error handling set_live_video', e);
        }
      })
      .on('broadcast', { event: 'brazil_goal' }, async () => {
        try {
          const tables = await fetchOccupiedTables(currentStore.id);
          if (tables && tables.length > 0) {
            const randomIndex = Math.floor(Math.random() * tables.length);
            const winner = tables[randomIndex];
            
            // Toca a sirene
            const audio = new Audio('https://www.myinstants.com/media/sounds/air-horn-club-sample_1.mp3');
            audio.volume = 1.0;
            audio.loop = true;
            audio.play().catch(e => console.error("Auto-play de áudio bloqueado:", e));

            setRaffleWinner(winner);
            setShowRaffle(true);

            setTimeout(() => {
              setShowRaffle(false);
              setRaffleWinner(null);
              audio.pause();
            }, 10000);
          }
        } catch (err) {
          console.error('Error in raffle:', err);
        }
      })
      .on('broadcast', { event: 'reload_tv' }, () => {
        window.location.reload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStore]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const getEmbedUrl = (url: string) => {
    try {
      if (!url || typeof url !== 'string') return '';
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let videoId = '';
        if (url.includes('youtu.be')) {
          videoId = url.split('youtu.be/')[1].split('?')[0];
        } else if (url.includes('/live/')) {
          videoId = url.split('/live/')[1].split('?')[0];
        } else if (url.includes('v=')) {
          const parts = url.split('v=');
          videoId = parts.length > 1 ? (parts[1].split('&')[0] || '') : '';
        }
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=1&modestbranding=1&rel=0`;
      }
      if (url.includes('twitch.tv')) {
        const parts = url.split('twitch.tv/');
        const channel = parts.length > 1 ? (parts[1].split('?')[0] || '') : '';
        return `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}&autoplay=true&muted=false`;
      }
      return url;
    } catch (err) {
      console.error('Error generating embed url', err);
      return '';
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative flex items-center justify-center">
      {/* Background Video Layer */}
      {liveVideoUrl ? (
        <div className="absolute inset-0 z-0">
          <iframe 
            src={getEmbedUrl(liveVideoUrl)}
            className="w-full h-full border-none"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          <p className="text-white/20 text-3xl font-bold uppercase tracking-widest">Aguardando Transmissão...</p>
        </div>
      )}

      {/* Controls Overlay (Hover to see) */}
      <div className="absolute top-4 right-4 z-50 opacity-20 hover:opacity-100 transition-opacity flex gap-2">
        <button 
          onClick={toggleFullscreen}
          className="bg-black/50 p-3 rounded-full text-white backdrop-blur-sm border border-white/20 hover:bg-black/80"
        >
          {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>
      </div>

      {/* Goal Animation Overlay */}
      {showRaffle && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-50 animate-in fade-in duration-500">
          <div className="bg-surface p-12 rounded-3xl shadow-2xl text-center transform scale-110 animate-bounce-slow border-4 border-green-500 relative overflow-hidden">
            <div className="absolute inset-0 bg-yellow-400 opacity-20 animate-pulse"></div>
            <h1 className="text-6xl font-display text-green-500 mb-6 drop-shadow-md">🇧🇷 GOL DO BRASIL! 🇧🇷</h1>
            <h2 className="text-4xl text-text-light mb-8">Sorteio de Brinde Surpresa!</h2>
            <div className="bg-primary/20 p-8 rounded-2xl border-2 border-primary">
              <p className="text-2xl text-text-light mb-2">Mesa Sorteada:</p>
              <p className="text-8xl font-bold text-primary drop-shadow-lg">MESA {raffleWinner}</p>
            </div>
            <p className="mt-8 text-xl text-text-dark">Parabéns aos sortudos! Solicitem o prêmio ao garçom.</p>
          </div>
        </div>
      )}

      {/* Footer Promotional Banner */}
      {showFooterAd && (
        <div className="absolute bottom-[1px] left-0 w-full bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 border-t-[6px] border-yellow-400 py-3 z-30 opacity-95 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-8 duration-700">
          <div className="flex justify-center items-center gap-6">
             <span className="text-yellow-400 text-5xl animate-bounce">🇧🇷</span>
             <p className="text-white text-[27px] font-black tracking-widest uppercase drop-shadow-[0_4px_4px_rgba(0,0,0,0.9)]">
               GOL DO BRASIL MERECE SORTEIO! FIQUE ATENTO!
             </p>
             <span className="text-yellow-400 text-5xl animate-bounce">🎁</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TvOverlayPage;
