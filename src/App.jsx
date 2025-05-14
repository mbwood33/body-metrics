// src/App.jsx
import './App.css'
import Signup from './components/Signup.jsx';
import Login from './components/Login.jsx';
import BodyMetricsDashboard from './components/BodyMetricsDashboard.jsx';
import { useAuth } from './AuthContext.jsx';
import { auth } from './firebase';
import { signOut} from 'firebase/auth';
import { useState } from 'react';

function App() {
  const { currentUser, loading } = useAuth();

  // Wait until the auth state is loaded
  if (loading) {
    return <div>Loading...</div>;
  }

  const handleLogout = async () => {
    setError('');
    try {
      await signOut(auth);
      console.log("Logged out successfully!");
    } catch (error) {
      setError('Failed to log out: ' + error.message);
      console.error('Logout Error:', error);
    }
  };
  const [error, setError] = useState('');

  return (
    <>
      <div className='app-container'>
        <img src="/body_metrics_logo_cropped.png" alt="Body Metrics Logo" className='app-logo' />
      </div>
      {/* Display components based on auth state */}
      {currentUser ? (
        <div>
          <h1>Welcome, {currentUser.email}</h1>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button onClick={handleLogout}>Logout</button>
          <BodyMetricsDashboard />
        </div>
      ) : (
        <div>
          <h1>Welcome to Body Metrics</h1>
          {/* TODO: Add routing here to show only Signup OR Login */}
          <Signup />
          <br />
          <Login />
        </div>
      )}
    </>
  );
}

export default App
