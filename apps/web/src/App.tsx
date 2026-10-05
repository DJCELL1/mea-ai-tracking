import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useMe } from './api/hooks';
import { useFoodStats } from './components/FoodImport';
import { api } from './lib/api';
import { SetupAccount, SetupFoods } from './pages/Setup';
import { ApiError } from './lib/api';
import { Add } from './pages/Add';
import { Fasting } from './pages/Fasting';
import { FoodEditor } from './pages/FoodEditor';
import { Foods } from './pages/Foods';
import { History } from './pages/History';
import { Login } from './pages/Login';
import { RecipeEditor } from './pages/RecipeEditor';
import { Settings } from './pages/Settings';
import { Today } from './pages/Today';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function TabBar() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <div className="tabbar">
      <nav aria-label="Main">
        <NavLink to="/" end className={cls}>
          <span className="ico">◎</span>Today
        </NavLink>
        <NavLink to="/foods" className={cls}>
          <span className="ico">☰</span>Foods
        </NavLink>
        <NavLink to="/add" className={({ isActive }) => `add ${isActive ? 'active' : ''}`} aria-label="Add food">
          <span className="ico">＋</span>
        </NavLink>
        <NavLink to="/history" className={cls}>
          <span className="ico">▤</span>History
        </NavLink>
        <NavLink to="/settings" className={cls}>
          <span className="ico">⚙</span>Settings
        </NavLink>
      </nav>
    </div>
  );
}

const SKIP_KEY = 'mea:skipFoodSetup';
function skippedFoodSetup() {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function App() {
  const { data: me, error, isLoading } = useMe();
  const online = useOnline();
  const loggedOut = error instanceof ApiError && error.status === 401;
  const { data: setup } = useQuery({
    queryKey: ['setupStatus'],
    queryFn: () => api.get<{ needsAccount: boolean; setupCodeConfigured: boolean }>('/setup/status'),
    enabled: loggedOut,
  });
  const { data: foodStats } = useFoodStats(!!me);
  const [skipFoods, setSkipFoods] = useState(skippedFoodSetup);

  if (isLoading) return <div className="spinner" style={{ marginTop: '40vh' }} />;
  if (!me) {
    if (loggedOut) {
      if (!setup) return <div className="spinner" style={{ marginTop: '40vh' }} />;
      return setup.needsAccount ? <SetupAccount codeConfigured={setup.setupCodeConfigured} /> : <Login />;
    }
    return (
      <main className="app">
        <div className="banner error">{online ? "Can't reach Mea right now." : "You're offline and Mea hasn't been opened on this device yet."}</div>
      </main>
    );
  }

  if (foodStats && foodStats.afcdFoods === 0 && !skipFoods) {
    return (
      <SetupFoods
        onSkip={() => {
          try {
            localStorage.setItem(SKIP_KEY, '1');
          } catch {
            /* ignore */
          }
          setSkipFoods(true);
        }}
      />
    );
  }

  return (
    <>
      <main className="app">
        {!online && (
          <div className="banner warn small" style={{ marginBottom: 12 }}>
            Offline: showing saved data. Logging needs a connection.
          </div>
        )}
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/add" element={<Add />} />
          <Route path="/foods" element={<Foods />} />
          <Route path="/foods/new" element={<FoodEditor />} />
          <Route path="/foods/:id" element={<FoodEditor />} />
          <Route path="/recipes/new" element={<RecipeEditor />} />
          <Route path="/recipes/:id" element={<RecipeEditor />} />
          <Route path="/history" element={<History />} />
          <Route path="/fasting" element={<Fasting />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </>
  );
}
