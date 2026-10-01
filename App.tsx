import { useState, useEffect, useCallback } from 'react';
import Hub from '@/components/Hub';
import GameSelect from '@/components/GameSelect';
import RegistrationModal from '@/components/RegistrationModal';
import ArcadeGame from '@/components/ArcadeGame';
import ResultScreen from '@/components/ResultScreen';
import OwnerDashboard from '@/components/OwnerDashboard';
import { useTenant } from '@/hooks/useTenant';
import { supabase } from '@/lib/supabase';
import { initAudio } from '@/lib/audio';
import type { ScreenName, GameType, CustomerData } from '@/lib/types';
import { MAX_OFFICIAL_TRIES, COOLDOWN_HOURS, sanitizePhoneKey, DEFAULT_STORE_SETTINGS } from '@/lib/types';

const EMPTY_CUSTOMER: CustomerData = {
  name: '', phone: '', email: '', promo_consent: 'YES',
  tries_used: -1, last_played_time: 0, has_won: false, win_code: '',
  status: 'PENDING', score: 0,
};

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const tenantId = urlParams.get('tenant') || 'default_store';
  const tableId = urlParams.get('table') || 'Table-1';

  const { settings, leads, analytics, loading } = useTenant(tenantId);

  const [screen, setScreen] = useState<ScreenName>('hub');
  const [selectedGame, setSelectedGame] = useState<GameType>('snake');
  const [customerData, setCustomerData] = useState<CustomerData>(EMPTY_CUSTOMER);
  const [lastResult, setLastResult] = useState<{ won: boolean; score: number }>({ won: false, score: 0 });
  const [ownerPasswordInput, setOwnerPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const showScreen = useCallback((s: ScreenName) => setScreen(s), []);

  const handlePlayClick = () => {
    initAudio();
    showScreen('gameSelect');
  };

  const handleGameConfirm = async (game: GameType) => {
    setSelectedGame(game);
    initAudio();

    if (customerData.phone) {
      await checkCustomerStatusAndProceed();
    } else {
      showScreen('registration');
    }
  };

  const checkCustomerStatusAndProceed = async () => {
    const leadKey = sanitizePhoneKey(customerData.phone);
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('lead_key', leadKey)
      .maybeSingle();

    let cd = customerData;
    if (data) {
      cd = {
        name: data.name,
        phone: data.phone,
        email: data.email,
        promo_consent: data.promo_consent,
        tries_used: data.tries_used,
        last_played_time: data.last_played_time,
        has_won: data.has_won,
        win_code: data.win_code,
        status: data.status || 'PENDING',
        score: data.score || 0,
      };
      setCustomerData(cd);
    }

    const now = Date.now();
    const timePassed = now - (cd.last_played_time || 0);
    const cooldownMs = COOLDOWN_HOURS * 60 * 60 * 1000;

    if (cd.tries_used >= MAX_OFFICIAL_TRIES - 1 && timePassed < cooldownMs) {
      // Cooldown active — ResultScreen will show "Out of Tries" since tries_used >= MAX_OFFICIAL_TRIES
      setLastResult({ won: false, score: 0 });
      setCustomerData({ ...cd, tries_used: MAX_OFFICIAL_TRIES });
      showScreen('result');
      return;
    }

    if (timePassed >= cooldownMs) {
      cd = { ...cd, tries_used: -1, has_won: false, win_code: '' };
      setCustomerData(cd);
    }

    showScreen('game');
  };

  const handleVerified = (data: CustomerData) => {
    setCustomerData(data);
    showScreen('game');
  };

  const handleGameEnd = (won: boolean, score: number, updatedCustomer: CustomerData) => {
    setCustomerData(updatedCustomer);
    setLastResult({ won, score });
    showScreen('result');
  };

  const handleNextRound = () => {
    showScreen('game');
  };

  const handleOwnerLogin = () => {
    if (ownerPasswordInput.trim() === settings.store_password) {
      setPasswordError('');
      setOwnerPasswordInput('');
      showScreen('ownerDashboard');
    } else {
      setPasswordError('Incorrect store password!');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-400 font-semibold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center items-start sm:items-center" style={{ minHeight: '100dvh' }}>
      <div className="w-full max-w-[480px] bg-slate-50 shadow-lg flex flex-col relative overflow-hidden sm:rounded-[28px] sm:border sm:border-slate-200 sm:my-5 sm:min-h-[850px]" style={{ minHeight: '100dvh' }}>
        {/* Top status bar for game */}
        {screen === 'game' && (
          <div className="flex justify-between items-center px-5 py-3 bg-white text-xs font-semibold border-b border-slate-200 text-slate-800">
            <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]">Player: {customerData.name}</span>
            <span className="text-sky-600 font-extrabold">Score: {0}/{settings.target_score}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase text-white ${customerData.tries_used < 0 ? 'bg-sky-500' : 'bg-red-400'}`}>
              {customerData.tries_used < 0 ? 'Practice Round' : `Official Try ${customerData.tries_used + 1}/${MAX_OFFICIAL_TRIES}`}
            </span>
          </div>
        )}

        {screen === 'hub' && (
          <Hub
            settings={settings}
            onPlayClick={handlePlayClick}
            onAdminClick={() => showScreen('ownerLogin')}
          />
        )}

        {screen === 'gameSelect' && (
          <GameSelect
            onConfirm={handleGameConfirm}
            onBack={() => showScreen('hub')}
          />
        )}

        {screen === 'registration' && (
          <RegistrationModal
            tenantId={tenantId}
            tableId={tableId}
            onVerified={handleVerified}
            onBack={() => showScreen('gameSelect')}
          />
        )}

        {screen === 'game' && (
          <ArcadeGame
            gameType={selectedGame}
            customerData={customerData}
            settings={settings}
            tenantId={tenantId}
            tableId={tableId}
            onGameEnd={handleGameEnd}
            onQuit={() => showScreen('hub')}
          />
        )}

        {screen === 'result' && (
          <ResultScreen
            won={lastResult.won}
            score={lastResult.score}
            customerData={customerData}
            settings={settings}
            onNextRound={handleNextRound}
            onBackToHub={() => showScreen('hub')}
          />
        )}

        {screen === 'ownerLogin' && (
          <div className="fixed inset-0 bg-slate-50 z-[200] flex justify-center items-center p-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-[420px] w-full shadow-lg">
              <h3 className="text-red-400 text-center text-xl font-bold">🔐 Store Owner Portal Login</h3>
              <p className="text-[13px] text-slate-500 text-center mb-5">Enter your store manager password to edit offers.</p>
              {passwordError && <p className="text-red-500 text-sm text-center mb-3">{passwordError}</p>}
              <div className="mb-4">
                <label className="block mb-1.5 text-[13px] font-semibold text-slate-500">Store Password (default: store123)</label>
                <input
                  type="password"
                  value={ownerPasswordInput}
                  onChange={(e) => setOwnerPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-800 focus:border-red-400 focus:bg-white focus:outline-none transition"
                />
              </div>
              <button onClick={handleOwnerLogin} className="w-full py-3.5 rounded-xl bg-gradient-to-br from-red-400 to-orange-400 text-white font-bold text-[15px] shadow-lg shadow-red-400/30">
                Login to Dashboard
              </button>
              <button onClick={() => { setPasswordError(''); showScreen('hub'); }} className="w-full py-3.5 rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 text-slate-700 font-bold text-[15px] mt-2.5">
                Back to Hub
              </button>
            </div>
          </div>
        )}

        {screen === 'ownerDashboard' && (
          <OwnerDashboard
            tenantId={tenantId}
            settings={settings}
            leads={leads}
            analytics={analytics}
            onBack={() => showScreen('hub')}
            onLogout={() => showScreen('hub')}
          />
        )}
      </div>
    </div>
  );
}
