// src/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Create a Context for the authentication state
const AuthContext = createContext();

// Custom hook to use the AuthContext
export const useAuth = () => {
    return useContext(AuthContext);
};

// Auth Provider component
export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);   // State to track if auth state is being loaded

    useEffect(() => {
        // onAuthStateChanged is a Firebase listener that triggers whenever the user's sign-in state changes (login, logout)
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);
        });

        // Clean up the listener when the component unmounts
        return () => unsubscribe();
    }, []); // Empty dependency array to ensure the effect runs only once

    // The value provided by the context
    const value = {
        currentUser,
        loading
    };
    
    // Only render children when loading is false (auth state is known)
    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};