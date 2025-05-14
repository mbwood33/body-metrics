// src/components/Signup.jsx
import React, { useRef, useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

const Signup = () => {
    const emailRef = useRef();
    const passwordRef = useRef();
    const passwordConfirmRef = useRef();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Basic validation
        if (passwordRef.current.value !== passwordConfirmRef.current.value) {
            return setError('Passwords do not match');
        }

        setError('');   // Clear previous errors
        setLoading(true);   // Disable button during sign up

        try {
            // Use Firebase auth function to create a user
            await createUserWithEmailAndPassword(
                auth,
                emailRef.current.value,
                passwordRef.current.value
            );
            // Handle successful signup (e.g., redirect to dashboard)
            console.log('Signed up successfully!');
        } catch (error) {
            setError('Failed to create an account: ' + error.message);
        }

        setLoading(false);  // Re-enable button
    };

    return (
        <div>
            <h2>Sign Up</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="email">Email:</label>
                    <input type="email" id="email" ref={emailRef} required />
                </div>
                <div>
                    <label htmlFor="password">Password:</label>
                    <input type="password" id="password" ref={passwordRef} required />
                </div>
                <div>
                    <label htmlFor="passwordConfirm">Confirm Password:</label>
                    <input type="password" id="passwordConfirm" ref={passwordConfirmRef} required />
                </div>
                <div>
                    <button type="submit" disabled={loading}>Sign Up</button>
                </div>
            </form>
        </div>
    );
};

export default Signup;