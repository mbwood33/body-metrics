// src/components/Login.jsx
import React, { useRef, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

const Login = () => {
    const emailRef = useRef();
    const passwordRef = useRef();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError('');   // Clear previous errors
        setLoading(true);   // Disable button during login

        try {
            // Use Firebase auth function to sign in a user
            await signInWithEmailAndPassword(
                auth,
                emailRef.current.value,
                passwordRef.current.value
            );
            // Handle successful login (e.g., redirect to dashboard)
            console.log('Logged in successfully!');
        } catch (error) {
            setError('Failed to log in: ' + error.message);
        }

        setLoading(false);  // Re-enable button
    };

    return (
        <div>
            <h2>Login</h2>
            {error && <p>{error}</p>}
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor='email'>Email:</label>    
                    <input type="email" id="email" ref={emailRef} required />
                </div>
                <div>
                    <label htmlFor='password'>Password:</label>
                    <input type="password" id="password" ref={passwordRef} required />
                </div>
                <button type="submit" disabled={loading}>Log In</button>
            </form>
        </div>
    );
};

export default Login;