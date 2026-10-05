import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useMe } from './api/hooks';
import { ApiError } from './lib/api';
import { Add } from './pages/Add';
import { Fasting } from './pages/Fasting';
import { FoodEditor } from './pages/FoodEditor';
import { Foods } from './pages/Foods';
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

export function App() {
  const { data: me, error, isLoading } = useMe();
  const online = useOnline();

  if (isLoading) return <div className="spinner" style={{ marginTop: '40vh' }} />;
  if (!me) {
    if (error instanceof ApiError && error.status === 401) return <Login />;
    return (
      <main className="app">
        <div className="banner error">{online ? "Can't reach Mea right now." : "You're offline and Mea hasn't been opened on this device yet."}</div>
      </main>
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
          <Route path="/history" element={<div className="empty">History and charts arrive in phase 5.</div>} />
          <Route path="/fasting" element={<Fasting />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <TabBar />
    </>
  );
}
