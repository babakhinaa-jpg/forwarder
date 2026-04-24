import { useState } from 'react';
import { I18nProvider } from './i18n.jsx';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';

function AppInner() {
  const [username, setUsername] = useState(() => {
    const token = localStorage.getItem('pf_token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) return payload.username;
      } catch {}
    }
    return null;
  });

  function handleLogout() {
    localStorage.removeItem('pf_token');
    setUsername(null);
  }

  if (!username) return <Login onLogin={setUsername} />;
  return <Dashboard username={username} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <I18nProvider>
      <AppInner />
    </I18nProvider>
  );
}
