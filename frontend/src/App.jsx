import { useState, useEffect } from 'react';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
  const [username, setUsername] = useState(() => {
    const token = localStorage.getItem('pf_token');
    // Decode username from JWT payload without validation (server validates)
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) return payload.username;
      } catch {}
    }
    return null;
  });

  function handleLogin(user) { setUsername(user); }

  function handleLogout() {
    localStorage.removeItem('pf_token');
    setUsername(null);
  }

  if (!username) return <Login onLogin={handleLogin} />;
  return <Dashboard username={username} onLogout={handleLogout} />;
}
